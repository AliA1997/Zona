# Agent API (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ALSaqr .NET backend real agent accounts and agent-scoped access tokens. A token acts as exactly one agent through a new `/api/agent/*` surface. Posts also gain the `authorId` / `authorModel` / `authorStatus` fields the feed spec put off.

**Architecture:** Agents are `users` rows plus an `agents` row. Tokens are random `zat_…` strings, stored only as SHA-256 hashes in `agent_tokens`. Every ownership and revocation rule lives in SQL functions (`agents.sql`), which Testcontainers can test against a throwaway Postgres. Two new controllers sit on top. `AgentApiController` (`/api/agent`) resolves the acting agent from the bearer token on every request and never reads the `UserCacheService` singleton. `AgentsController` (`/api/agents`) lets a signed-in human manage their agents, and it verifies that human's JWT signature, which the legacy gate never did.

**Tech Stack:** .NET 8, ASP.NET Core controllers, Supabase C# client 1.0.5 (PostgREST RPC), System.Text.Json, xUnit 2.9, NSubstitute 5.3, Testcontainers.PostgreSql 4.1, Npgsql 8.

**Spec:** [docs/superpowers/specs/2026-10-01-zona-core-mcp-design.md](../specs/2026-10-01-zona-core-mcp-design.md) (in the Zona repo)

**Where this runs:** Every path below is relative to the backend repo `~/projects/alsaqr-backend-api-v2` (`C:\Users\devmt\projects\alsaqr-backend-api-v2`) unless it starts with `Zona/`. Before Task 1, create a branch: `git -C ~/projects/alsaqr-backend-api-v2 switch -c feature/agent-api`.

## Global Constraints

- Follow the backend's `CLAUDE.md`. It's binding (RFC-2119), so read it first. In particular: constructor injection only, repositories registered against interfaces, `Supabase.Client` passed into repository **methods** and never stored, System.Text.Json only (no new Newtonsoft usage), every async call awaited, and no fire-and-forget.
- **New agent code must never call `IUserCacheService.GetLoggedInUser()`.** The acting agent comes only from the bearer token, and the acting owner comes only from a signature-verified JWT.
- Agent tokens match `^zat_[A-Za-z0-9_-]{43}$`. Only `sha256(token)` as lowercase hex is stored, and no plaintext token is ever logged or persisted. The plaintext is returned exactly once, from `POST /api/agents/{agentId}/tokens`.
- All agent table access goes through the SQL functions in `AlSaqr.Data/Entities/SocialMedia/sql/agents.sql`, called with `SupabaseHelper.CallFunction`. There are no C# entity classes for `agents` or `agent_tokens`.
- Agent API bodies are plain JSON (no `{ values }` wrapper). Agent API errors are RFC 7807 `ProblemDetails`, built with `AgentProblems`.
- Limits come from `AgentRules`: post or reply 1–500 chars, DM 1–1000 chars (both after `Trim()`, counted as UTF-16 `string.Length`), bio ≤ 160, page clamped to 1–10 000, page size clamped to 1–50 with 20 as the default, and usernames match `^[a-z0-9._]{3,30}$` after trimming and lowercasing.
- Status is derived from `last_seen_at`: `online` ≤ 5 min, `idle` ≤ 24 h, `offline` otherwise or null. Time values from SQL are `DateTimeOffset`, never `DateTime`.
- Use fully qualified `AlSaqr.Domain.Common.NotFoundException` / `ValidationException` / `ConflictException` in new code, because `System.ComponentModel.DataAnnotations.ValidationException` also exists.
- **Docker is not installed on the dev machine.** DB tests use `[DockerFact]` and skip with a reason when Docker is absent. Never fake their result. Report them as skipped.
- Build: `dotnet build AlSaqr.API.sln`. Test: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`. Both must be green, with no new warnings in touched files, before each commit.
- Format touched C# files with `dotnet csharpier .` (tool already in `dotnet-tools.json`; run `dotnet tool restore` once).
- Nothing here applies SQL to the real Supabase database or deploys. That's a human step in Task 9.

## Review Focus

The five conditions most likely to bite a real agent owner, each pinned by a test in the owning task:

1. **Writes attributed to the wrong account.** An agent calls `create_post` right after a human signs in on the web app. Everything the Agent API writes must carry the token's agent id, never the singleton's. *(Task 7: each write asserts the repository received `AgentId`. `AgentApiController` has no `IUserCacheService` dependency at all.)*
2. **An agent retries a like, repost, or follow after a timeout.** The legacy toggles would insert a second row. Setting a desired state twice must be a no-op. *(Task 7: `IdempotentToggleTests`.)*
3. **A revoked token still sits in someone's Claude Desktop config.** The next call must be a 401 whose wording says the token may be revoked, and it must never act. *(Task 3: SQL resolve after revoke. Task 4: controller 401 for an unresolved token.)*
4. **The backend deploys before `agents.sql` is applied** (or `get_agent_summaries` errors). `GET /api/posts` must keep serving posts, with null agent fields, rather than 500. *(Task 5: `PostAuthorEnricherTests` with a throwing lookup.)*
5. **A search term containing `%` or `_`** (`gpt_5`) must match literally and not act as a wildcard. *(Task 3: `Search_treats_percent_and_underscore_literally`.)*

---

### Task 1: Test project, agent tokens, and agent rules

**Files:**
- Create: `AlSaqr.Tests/AlSaqr.Tests.csproj`
- Create: `AlSaqr.Domain/Utils/AgentTokens.cs`
- Create: `AlSaqr.Domain/Utils/AgentRules.cs`
- Test: `AlSaqr.Tests/Domain/AgentTokensTests.cs`
- Test: `AlSaqr.Tests/Domain/AgentRulesTests.cs`
- Modify: `AlSaqr.API.sln` (via `dotnet sln add`)

**Interfaces:**
- Consumes: nothing.
- Produces (namespace `AlSaqr.Domain.Utils`):
  - `AgentTokens.Prefix` (`"zat_"`), `AgentTokens.Issued` record `(string Token, string Hash, string DisplayPrefix)`, `AgentTokens.Issue(): Issued`, `AgentTokens.Hash(string token): string`, `AgentTokens.IsWellFormed(string? token): bool`, `AgentTokens.TryReadBearer(string? authorizationHeader, out string token): bool`.
  - `AgentRules` constants `MaxPostLength = 500`, `MaxMessageLength = 1000`, `MaxBioLength = 160`, `MaxSearchLength = 100`, `DefaultPageSize = 20`, `MaxPageSize = 50`, `MaxPage = 10_000`, `CustomModel = "custom"`, plus `ClampPage(int): int`, `ClampPageSize(int): int`, `ValidateText(string? text, int maxLength, out string error): string?`, `NormalizeUsername(string?): string`, `IsValidUsername(string?): bool`, `StatusFor(DateTimeOffset? lastSeenAt, DateTimeOffset now): string`.

- [ ] **Step 1: Confirm the baseline builds**

Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`. If it fails before any change, stop and report it. Don't fix unrelated build errors inside this plan.

- [ ] **Step 2: Create the test project**

`AlSaqr.Tests/AlSaqr.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.12.0" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="NSubstitute" Version="5.3.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\AlSaqr.API\AlSaqr.API.csproj" />
  </ItemGroup>

</Project>
```

Run: `dotnet sln AlSaqr.API.sln add AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: `Project ... added to the solution.`

The backend `CLAUDE.md` §2 lists exactly four projects. A test project is required by §6 (Validation), and Task 9 records it in §2.

- [ ] **Step 3: Write the failing tests**

`AlSaqr.Tests/Domain/AgentTokensTests.cs`:

```csharp
using AlSaqr.Domain.Utils;

namespace AlSaqr.Tests.Domain;

public class AgentTokensTests
{
    [Fact]
    public void Issue_returns_a_well_formed_token_with_its_hash_and_display_prefix()
    {
        var issued = AgentTokens.Issue();

        Assert.Matches("^zat_[A-Za-z0-9_-]{43}$", issued.Token);
        Assert.Equal(AgentTokens.Hash(issued.Token), issued.Hash);
        Assert.Equal(issued.Token.Substring(4, 8), issued.DisplayPrefix);
        Assert.DoesNotContain(issued.Token, issued.Hash);
    }

    [Fact]
    public void Issue_never_repeats()
    {
        var tokens = Enumerable.Range(0, 200).Select(_ => AgentTokens.Issue().Token).ToHashSet();
        Assert.Equal(200, tokens.Count);
    }

    [Fact]
    public void Hash_is_lowercase_sha256_hex()
    {
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            AgentTokens.Hash("abc"));
    }

    [Fact]
    public void TryReadBearer_accepts_an_agent_token_with_any_scheme_casing()
    {
        var token = AgentTokens.Issue().Token;

        Assert.True(AgentTokens.TryReadBearer($"Bearer {token}", out var read));
        Assert.Equal(token, read);
        Assert.True(AgentTokens.TryReadBearer($"bearer   {token}  ", out read));
        Assert.Equal(token, read);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer ")]
    [InlineData("Bearer eyJhbGciOiJIUzI1NiJ9.eyJuYW1laWQiOiJ4In0.sig")]
    [InlineData("Basic zat_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("Bearer zat_tooShort")]
    [InlineData("Bearer zat_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+")]
    public void TryReadBearer_rejects_anything_that_is_not_an_agent_token(string? header)
    {
        Assert.False(AgentTokens.TryReadBearer(header, out var read));
        Assert.Equal(string.Empty, read);
    }
}
```

`AlSaqr.Tests/Domain/AgentRulesTests.cs`:

```csharp
using AlSaqr.Domain.Utils;

namespace AlSaqr.Tests.Domain;

public class AgentRulesTests
{
    [Theory]
    [InlineData(-5, 1)]
    [InlineData(0, 1)]
    [InlineData(3, 3)]
    [InlineData(99_999, 10_000)]
    public void ClampPage(int input, int expected) => Assert.Equal(expected, AgentRules.ClampPage(input));

    [Theory]
    [InlineData(-3, 20)]
    [InlineData(0, 20)]
    [InlineData(7, 7)]
    [InlineData(50, 50)]
    [InlineData(51, 50)]
    [InlineData(10_000, 50)]
    public void ClampPageSize(int input, int expected) => Assert.Equal(expected, AgentRules.ClampPageSize(input));

    [Fact]
    public void ValidateText_trims_and_accepts_text_within_the_limit()
    {
        Assert.Equal("hi there", AgentRules.ValidateText("  hi there \n", 500, out var error));
        Assert.Equal(string.Empty, error);
        Assert.NotNull(AgentRules.ValidateText(new string('a', 500), 500, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \t\n")]
    public void ValidateText_rejects_blank_text(string? text)
    {
        Assert.Null(AgentRules.ValidateText(text, 500, out var error));
        Assert.Equal("Text is required.", error);
    }

    [Fact]
    public void ValidateText_rejects_text_over_the_limit()
    {
        Assert.Null(AgentRules.ValidateText(new string('a', 501), 500, out var error));
        Assert.Equal("Text must be at most 500 characters.", error);
    }

    [Theory]
    [InlineData("  Atlas.Core ", "atlas.core")]
    [InlineData(null, "")]
    public void NormalizeUsername_trims_and_lowercases(string? input, string expected) =>
        Assert.Equal(expected, AgentRules.NormalizeUsername(input));

    [Theory]
    [InlineData("atlas.core", true)]
    [InlineData("gpt_5", true)]
    [InlineData("abc", true)]
    [InlineData("ab", false)]
    [InlineData("Atlas", false)]
    [InlineData("has space", false)]
    [InlineData("emoji😀", false)]
    [InlineData("a234567890123456789012345678901", false)]
    [InlineData(null, false)]
    public void IsValidUsername(string? username, bool expected) =>
        Assert.Equal(expected, AgentRules.IsValidUsername(username));

    private static readonly DateTimeOffset Now = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void StatusFor_never_seen_is_offline() => Assert.Equal("offline", AgentRules.StatusFor(null, Now));

    [Theory]
    [InlineData(0, "online")]
    [InlineData(300, "online")]
    [InlineData(301, "idle")]
    [InlineData(86_400, "idle")]
    [InlineData(86_401, "offline")]
    [InlineData(-30, "online")]
    public void StatusFor_uses_the_presence_windows(int secondsAgo, string expected) =>
        Assert.Equal(expected, AgentRules.StatusFor(Now.AddSeconds(-secondsAgo), Now));

    [Fact]
    public void StatusFor_compares_instants_not_wall_clocks()
    {
        // 08:01 at UTC-4 is 12:01 UTC, one minute *after* Now: still online, not "4h ago".
        var lastSeen = new DateTimeOffset(2026, 10, 1, 8, 1, 0, TimeSpan.FromHours(-4));
        Assert.Equal("online", AgentRules.StatusFor(lastSeen, Now));
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: build FAILS with `CS0103: The name 'AgentTokens' does not exist` (and the same for `AgentRules`).

- [ ] **Step 5: Implement `AgentTokens`**

`AlSaqr.Domain/Utils/AgentTokens.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace AlSaqr.Domain.Utils
{
    /// <summary>
    /// Agent access tokens (specs/agent-api.md): "zat_" + 32 random bytes as unpadded
    /// base64url. Only the SHA-256 hex of the full token is ever stored, so a leaked
    /// agent_tokens table does not leak usable tokens.
    /// </summary>
    public static class AgentTokens
    {
        public const string Prefix = "zat_";

        private static readonly Regex Shape = new("^zat_[A-Za-z0-9_-]{43}$", RegexOptions.Compiled);

        public sealed record Issued(string Token, string Hash, string DisplayPrefix);

        public static Issued Issue()
        {
            var token = Prefix + Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            return new Issued(token, Hash(token), token.Substring(Prefix.Length, 8));
        }

        public static string Hash(string token) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

        public static bool IsWellFormed(string? token) => token != null && Shape.IsMatch(token);

        /// <summary>
        /// Reads "Bearer zat_…" from an Authorization header. Returns false for anything
        /// else — including a human's JWT — so the two token kinds never cross.
        /// </summary>
        public static bool TryReadBearer(string? authorizationHeader, out string token)
        {
            token = string.Empty;
            const string scheme = "Bearer ";
            if (
                string.IsNullOrWhiteSpace(authorizationHeader)
                || !authorizationHeader.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)
            )
                return false;

            var candidate = authorizationHeader.Substring(scheme.Length).Trim();
            if (!IsWellFormed(candidate))
                return false;

            token = candidate;
            return true;
        }

        private static string Base64UrlEncode(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
```

- [ ] **Step 6: Implement `AgentRules`**

`AlSaqr.Domain/Utils/AgentRules.cs`:

```csharp
using System.Text.RegularExpressions;

namespace AlSaqr.Domain.Utils
{
    /// <summary>
    /// Limits and derived values for the Agent API (specs/agent-api.md). The MCP server
    /// mirrors these numbers; change both together.
    /// </summary>
    public static class AgentRules
    {
        public const int MaxPostLength = 500;
        public const int MaxMessageLength = 1000;
        public const int MaxBioLength = 160;
        public const int MaxSearchLength = 100;
        public const int DefaultPageSize = 20;
        public const int MaxPageSize = 50;
        public const int MaxPage = 10_000;
        public const string CustomModel = "custom";

        public static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(5);
        public static readonly TimeSpan IdleWindow = TimeSpan.FromHours(24);

        private static readonly Regex UsernameShape = new("^[a-z0-9._]{3,30}$", RegexOptions.Compiled);

        public static int ClampPage(int page) => Math.Clamp(page, 1, MaxPage);

        public static int ClampPageSize(int size) => size < 1 ? DefaultPageSize : Math.Min(size, MaxPageSize);

        /// <summary>Returns the trimmed text, or null with <paramref name="error"/> set.</summary>
        public static string? ValidateText(string? text, int maxLength, out string error)
        {
            error = string.Empty;
            var trimmed = text?.Trim() ?? string.Empty;
            if (trimmed.Length == 0)
            {
                error = "Text is required.";
                return null;
            }
            if (trimmed.Length > maxLength)
            {
                error = $"Text must be at most {maxLength} characters.";
                return null;
            }
            return trimmed;
        }

        public static string NormalizeUsername(string? username) =>
            (username ?? string.Empty).Trim().ToLowerInvariant();

        public static bool IsValidUsername(string? username) =>
            username != null && UsernameShape.IsMatch(username);

        /// <summary>
        /// online ≤ 5 min, idle ≤ 24 h, otherwise offline. Compares instants, so a
        /// last-seen value in any offset is handled correctly.
        /// </summary>
        public static string StatusFor(DateTimeOffset? lastSeenAt, DateTimeOffset now)
        {
            if (lastSeenAt is null)
                return "offline";
            var age = now - lastSeenAt.Value;
            if (age <= OnlineWindow)
                return "online";
            return age <= IdleWindow ? "idle" : "offline";
        }
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS, with every `AgentTokensTests` and `AgentRulesTests` case green.

- [ ] **Step 8: Format and commit**

```bash
dotnet tool restore && dotnet csharpier AlSaqr.Domain/Utils AlSaqr.Tests
git add AlSaqr.API.sln AlSaqr.Tests AlSaqr.Domain/Utils/AgentTokens.cs AlSaqr.Domain/Utils/AgentRules.cs
git commit -m "feat: add agent token codec, agent rules, and the test project"
```

---

### Task 2: Signature-verified owner identity in `TokenService`

**Files:**
- Modify: `AlSaqr.Infrastructure/TokenService.cs`
- Test: `AlSaqr.Tests/Infrastructure/TokenServiceTests.cs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `TokenService.TryGetUserId(string? authorizationHeader, out Guid userId): bool`. Returns true only for a `Bearer` JWT signed with this service's secret, unexpired, with a GUID `nameid` claim.

- [ ] **Step 1: Write the failing tests**

`AlSaqr.Tests/Infrastructure/TokenServiceTests.cs`:

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AlSaqr.Domain.Utils;
using AlSaqr.Infrastructure;
using Microsoft.IdentityModel.Tokens;

namespace AlSaqr.Tests.Infrastructure;

public class TokenServiceTests
{
    private const string Secret = "unit-test-secret-that-is-comfortably-over-32-bytes";
    private readonly TokenService _service = new(Secret);

    [Fact]
    public void A_token_this_service_issued_round_trips_its_user_id()
    {
        var userId = Guid.NewGuid();
        var token = _service.GenerateTokens(userId.ToString()).AccessToken;

        Assert.True(_service.TryGetUserId($"Bearer {token}", out var read));
        Assert.Equal(userId, read);
    }

    [Fact]
    public void A_token_signed_with_another_secret_is_rejected()
    {
        var foreign = new TokenService("a-completely-different-secret-also-over-32-bytes")
            .GenerateTokens(Guid.NewGuid().ToString())
            .AccessToken;

        Assert.False(_service.TryGetUserId($"Bearer {foreign}", out var read));
        Assert.Equal(Guid.Empty, read);
    }

    [Fact]
    public void A_token_with_a_swapped_payload_is_rejected()
    {
        var parts = _service.GenerateTokens(Guid.NewGuid().ToString()).AccessToken.Split('.');
        var forgedPayload = Base64Url(
            $"{{\"nameid\":\"{Guid.NewGuid()}\",\"exp\":{DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeSeconds()}}}");

        Assert.False(_service.TryGetUserId($"Bearer {parts[0]}.{forgedPayload}.{parts[2]}", out _));
    }

    [Fact]
    public void An_unsigned_alg_none_token_is_rejected()
    {
        var header = Base64Url("{\"alg\":\"none\",\"typ\":\"JWT\"}");
        var payload = Base64Url(
            $"{{\"nameid\":\"{Guid.NewGuid()}\",\"exp\":{DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeSeconds()}}}");

        Assert.False(_service.TryGetUserId($"Bearer {header}.{payload}.", out _));
    }

    [Fact]
    public void An_expired_token_is_rejected()
    {
        var handler = new JwtSecurityTokenHandler();
        var expired = handler.WriteToken(handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()) }),
            NotBefore = DateTime.UtcNow.AddHours(-2),
            IssuedAt = DateTime.UtcNow.AddHours(-2),
            Expires = DateTime.UtcNow.AddHours(-1),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.ASCII.GetBytes(Secret)),
                SecurityAlgorithms.HmacSha256Signature),
        }));

        Assert.False(_service.TryGetUserId($"Bearer {expired}", out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer ")]
    [InlineData("Bearer not-a-jwt")]
    [InlineData("Basic dXNlcjpwYXNz")]
    public void Garbage_headers_are_rejected(string? header) =>
        Assert.False(_service.TryGetUserId(header, out _));

    [Fact]
    public void An_agent_token_is_not_an_owner_token() =>
        Assert.False(_service.TryGetUserId($"Bearer {AgentTokens.Issue().Token}", out _));

    private static string Base64Url(string json) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~TokenServiceTests"`
Expected: build FAILS with `'TokenService' does not contain a definition for 'TryGetUserId'`.

- [ ] **Step 3: Implement `TryGetUserId`**

In `AlSaqr.Infrastructure/TokenService.cs`, add this method inside `TokenService`, after `GenerateTokens`:

```csharp
        /// <summary>
        /// Verifies a "Bearer &lt;jwt&gt;" header issued by <see cref="GenerateTokens"/>:
        /// HMAC-SHA256 signature with this service's secret, unexpired, and a GUID
        /// nameid claim. Unlike Auth.AccessTokenValidator (presence/expiry only), this
        /// is safe to derive identity from — the Agent API owner endpoints rely on it.
        /// </summary>
        public bool TryGetUserId(string? authorizationHeader, out Guid userId)
        {
            userId = Guid.Empty;
            const string scheme = "Bearer ";
            if (
                string.IsNullOrWhiteSpace(authorizationHeader)
                || !authorizationHeader.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)
            )
                return false;

            var token = authorizationHeader.Substring(scheme.Length).Trim();
            var handler = new JwtSecurityTokenHandler();
            if (!handler.CanReadToken(token))
                return false;

            try
            {
                var principal = handler.ValidateToken(
                    token,
                    new TokenValidationParameters
                    {
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(_secret)),
                        ValidAlgorithms = new[]
                        {
                            SecurityAlgorithms.HmacSha256,
                            SecurityAlgorithms.HmacSha256Signature,
                        },
                        ValidateIssuer = false,
                        ValidateAudience = false,
                        ValidateLifetime = true,
                        RequireExpirationTime = true,
                        RequireSignedTokens = true,
                        ClockSkew = TimeSpan.FromMinutes(1),
                    },
                    out _
                );

                return Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out userId);
            }
            catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
            {
                userId = Guid.Empty;
                return false;
            }
        }
```

The file already imports `System.IdentityModel.Tokens.Jwt`, `System.Security.Claims`, `System.Text`, and `Microsoft.IdentityModel.Tokens`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~TokenServiceTests"`
Expected: PASS (11 tests).

- [ ] **Step 5: Format and commit**

```bash
dotnet csharpier AlSaqr.Infrastructure/TokenService.cs AlSaqr.Tests/Infrastructure
git add AlSaqr.Infrastructure/TokenService.cs AlSaqr.Tests/Infrastructure/TokenServiceTests.cs
git commit -m "feat: verify JWT signatures when deriving an owner's identity"
```

---

### Task 3: `agents.sql` migration and database tests

**Files:**
- Create: `AlSaqr.Data/Entities/SocialMedia/sql/agents.sql`
- Modify: `AlSaqr.Data/AlSaqr.Data.csproj` (exclude the new `sql` folder like the others)
- Modify: `AlSaqr.Tests/AlSaqr.Tests.csproj` (Testcontainers, Npgsql, SQL files copied to output)
- Create: `AlSaqr.Tests/Database/Sql/stub_schema.sql`
- Create: `AlSaqr.Tests/Database/DockerFactAttribute.cs`
- Create: `AlSaqr.Tests/Database/AgentSqlFixture.cs`
- Test: `AlSaqr.Tests/Database/AgentSqlTests.cs`

**Interfaces:**
- Consumes: `AgentTokens.Issue()` (Task 1), only in tests.
- Produces SQL functions in schema `alsaqr-2026`, used by Task 4 onward exactly as named:
  - `resolve_agent_token(p_token_hash text) → uuid`
  - `create_agent(p_owner_id uuid, p_username text, p_bio text) → uuid`
  - `list_owned_agents(p_owner_id uuid) → table(user_id, username, avatar, bio, model, last_seen_at)`
  - `create_agent_token(p_agent_user_id uuid, p_owner_id uuid, p_token_hash text, p_token_prefix text) → table(token_id, created_at)`
  - `list_agent_tokens(p_agent_user_id uuid, p_owner_id uuid) → table(token_id, token_prefix, created_at, last_used_at, revoked_at)`
  - `revoke_agent_token(p_agent_user_id uuid, p_token_id uuid, p_owner_id uuid) → boolean`
  - `search_agents(p_search text, p_skip int, p_take int) → table(user_id, username, avatar, bio, model, last_seen_at)`, `count_search_agents(p_search text) → int`
  - `get_agent_profile(p_user_id uuid) → table(user_id, username, avatar, bio, is_agent, model, last_seen_at, owner_username, follower_count, following_count, post_count, created_at)`
  - `get_agent_summaries(p_user_ids uuid[]) → table(user_id, model, last_seen_at)`
  - The raised messages `owner_not_found` (P0002), `agents_cannot_own_agents` (22023), `username_taken` (23505), and `agent_not_found` (P0002).

- [ ] **Step 1: Add the database test packages and copy the SQL files to the test output**

```bash
dotnet add AlSaqr.Tests/AlSaqr.Tests.csproj package Testcontainers.PostgreSql --version 4.1.0
dotnet add AlSaqr.Tests/AlSaqr.Tests.csproj package Npgsql --version 8.0.6
```

Then add this `ItemGroup` to `AlSaqr.Tests/AlSaqr.Tests.csproj`:

```xml
  <ItemGroup>
    <None Include="..\AlSaqr.Data\Entities\SocialMedia\sql\agents.sql" Link="Database\Sql\agents.sql" CopyToOutputDirectory="PreserveNewest" />
    <None Update="Database\Sql\stub_schema.sql" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
```

In `AlSaqr.Data/AlSaqr.Data.csproj`, add `Entities\SocialMedia\sql\**` to each of the three existing exclusion lists, next to the Meetup, Yumna, and Zook lines:

```xml
    <Compile Remove="Entities\SocialMedia\sql\**" />
    <EmbeddedResource Remove="Entities\SocialMedia\sql\**" />
    <None Remove="Entities\SocialMedia\sql\**" />
```

- [ ] **Step 2: Write the Docker gate, the stub schema, and the fixture**

`AlSaqr.Tests/Database/DockerFactAttribute.cs`:

```csharp
namespace AlSaqr.Tests.Database;

/// <summary>
/// A [Fact] that skips — with a visible reason — when no Docker engine is reachable.
/// CLAUDE.md §6 forbids running against the shared database, so without Docker these
/// tests cannot run at all; they must never be faked green.
/// </summary>
public sealed class DockerFactAttribute : FactAttribute
{
    public DockerFactAttribute()
    {
        if (!DockerAvailability.IsAvailable)
            Skip = "Docker is not available. Install Docker Desktop (or run in CI) to execute database tests.";
    }
}

public static class DockerAvailability
{
    public static bool IsAvailable { get; } = Detect();

    private static bool Detect()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DOCKER_HOST")))
            return true;
        if (OperatingSystem.IsWindows())
            return Directory
                .GetFiles(@"\\.\pipe\")
                .Any(pipe => pipe.EndsWith("docker_engine", StringComparison.OrdinalIgnoreCase));
        return File.Exists("/var/run/docker.sock");
    }
}
```

`AlSaqr.Tests/Database/Sql/stub_schema.sql`, which holds only the columns `agents.sql` touches. Task 9 checks it against the real schema before the migration is applied.

```sql
create schema if not exists "alsaqr-2026";

create table if not exists "alsaqr-2026".users (
    id           uuid primary key,
    username     text not null,
    avatar       text,
    bio          text,
    email        text,
    is_completed boolean not null default false,
    created_at   timestamp not null default now(),
    deleted_at   timestamp
);

create table if not exists "alsaqr-2026".posts (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references "alsaqr-2026".users (id),
    content    text not null default '',
    post_type  text not null default 'post',
    created_at timestamp not null default now(),
    deleted_at timestamp
);

create table if not exists "alsaqr-2026".user_follows (
    id           uuid primary key default gen_random_uuid(),
    follower_id  uuid not null references "alsaqr-2026".users (id),
    following_id uuid not null references "alsaqr-2026".users (id),
    created_at   timestamp not null default now()
);
```

`AlSaqr.Tests/Database/AgentSqlFixture.cs`:

```csharp
using AlSaqr.Domain.Utils;
using Npgsql;
using Testcontainers.PostgreSql;

namespace AlSaqr.Tests.Database;

/// <summary>One throwaway Postgres per test class, with the stub schema plus agents.sql.</summary>
public sealed class AgentSqlFixture : IAsyncLifetime
{
    private PostgreSqlContainer? _container;
    public NpgsqlDataSource DataSource { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        if (!DockerAvailability.IsAvailable)
            return;

        _container = new PostgreSqlBuilder().WithImage("postgres:15-alpine").Build();
        await _container.StartAsync();
        DataSource = NpgsqlDataSource.Create(_container.GetConnectionString());

        await ExecuteFileAsync("stub_schema.sql");
        await ExecuteFileAsync("agents.sql");
    }

    public async Task DisposeAsync()
    {
        if (_container is null)
            return;
        await DataSource.DisposeAsync();
        await _container.DisposeAsync();
    }

    public async Task ExecuteFileAsync(string fileName)
    {
        var sql = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Database", "Sql", fileName));
        await using var command = DataSource.CreateCommand(sql);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<T> ScalarAsync<T>(string sql, params object?[] args)
    {
        await using var command = Command(sql, args);
        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? default! : (T)value;
    }

    public async Task<List<Dictionary<string, object?>>> RowsAsync(string sql, params object?[] args)
    {
        await using var command = Command(sql, args);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>();
            for (var i = 0; i < reader.FieldCount; i++)
                row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }
        return rows;
    }

    public Task<Guid> InsertUserAsync(string username, bool deleted = false) =>
        ScalarAsync<Guid>(
            "insert into \"alsaqr-2026\".users (id, username, deleted_at) "
                + "values (gen_random_uuid(), $1, case when $2 then now() end) returning id",
            username,
            deleted);

    public async Task<(Guid Owner, Guid Agent)> CreateAgentAsync(string username, string? bio = null)
    {
        var owner = await InsertUserAsync("owner_" + Unique());
        var agent = await ScalarAsync<Guid>("select \"alsaqr-2026\".create_agent($1, $2, $3)", owner, username, bio ?? "");
        return (owner, agent);
    }

    /// <returns>The plaintext token (the hash is what the database holds).</returns>
    public async Task<string> IssueTokenAsync(Guid agent, Guid owner)
    {
        var issued = AgentTokens.Issue();
        await RowsAsync(
            "select * from \"alsaqr-2026\".create_agent_token($1, $2, $3, $4)",
            agent, owner, issued.Hash, issued.DisplayPrefix);
        return issued.Token;
    }

    public Task<Guid?> ResolveAsync(string token) =>
        ScalarAsync<Guid?>("select \"alsaqr-2026\".resolve_agent_token($1)", AgentTokens.Hash(token));

    public static string Unique() => Guid.NewGuid().ToString("N")[..10];

    private NpgsqlCommand Command(string sql, object?[] args)
    {
        var command = DataSource.CreateCommand(sql);
        foreach (var arg in args)
            command.Parameters.Add(new NpgsqlParameter { Value = arg ?? DBNull.Value });
        return command;
    }
}
```

- [ ] **Step 3: Write the failing database tests**

`AlSaqr.Tests/Database/AgentSqlTests.cs`:

```csharp
using Npgsql;
using static AlSaqr.Tests.Database.AgentSqlFixture;

namespace AlSaqr.Tests.Database;

public sealed class AgentSqlTests : IClassFixture<AgentSqlFixture>
{
    private readonly AgentSqlFixture _db;

    public AgentSqlTests(AgentSqlFixture db) => _db = db;

    [DockerFact]
    public async Task Create_agent_inserts_a_user_and_a_custom_agent_owned_by_the_caller()
    {
        var username = "atlas." + Unique();
        var (owner, agent) = await _db.CreateAgentAsync(username, "  Runs sweeps.  ");

        var row = Assert.Single(await _db.RowsAsync(
            "select u.username, u.bio, a.owner_id, a.model from \"alsaqr-2026\".agents a "
                + "join \"alsaqr-2026\".users u on u.id = a.user_id where a.user_id = $1", agent));
        Assert.Equal(username, row["username"]);
        Assert.Equal("Runs sweeps.", row["bio"]);
        Assert.Equal(owner, row["owner_id"]);
        Assert.Equal("custom", row["model"]);
    }

    [DockerFact]
    public async Task Create_agent_rejects_a_username_taken_by_anyone_case_insensitively()
    {
        var taken = "Taken." + Unique();
        await _db.InsertUserAsync(taken);
        var owner = await _db.InsertUserAsync("owner_" + Unique());

        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            _db.ScalarAsync<Guid>("select \"alsaqr-2026\".create_agent($1, $2, '')", owner, taken.ToLowerInvariant()));
        Assert.Equal("23505", ex.SqlState);
        Assert.Equal("username_taken", ex.MessageText);
    }

    [DockerFact]
    public async Task Create_agent_rejects_an_unknown_or_deleted_owner()
    {
        var deleted = await _db.InsertUserAsync("gone_" + Unique(), deleted: true);
        foreach (var owner in new[] { Guid.NewGuid(), deleted })
        {
            var ex = await Assert.ThrowsAsync<PostgresException>(() =>
                _db.ScalarAsync<Guid>("select \"alsaqr-2026\".create_agent($1, $2, '')", owner, "x" + Unique()));
            Assert.Equal("owner_not_found", ex.MessageText);
        }
    }

    [DockerFact]
    public async Task An_agent_cannot_own_agents()
    {
        var (_, agent) = await _db.CreateAgentAsync("parent." + Unique());

        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            _db.ScalarAsync<Guid>("select \"alsaqr-2026\".create_agent($1, $2, '')", agent, "child." + Unique()));
        Assert.Equal("agents_cannot_own_agents", ex.MessageText);
    }

    [DockerFact]
    public async Task A_live_token_resolves_to_its_agent_and_marks_it_seen()
    {
        var (owner, agent) = await _db.CreateAgentAsync("seen." + Unique());
        var token = await _db.IssueTokenAsync(agent, owner);

        Assert.Equal(agent, await _db.ResolveAsync(token));
        Assert.NotNull(await _db.ScalarAsync<DateTime?>(
            "select last_seen_at from \"alsaqr-2026\".agents where user_id = $1", agent));
        Assert.Null(await _db.ResolveAsync(Guid.NewGuid().ToString()));
    }

    [DockerFact]
    public async Task A_revoked_token_stops_resolving_and_revoking_again_is_harmless()
    {
        var (owner, agent) = await _db.CreateAgentAsync("revoked." + Unique());
        var token = await _db.IssueTokenAsync(agent, owner);
        var tokenId = await _db.ScalarAsync<Guid>(
            "select token_id from \"alsaqr-2026\".list_agent_tokens($1, $2)", agent, owner);

        Assert.True(await _db.ScalarAsync<bool>(
            "select \"alsaqr-2026\".revoke_agent_token($1, $2, $3)", agent, tokenId, owner));
        Assert.Null(await _db.ResolveAsync(token));
        Assert.True(await _db.ScalarAsync<bool>(
            "select \"alsaqr-2026\".revoke_agent_token($1, $2, $3)", agent, tokenId, owner));
    }

    [DockerFact]
    public async Task A_deleted_agents_tokens_stop_resolving()
    {
        var (owner, agent) = await _db.CreateAgentAsync("deleted." + Unique());
        var token = await _db.IssueTokenAsync(agent, owner);
        await _db.RowsAsync("update \"alsaqr-2026\".users set deleted_at = now() where id = $1", agent);

        Assert.Null(await _db.ResolveAsync(token));
    }

    [DockerFact]
    public async Task Only_the_owner_can_mint_list_or_revoke_tokens()
    {
        var (owner, agent) = await _db.CreateAgentAsync("guarded." + Unique());
        var stranger = await _db.InsertUserAsync("stranger_" + Unique());
        var token = await _db.IssueTokenAsync(agent, owner);
        var tokenId = await _db.ScalarAsync<Guid>(
            "select token_id from \"alsaqr-2026\".list_agent_tokens($1, $2)", agent, owner);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => _db.RowsAsync(
            "select * from \"alsaqr-2026\".create_agent_token($1, $2, 'h', 'p')", agent, stranger));
        Assert.Equal("agent_not_found", ex.MessageText);
        Assert.Empty(await _db.RowsAsync("select * from \"alsaqr-2026\".list_agent_tokens($1, $2)", agent, stranger));
        Assert.False(await _db.ScalarAsync<bool>(
            "select \"alsaqr-2026\".revoke_agent_token($1, $2, $3)", agent, tokenId, stranger));

        var (otherOwner, otherAgent) = await _db.CreateAgentAsync("other." + Unique());
        Assert.False(await _db.ScalarAsync<bool>(
            "select \"alsaqr-2026\".revoke_agent_token($1, $2, $3)", otherAgent, tokenId, otherOwner));

        Assert.Equal(agent, await _db.ResolveAsync(token));
    }

    [DockerFact]
    public async Task Listing_tokens_never_exposes_hashes()
    {
        var (owner, agent) = await _db.CreateAgentAsync("listing." + Unique());
        await _db.IssueTokenAsync(agent, owner);

        var row = Assert.Single(await _db.RowsAsync(
            "select * from \"alsaqr-2026\".list_agent_tokens($1, $2)", agent, owner));
        Assert.Equal(
            new[] { "token_id", "token_prefix", "created_at", "last_used_at", "revoked_at" },
            row.Keys.ToArray());
    }

    [DockerFact]
    public async Task Search_returns_agents_only_ordered_by_username()
    {
        var u = Unique();
        await _db.CreateAgentAsync($"b{u}");
        await _db.CreateAgentAsync($"a{u}");
        await _db.InsertUserAsync($"human{u}");

        var rows = await _db.RowsAsync("select username from \"alsaqr-2026\".search_agents($1, 0, 50)", u);
        Assert.Equal(new[] { $"a{u}", $"b{u}" }, rows.Select(r => (string)r["username"]!).ToArray());
        Assert.Equal(2, await _db.ScalarAsync<int>("select \"alsaqr-2026\".count_search_agents($1)", u));
    }

    [DockerFact]
    public async Task Search_treats_percent_and_underscore_literally()
    {
        var u = Unique();
        await _db.CreateAgentAsync($"q{u}_x");
        await _db.CreateAgentAsync($"q{u}yx");
        await _db.CreateAgentAsync($"pct{u}");

        var underscore = await _db.RowsAsync("select username from \"alsaqr-2026\".search_agents($1, 0, 50)", $"{u}_");
        Assert.Equal(new[] { $"q{u}_x" }, underscore.Select(r => (string)r["username"]!).ToArray());
        Assert.Empty(await _db.RowsAsync("select * from \"alsaqr-2026\".search_agents($1, 0, 50)", $"{u}%"));
    }

    [DockerFact]
    public async Task Search_pages_with_skip_and_clamps_take()
    {
        var u = Unique();
        foreach (var name in new[] { "a", "b", "c" })
            await _db.CreateAgentAsync($"{name}{u}");

        var second = await _db.RowsAsync("select username from \"alsaqr-2026\".search_agents($1, 1, 1)", u);
        Assert.Equal(new[] { $"b{u}" }, second.Select(r => (string)r["username"]!).ToArray());
        Assert.Single(await _db.RowsAsync("select * from \"alsaqr-2026\".search_agents($1, 0, 0)", u));
        Assert.Equal(3, (await _db.RowsAsync("select * from \"alsaqr-2026\".search_agents($1, -5, 500)", u)).Count);
    }

    [DockerFact]
    public async Task Profile_reports_agent_fields_and_counts()
    {
        var (owner, agent) = await _db.CreateAgentAsync("profiled." + Unique());
        var fan = await _db.InsertUserAsync("fan_" + Unique());
        await _db.RowsAsync("insert into \"alsaqr-2026\".user_follows (follower_id, following_id) values ($1, $2)", fan, agent);
        await _db.RowsAsync("insert into \"alsaqr-2026\".posts (user_id, post_type) values ($1, 'post'), ($1, 'comment')", agent);

        var row = Assert.Single(await _db.RowsAsync("select * from \"alsaqr-2026\".get_agent_profile($1)", agent));
        Assert.Equal(true, row["is_agent"]);
        Assert.Equal("custom", row["model"]);
        Assert.StartsWith("owner_", (string)row["owner_username"]!);
        Assert.Equal(1L, row["follower_count"]);
        Assert.Equal(0L, row["following_count"]);
        Assert.Equal(1L, row["post_count"]);

        var human = Assert.Single(await _db.RowsAsync("select * from \"alsaqr-2026\".get_agent_profile($1)", owner));
        Assert.Equal(false, human["is_agent"]);
        Assert.Null(human["model"]);
        Assert.Empty(await _db.RowsAsync("select * from \"alsaqr-2026\".get_agent_profile($1)", Guid.NewGuid()));
    }

    [DockerFact]
    public async Task Summaries_cover_only_agents()
    {
        var (owner, agent) = await _db.CreateAgentAsync("summed." + Unique());

        var rows = await _db.RowsAsync(
            "select * from \"alsaqr-2026\".get_agent_summaries($1)", new[] { agent, owner, Guid.NewGuid() });
        Assert.Equal(agent, Assert.Single(rows)["user_id"]);
    }

    [DockerFact]
    public async Task The_migration_can_be_applied_twice()
    {
        await _db.ExecuteFileAsync("agents.sql");
        var (owner, agent) = await _db.CreateAgentAsync("rerun." + Unique());
        Assert.Equal(agent, await _db.ResolveAsync(await _db.IssueTokenAsync(agent, owner)));
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail or skip**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~AgentSqlTests"`
Expected on this machine (no Docker): build FAILS, because the test output can't copy the missing `agents.sql` (`MSB3030: Could not copy the file ...agents.sql`).
Where Docker exists, the build fails the same way until Step 5.

- [ ] **Step 5: Write the migration**

`AlSaqr.Data/Entities/SocialMedia/sql/agents.sql`:

```sql
-- Agent accounts and agent-scoped access tokens (specs/agent-api.md).
-- Apply in the Supabase SQL editor. Idempotent: safe to re-run.
-- An agent IS a users row (so posts, likes, follows and DMs work unchanged) plus an
-- agents row. Every ownership and revocation rule lives in the functions below.

create table if not exists "alsaqr-2026".agents (
    user_id      uuid primary key references "alsaqr-2026".users (id) on delete cascade,
    owner_id     uuid not null references "alsaqr-2026".users (id) on delete cascade,
    model        text not null default 'custom' check (model in ('claude', 'gpt-5', 'custom')),
    last_seen_at timestamptz,
    created_at   timestamptz not null default now(),
    constraint agents_not_self_owned check (user_id <> owner_id)
);
create index if not exists agents_owner_id_idx on "alsaqr-2026".agents (owner_id);

create table if not exists "alsaqr-2026".agent_tokens (
    id            uuid primary key default gen_random_uuid(),
    agent_user_id uuid not null references "alsaqr-2026".agents (user_id) on delete cascade,
    token_hash    text not null unique,
    token_prefix  text not null,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz,
    revoked_at    timestamptz
);
create index if not exists agent_tokens_agent_user_id_idx on "alsaqr-2026".agent_tokens (agent_user_id);

-- No policies: only the backend's service-role key reaches these tables.
alter table "alsaqr-2026".agents enable row level security;
alter table "alsaqr-2026".agent_tokens enable row level security;

create or replace function "alsaqr-2026".escape_like(p text)
returns text language sql immutable as $$
    select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function "alsaqr-2026".agent_matches_search(p_username text, p_bio text, p_search text)
returns boolean language sql immutable as $$
    select coalesce(trim(p_search), '') = ''
        or p_username ilike '%' || "alsaqr-2026".escape_like(trim(p_search)) || '%' escape '\'
        or coalesce(p_bio, '') ilike '%' || "alsaqr-2026".escape_like(trim(p_search)) || '%' escape '\';
$$;

-- Agent id for a live token, or null. Presence writes are throttled to one per 30 s.
create or replace function "alsaqr-2026".resolve_agent_token(p_token_hash text)
returns uuid language plpgsql as $$
declare
    v_agent uuid;
begin
    select t.agent_user_id into v_agent
      from "alsaqr-2026".agent_tokens t
      join "alsaqr-2026".users u on u.id = t.agent_user_id
     where t.token_hash = p_token_hash
       and t.revoked_at is null
       and u.deleted_at is null;

    if v_agent is null then
        return null;
    end if;

    update "alsaqr-2026".agent_tokens
       set last_used_at = now()
     where token_hash = p_token_hash
       and (last_used_at is null or last_used_at < now() - interval '30 seconds');

    update "alsaqr-2026".agents
       set last_seen_at = now()
     where user_id = v_agent
       and (last_seen_at is null or last_seen_at < now() - interval '30 seconds');

    return v_agent;
end;
$$;

create or replace function "alsaqr-2026".create_agent(p_owner_id uuid, p_username text, p_bio text)
returns uuid language plpgsql as $$
declare
    v_id uuid := gen_random_uuid();
begin
    if not exists (select 1 from "alsaqr-2026".users where id = p_owner_id and deleted_at is null) then
        raise exception 'owner_not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from "alsaqr-2026".agents where user_id = p_owner_id) then
        raise exception 'agents_cannot_own_agents' using errcode = '22023';
    end if;

    -- Serialises concurrent create_agent calls for the same name.
    perform pg_advisory_xact_lock(hashtext('agent_username:' || lower(p_username)));
    if exists (select 1 from "alsaqr-2026".users where lower(username) = lower(p_username)) then
        raise exception 'username_taken' using errcode = '23505';
    end if;

    insert into "alsaqr-2026".users (id, username, bio, is_completed, created_at)
    values (v_id, p_username, nullif(trim(p_bio), ''), true, now());
    insert into "alsaqr-2026".agents (user_id, owner_id, model)
    values (v_id, p_owner_id, 'custom');
    return v_id;
end;
$$;

create or replace function "alsaqr-2026".list_owned_agents(p_owner_id uuid)
returns table (user_id uuid, username text, avatar text, bio text, model text, last_seen_at timestamptz)
language sql stable as $$
    select a.user_id, u.username::text, u.avatar::text, u.bio::text, a.model, a.last_seen_at
      from "alsaqr-2026".agents a
      join "alsaqr-2026".users u on u.id = a.user_id
     where a.owner_id = p_owner_id and u.deleted_at is null
     order by lower(u.username), a.user_id;
$$;

create or replace function "alsaqr-2026".create_agent_token(
    p_agent_user_id uuid, p_owner_id uuid, p_token_hash text, p_token_prefix text)
returns table (token_id uuid, created_at timestamptz)
language plpgsql as $$
#variable_conflict use_column
begin
    if not exists (
        select 1
          from "alsaqr-2026".agents a
          join "alsaqr-2026".users u on u.id = a.user_id
         where a.user_id = p_agent_user_id and a.owner_id = p_owner_id and u.deleted_at is null
    ) then
        raise exception 'agent_not_found' using errcode = 'P0002';
    end if;

    return query
        insert into "alsaqr-2026".agent_tokens (agent_user_id, token_hash, token_prefix)
        values (p_agent_user_id, p_token_hash, p_token_prefix)
        returning agent_tokens.id, agent_tokens.created_at;
end;
$$;

create or replace function "alsaqr-2026".list_agent_tokens(p_agent_user_id uuid, p_owner_id uuid)
returns table (token_id uuid, token_prefix text, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language sql stable as $$
    select t.id, t.token_prefix, t.created_at, t.last_used_at, t.revoked_at
      from "alsaqr-2026".agent_tokens t
      join "alsaqr-2026".agents a on a.user_id = t.agent_user_id
     where t.agent_user_id = p_agent_user_id and a.owner_id = p_owner_id
     order by t.created_at desc, t.id;
$$;

create or replace function "alsaqr-2026".revoke_agent_token(p_agent_user_id uuid, p_token_id uuid, p_owner_id uuid)
returns boolean language plpgsql as $$
declare
    v_count int;
begin
    update "alsaqr-2026".agent_tokens t
       set revoked_at = coalesce(t.revoked_at, now())
      from "alsaqr-2026".agents a
     where t.id = p_token_id
       and t.agent_user_id = p_agent_user_id
       and a.user_id = t.agent_user_id
       and a.owner_id = p_owner_id;
    get diagnostics v_count = row_count;
    return v_count > 0;
end;
$$;

create or replace function "alsaqr-2026".search_agents(p_search text, p_skip int, p_take int)
returns table (user_id uuid, username text, avatar text, bio text, model text, last_seen_at timestamptz)
language sql stable as $$
    select a.user_id, u.username::text, u.avatar::text, u.bio::text, a.model, a.last_seen_at
      from "alsaqr-2026".agents a
      join "alsaqr-2026".users u on u.id = a.user_id
     where u.deleted_at is null
       and "alsaqr-2026".agent_matches_search(u.username, u.bio, p_search)
     order by lower(u.username), a.user_id
    offset greatest(p_skip, 0)
     limit least(greatest(p_take, 1), 50);
$$;

create or replace function "alsaqr-2026".count_search_agents(p_search text)
returns int language sql stable as $$
    select count(*)::int
      from "alsaqr-2026".agents a
      join "alsaqr-2026".users u on u.id = a.user_id
     where u.deleted_at is null
       and "alsaqr-2026".agent_matches_search(u.username, u.bio, p_search);
$$;

-- Works for any user: agent fields are null for humans.
create or replace function "alsaqr-2026".get_agent_profile(p_user_id uuid)
returns table (
    user_id uuid, username text, avatar text, bio text, is_agent boolean, model text,
    last_seen_at timestamptz, owner_username text, follower_count bigint,
    following_count bigint, post_count bigint, created_at timestamptz)
language sql stable as $$
    select u.id, u.username::text, u.avatar::text, u.bio::text,
           a.user_id is not null, a.model, a.last_seen_at, o.username::text,
           (select count(*) from "alsaqr-2026".user_follows f where f.following_id = u.id),
           (select count(*) from "alsaqr-2026".user_follows f where f.follower_id = u.id),
           (select count(*) from "alsaqr-2026".posts p
             where p.user_id = u.id and p.post_type = 'post' and p.deleted_at is null),
           u.created_at::timestamptz
      from "alsaqr-2026".users u
      left join "alsaqr-2026".agents a on a.user_id = u.id
      left join "alsaqr-2026".users o on o.id = a.owner_id
     where u.id = p_user_id and u.deleted_at is null;
$$;

create or replace function "alsaqr-2026".get_agent_summaries(p_user_ids uuid[])
returns table (user_id uuid, model text, last_seen_at timestamptz)
language sql stable as $$
    select a.user_id, a.model, a.last_seen_at
      from "alsaqr-2026".agents a
     where a.user_id = any (p_user_ids);
$$;
```

- [ ] **Step 6: Run the tests**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~AgentSqlTests"`
Expected on this machine: build succeeds, and all 15 tests are **Skipped** with "Docker is not available…". Report them as skipped, not passed.
Expected where Docker exists: all 15 PASS. If Docker becomes available during execution, run them and fix the SQL until they pass. Never edit a test to make it pass.

Run the full suite too: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`. Expected: Task 1 and Task 2 still PASS.

- [ ] **Step 7: Format and commit**

```bash
dotnet csharpier AlSaqr.Tests/Database
git add AlSaqr.Data/AlSaqr.Data.csproj AlSaqr.Data/Entities/SocialMedia/sql/agents.sql AlSaqr.Tests
git commit -m "feat: add agents and agent_tokens migration with database tests"
```

---

### Task 4: Agent repository, agent authentication, and `GET /api/agent/me`

**Files:**
- Create: `AlSaqr.Domain/SocialMedia/Agents.cs`
- Create: `AlSaqr.Data/Helpers/AgentSqlErrors.cs`
- Create: `AlSaqr.Data/Repositories/SocialMedia/Impl/IAgentRepository.cs`
- Create: `AlSaqr.Data/Repositories/SocialMedia/AgentRepository.cs`
- Create: `AlSaqr.API/Controllers/Agents/AgentProblems.cs`
- Create: `AlSaqr.API/Controllers/Agents/AgentControllerBase.cs`
- Create: `AlSaqr.API/Controllers/Agents/AgentApiController.cs`
- Modify: `AlSaqr.API/Program.cs` (DI registrations)
- Test: `AlSaqr.Tests/Data/AgentSqlErrorsTests.cs`
- Test: `AlSaqr.Tests/Api/AgentApiHost.cs`, `AlSaqr.Tests/Api/ResultAssert.cs`
- Test: `AlSaqr.Tests/Api/AgentApiAuthTests.cs`

**Interfaces:**
- Consumes: `AgentTokens`, `AgentRules` (Task 1). The SQL functions (Task 3).
- Produces:
  - DTOs in `AlSaqr.Domain.SocialMedia`: `AgentRow`, `AgentSummaryRow`, `AgentProfileRow`, `AgentTokenRow`, `CreatedAgentTokenRow`, `AgentSummaryDto`, `AgentProfileDto`, `AgentTokenDto`, `IssuedAgentTokenDto`, `AgentTextRequest`, `AgentMessageRequest`, `AgentLikeRequest`, `AgentRepostRequest`, `AgentFollowRequest`, `CreateAgentRequest`.
  - `IAgentRepository` (in `AlSaqr.Data.Repositories.SocialMedia.Impl`):
    - `Task<Guid?> ResolveTokenHash(Supabase.Client supabase, string tokenHash)`
    - `Task<AgentProfileDto?> GetProfile(Supabase.Client supabase, Guid userId)`
    - `Task<PaginatedResult<AgentSummaryDto>> SearchAgents(Supabase.Client supabase, string? searchTerm, int currentPage, int itemsPerPage)`
    - `Task<IReadOnlyList<AgentSummaryDto>> GetOwnedAgents(Supabase.Client supabase, Guid ownerId)`
    - `Task<Guid> CreateAgent(Supabase.Client supabase, Guid ownerId, string username, string? bio)`
    - `Task<(Guid TokenId, DateTimeOffset CreatedAt)> CreateToken(Supabase.Client supabase, Guid agentUserId, Guid ownerId, string tokenHash, string tokenPrefix)`
    - `Task<IReadOnlyList<AgentTokenDto>> ListTokens(Supabase.Client supabase, Guid agentUserId, Guid ownerId)`
    - `Task<bool> RevokeToken(Supabase.Client supabase, Guid agentUserId, Guid tokenId, Guid ownerId)`
  - `AgentSqlErrors.Translate(string message, Exception inner): Exception`
  - `AgentProblems.Unauthorized/BadRequest/NotFound(string detail): ObjectResult`, plus the constant `AgentProblems.AgentTokenRejected`.
  - `AgentControllerBase` with `SupabaseClient`, `AgentRepository`, and `Task<Guid?> AuthenticateAgentAsync()`.
  - `AgentApiController` (`[Route("agent")]`, so `/api/agent/*`) with this constructor, which later tasks keep unchanged: `(Supabase.Client supabase, IAgentRepository agentRepository, IPostRepository postRepository, ICommentRepository commentRepository, IPostStatusRepository postStatusRepository, IMessageRepository messageRepository, IUserFollowRepository userFollowRepository, IUserRepository userRepository, ISocialMediaCacheService socialMediaCacheService)`, and the action `Me()`.
  - Test helpers `AgentApiHost` and `ResultAssert`.

- [ ] **Step 1: Write the DTOs**

`AlSaqr.Domain/SocialMedia/Agents.cs`:

```csharp
using System.Text.Json.Serialization;
using AlSaqr.Domain.Utils;

namespace AlSaqr.Domain.SocialMedia
{
    // ---- Rows returned by the agent SQL functions (agents.sql); snake_case on the wire ----

    public sealed class AgentRow
    {
        [JsonPropertyName("user_id")] public Guid UserId { get; set; }
        [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
        [JsonPropertyName("avatar")] public string? Avatar { get; set; }
        [JsonPropertyName("bio")] public string? Bio { get; set; }
        [JsonPropertyName("model")] public string Model { get; set; } = AgentRules.CustomModel;
        [JsonPropertyName("last_seen_at")] public DateTimeOffset? LastSeenAt { get; set; }

        public AgentSummaryDto ToSummary(DateTimeOffset now) => new()
        {
            UserId = UserId,
            Username = Username,
            Avatar = Avatar,
            Bio = Bio,
            Model = Model,
            Status = AgentRules.StatusFor(LastSeenAt, now),
        };
    }

    public sealed class AgentSummaryRow
    {
        [JsonPropertyName("user_id")] public Guid UserId { get; set; }
        [JsonPropertyName("model")] public string Model { get; set; } = AgentRules.CustomModel;
        [JsonPropertyName("last_seen_at")] public DateTimeOffset? LastSeenAt { get; set; }
    }

    public sealed class AgentProfileRow
    {
        [JsonPropertyName("user_id")] public Guid UserId { get; set; }
        [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
        [JsonPropertyName("avatar")] public string? Avatar { get; set; }
        [JsonPropertyName("bio")] public string? Bio { get; set; }
        [JsonPropertyName("is_agent")] public bool IsAgent { get; set; }
        [JsonPropertyName("model")] public string? Model { get; set; }
        [JsonPropertyName("last_seen_at")] public DateTimeOffset? LastSeenAt { get; set; }
        [JsonPropertyName("owner_username")] public string? OwnerUsername { get; set; }
        [JsonPropertyName("follower_count")] public long FollowerCount { get; set; }
        [JsonPropertyName("following_count")] public long FollowingCount { get; set; }
        [JsonPropertyName("post_count")] public long PostCount { get; set; }
        [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }

        public AgentProfileDto ToProfile(DateTimeOffset now) => new()
        {
            UserId = UserId,
            Username = Username,
            Avatar = Avatar,
            Bio = Bio,
            IsAgent = IsAgent,
            Model = IsAgent ? Model : null,
            Status = IsAgent ? AgentRules.StatusFor(LastSeenAt, now) : null,
            OwnerUsername = OwnerUsername,
            FollowerCount = FollowerCount,
            FollowingCount = FollowingCount,
            PostCount = PostCount,
            CreatedAt = CreatedAt,
        };
    }

    public sealed class AgentTokenRow
    {
        [JsonPropertyName("token_id")] public Guid TokenId { get; set; }
        [JsonPropertyName("token_prefix")] public string TokenPrefix { get; set; } = string.Empty;
        [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }
        [JsonPropertyName("last_used_at")] public DateTimeOffset? LastUsedAt { get; set; }
        [JsonPropertyName("revoked_at")] public DateTimeOffset? RevokedAt { get; set; }

        public AgentTokenDto ToDto() => new()
        {
            TokenId = TokenId,
            Prefix = TokenPrefix,
            CreatedAt = CreatedAt,
            LastUsedAt = LastUsedAt,
            RevokedAt = RevokedAt,
        };
    }

    public sealed class CreatedAgentTokenRow
    {
        [JsonPropertyName("token_id")] public Guid TokenId { get; set; }
        [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }
    }

    // ---- Agent API responses (camelCase) ----

    public sealed class AgentSummaryDto
    {
        [JsonPropertyName("userId")] public Guid UserId { get; set; }
        [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
        [JsonPropertyName("avatar")] public string? Avatar { get; set; }
        [JsonPropertyName("bio")] public string? Bio { get; set; }
        [JsonPropertyName("model")] public string Model { get; set; } = AgentRules.CustomModel;
        [JsonPropertyName("status")] public string Status { get; set; } = "offline";
    }

    public sealed class AgentProfileDto
    {
        [JsonPropertyName("userId")] public Guid UserId { get; set; }
        [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
        [JsonPropertyName("avatar")] public string? Avatar { get; set; }
        [JsonPropertyName("bio")] public string? Bio { get; set; }
        [JsonPropertyName("isAgent")] public bool IsAgent { get; set; }
        [JsonPropertyName("model")] public string? Model { get; set; }
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("ownerUsername")] public string? OwnerUsername { get; set; }
        [JsonPropertyName("followerCount")] public long FollowerCount { get; set; }
        [JsonPropertyName("followingCount")] public long FollowingCount { get; set; }
        [JsonPropertyName("postCount")] public long PostCount { get; set; }
        [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    }

    public sealed class AgentTokenDto
    {
        [JsonPropertyName("tokenId")] public Guid TokenId { get; set; }
        [JsonPropertyName("prefix")] public string Prefix { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
        [JsonPropertyName("lastUsedAt")] public DateTimeOffset? LastUsedAt { get; set; }
        [JsonPropertyName("revokedAt")] public DateTimeOffset? RevokedAt { get; set; }
    }

    /// <summary>The only response that ever carries a plaintext agent token.</summary>
    public sealed class IssuedAgentTokenDto
    {
        [JsonPropertyName("tokenId")] public Guid TokenId { get; set; }
        [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
        [JsonPropertyName("prefix")] public string Prefix { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    }

    // ---- Agent API requests ----

    public sealed class AgentTextRequest
    {
        [JsonPropertyName("text")] public string? Text { get; set; }
    }

    public sealed class AgentMessageRequest
    {
        [JsonPropertyName("recipientId")] public Guid RecipientId { get; set; }
        [JsonPropertyName("text")] public string? Text { get; set; }
    }

    public sealed class AgentLikeRequest
    {
        [JsonPropertyName("liked")] public bool? Liked { get; set; }
    }

    public sealed class AgentRepostRequest
    {
        [JsonPropertyName("reposted")] public bool? Reposted { get; set; }
    }

    public sealed class AgentFollowRequest
    {
        [JsonPropertyName("following")] public bool? Following { get; set; }
    }

    public sealed class CreateAgentRequest
    {
        [JsonPropertyName("username")] public string? Username { get; set; }
        [JsonPropertyName("bio")] public string? Bio { get; set; }
    }
}
```

The `bool?` request flags are deliberate. A body of `{}` must be a 400, not a silent "unlike".

- [ ] **Step 2: Write the test helpers and failing tests**

`AlSaqr.Tests/Api/ResultAssert.cs`:

```csharp
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace AlSaqr.Tests.Api;

internal static class ResultAssert
{
    public static ProblemDetails Problem(IActionResult result, int status)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        Assert.Equal(status, objectResult.StatusCode);
        return Assert.IsType<ProblemDetails>(objectResult.Value);
    }

    /// <summary>The 200 body, serialized the way ASP.NET would (camelCase).</summary>
    public static JsonElement OkJson(IActionResult result)
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return JsonDocument.Parse(json).RootElement;
    }
}
```

`AlSaqr.Tests/Api/AgentApiHost.cs`:

```csharp
using AlSaqr.API.Controllers.Agents;
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Domain.Utils;
using AlSaqr.Infrastructure.SocialMediaCache;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;

namespace AlSaqr.Tests.Api;

/// <summary>An AgentApiController wired to NSubstitute fakes, with one valid agent token.</summary>
internal sealed class AgentApiHost
{
    // Constructing the client opens no connection; the fakes never use it.
    public static readonly Supabase.Client Supabase = new("http://localhost:54321", "test-key");

    public IAgentRepository Agents { get; } = Substitute.For<IAgentRepository>();
    public IPostRepository Posts { get; } = Substitute.For<IPostRepository>();
    public ICommentRepository Comments { get; } = Substitute.For<ICommentRepository>();
    public IPostStatusRepository PostStatuses { get; } = Substitute.For<IPostStatusRepository>();
    public IMessageRepository Messages { get; } = Substitute.For<IMessageRepository>();
    public IUserFollowRepository Follows { get; } = Substitute.For<IUserFollowRepository>();
    public IUserRepository Users { get; } = Substitute.For<IUserRepository>();
    public ISocialMediaCacheService Cache { get; } = Substitute.For<ISocialMediaCacheService>();

    public Guid AgentId { get; } = Guid.NewGuid();
    public string Token { get; } = AgentTokens.Issue().Token;

    public AgentApiHost()
    {
        Agents.ResolveTokenHash(Arg.Any<Supabase.Client>(), AgentTokens.Hash(Token)).Returns(AgentId);
    }

    public AgentApiController Authorized() => WithHeader($"Bearer {Token}");

    public AgentApiController WithHeader(string? authorization)
    {
        var controller = new AgentApiController(
            Supabase, Agents, Posts, Comments, PostStatuses, Messages, Follows, Users, Cache);
        var http = new DefaultHttpContext();
        if (authorization != null)
            http.Request.Headers.Authorization = authorization;
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }
}
```

If `ISocialMediaCacheService` lives in a different namespace, fix the `using`. `PostsController` imports it from `AlSaqr.Infrastructure.SocialMediaCache`.

`AlSaqr.Tests/Api/AgentApiAuthTests.cs`:

```csharp
using AlSaqr.Domain.SocialMedia;
using AlSaqr.Domain.Utils;
using NSubstitute;

namespace AlSaqr.Tests.Api;

public class AgentApiAuthTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("Bearer eyJhbGciOiJIUzI1NiJ9.eyJuYW1laWQiOiJ4In0.sig")]
    [InlineData("Bearer zat_short")]
    public async Task A_missing_or_non_agent_token_is_401_without_touching_the_database(string? header)
    {
        var host = new AgentApiHost();

        var problem = ResultAssert.Problem(await host.WithHeader(header).Me(), 401);

        Assert.Contains("revoked", problem.Detail);
        await host.Agents.DidNotReceiveWithAnyArgs().ResolveTokenHash(default!, default!);
    }

    [Fact]
    public async Task An_unknown_or_revoked_token_is_401_and_only_its_hash_is_looked_up()
    {
        var host = new AgentApiHost();
        var stranger = AgentTokens.Issue().Token;

        ResultAssert.Problem(await host.WithHeader($"Bearer {stranger}").Me(), 401);

        await host.Agents.Received(1).ResolveTokenHash(Arg.Any<Supabase.Client>(), AgentTokens.Hash(stranger));
        await host.Agents.DidNotReceive().ResolveTokenHash(Arg.Any<Supabase.Client>(), stranger);
        await host.Agents.DidNotReceiveWithAnyArgs().GetProfile(default!, default);
    }

    [Fact]
    public async Task A_valid_token_returns_its_own_agent_profile()
    {
        var host = new AgentApiHost();
        host.Agents.GetProfile(Arg.Any<Supabase.Client>(), host.AgentId)
            .Returns(new AgentProfileDto { UserId = host.AgentId, Username = "atlas.core", IsAgent = true });

        var body = ResultAssert.OkJson(await host.Authorized().Me());

        Assert.Equal(host.AgentId, body.GetProperty("userId").GetGuid());
        Assert.Equal("atlas.core", body.GetProperty("username").GetString());
    }

    [Fact]
    public async Task A_token_whose_agent_has_no_profile_is_404()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().Me(), 404);
    }
}
```

`AlSaqr.Tests/Data/AgentSqlErrorsTests.cs`:

```csharp
using AlSaqr.Data.Helpers;

namespace AlSaqr.Tests.Data;

public class AgentSqlErrorsTests
{
    private static readonly Exception Inner = new("raw");

    [Theory]
    [InlineData("{\"code\":\"23505\",\"message\":\"username_taken\"}", typeof(AlSaqr.Domain.Common.ConflictException))]
    [InlineData("{\"code\":\"P0002\",\"message\":\"agent_not_found\"}", typeof(AlSaqr.Domain.Common.NotFoundException))]
    [InlineData("{\"code\":\"P0002\",\"message\":\"owner_not_found\"}", typeof(AlSaqr.Domain.Common.NotFoundException))]
    [InlineData("{\"code\":\"22023\",\"message\":\"agents_cannot_own_agents\"}", typeof(AlSaqr.Domain.Common.ValidationException))]
    public void Known_function_errors_become_http_mapped_exceptions(string message, Type expected)
    {
        var mapped = AgentSqlErrors.Translate(message, Inner);

        Assert.IsType(expected, mapped);
        Assert.Same(Inner, mapped.InnerException);
    }

    [Fact]
    public void Anything_else_is_returned_unchanged() =>
        Assert.Same(Inner, AgentSqlErrors.Translate("connection refused", Inner));
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~AgentApiAuthTests|FullyQualifiedName~AgentSqlErrorsTests"`
Expected: build FAILS (`AgentApiController`, `IAgentRepository`, and `AgentSqlErrors` don't exist).

- [ ] **Step 4: Implement the SQL error mapping and the repository**

`AlSaqr.Data/Helpers/AgentSqlErrors.cs`:

```csharp
using AlSaqr.Domain.Common;

namespace AlSaqr.Data.Helpers
{
    /// <summary>
    /// Maps the messages raised by agents.sql to the HTTP-mapped exceptions the global
    /// middleware understands (CLAUDE.md §3.3). Anything unrecognised is returned as-is.
    /// </summary>
    public static class AgentSqlErrors
    {
        public static Exception Translate(string message, Exception inner) =>
            message switch
            {
                _ when message.Contains("username_taken") => new ConflictException("That username is already taken.", inner),
                _ when message.Contains("agent_not_found") => new NotFoundException("Agent not found.", inner),
                _ when message.Contains("owner_not_found") => new NotFoundException("Owner account not found.", inner),
                _ when message.Contains("agents_cannot_own_agents") => new ValidationException("An agent account cannot own other agents.", inner),
                _ => inner,
            };
    }
}
```

`AlSaqr.Data/Repositories/SocialMedia/Impl/IAgentRepository.cs`:

```csharp
using AlSaqr.Domain.SocialMedia;
using static AlSaqr.Domain.Utils.Common;

namespace AlSaqr.Data.Repositories.SocialMedia.Impl
{
    public interface IAgentRepository
    {
        Task<Guid?> ResolveTokenHash(Supabase.Client supabase, string tokenHash);

        Task<AgentProfileDto?> GetProfile(Supabase.Client supabase, Guid userId);

        Task<PaginatedResult<AgentSummaryDto>> SearchAgents(
            Supabase.Client supabase,
            string? searchTerm,
            int currentPage,
            int itemsPerPage);

        Task<IReadOnlyList<AgentSummaryDto>> GetOwnedAgents(Supabase.Client supabase, Guid ownerId);

        Task<Guid> CreateAgent(Supabase.Client supabase, Guid ownerId, string username, string? bio);

        Task<(Guid TokenId, DateTimeOffset CreatedAt)> CreateToken(
            Supabase.Client supabase,
            Guid agentUserId,
            Guid ownerId,
            string tokenHash,
            string tokenPrefix);

        Task<IReadOnlyList<AgentTokenDto>> ListTokens(Supabase.Client supabase, Guid agentUserId, Guid ownerId);

        Task<bool> RevokeToken(Supabase.Client supabase, Guid agentUserId, Guid tokenId, Guid ownerId);
    }
}
```

`AlSaqr.Data/Repositories/SocialMedia/AgentRepository.cs`:

```csharp
using System.Text.Json;
using AlSaqr.Data.Helpers;
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Domain.SocialMedia;
using Supabase.Postgrest.Exceptions;
using static AlSaqr.Domain.Utils.Common;

namespace AlSaqr.Data.Repositories.SocialMedia
{
    /// <summary>
    /// Agent data access. Every call goes through a SQL function in
    /// Entities/SocialMedia/sql/agents.sql, which owns the ownership and revocation rules.
    /// </summary>
    public sealed class AgentRepository : IAgentRepository
    {
        private readonly TimeProvider _time;

        public AgentRepository(TimeProvider time)
        {
            _time = time;
        }

        public async Task<Guid?> ResolveTokenHash(Supabase.Client supabase, string tokenHash) =>
            Deserialize<Guid?>(await Call(supabase, "resolve_agent_token", new() { ["p_token_hash"] = tokenHash }));

        public async Task<AgentProfileDto?> GetProfile(Supabase.Client supabase, Guid userId)
        {
            var rows = Deserialize<List<AgentProfileRow>>(
                await Call(supabase, "get_agent_profile", new() { ["p_user_id"] = userId.ToString() }));
            return rows?.FirstOrDefault()?.ToProfile(_time.GetUtcNow());
        }

        public async Task<PaginatedResult<AgentSummaryDto>> SearchAgents(
            Supabase.Client supabase,
            string? searchTerm,
            int currentPage,
            int itemsPerPage)
        {
            var search = searchTerm ?? string.Empty;
            var total = Deserialize<int>(await Call(supabase, "count_search_agents", new() { ["p_search"] = search }));
            var rows = Deserialize<List<AgentRow>>(await Call(supabase, "search_agents", new()
            {
                ["p_search"] = search,
                ["p_skip"] = (currentPage - 1) * itemsPerPage,
                ["p_take"] = itemsPerPage,
            })) ?? new List<AgentRow>();

            var now = _time.GetUtcNow();
            return new PaginatedResult<AgentSummaryDto>(
                rows.Select(row => row.ToSummary(now)).ToList(),
                new Pagination
                {
                    ItemsPerPage = itemsPerPage,
                    CurrentPage = currentPage,
                    TotalItems = total,
                    TotalPages = (int)Math.Ceiling((double)total / itemsPerPage),
                });
        }

        public async Task<IReadOnlyList<AgentSummaryDto>> GetOwnedAgents(Supabase.Client supabase, Guid ownerId)
        {
            var rows = Deserialize<List<AgentRow>>(
                await Call(supabase, "list_owned_agents", new() { ["p_owner_id"] = ownerId.ToString() }));
            var now = _time.GetUtcNow();
            return (rows ?? new List<AgentRow>()).Select(row => row.ToSummary(now)).ToList();
        }

        public async Task<Guid> CreateAgent(Supabase.Client supabase, Guid ownerId, string username, string? bio) =>
            Deserialize<Guid>(await Call(supabase, "create_agent", new()
            {
                ["p_owner_id"] = ownerId.ToString(),
                ["p_username"] = username,
                ["p_bio"] = bio ?? string.Empty,
            }));

        public async Task<(Guid TokenId, DateTimeOffset CreatedAt)> CreateToken(
            Supabase.Client supabase,
            Guid agentUserId,
            Guid ownerId,
            string tokenHash,
            string tokenPrefix)
        {
            var rows = Deserialize<List<CreatedAgentTokenRow>>(await Call(supabase, "create_agent_token", new()
            {
                ["p_agent_user_id"] = agentUserId.ToString(),
                ["p_owner_id"] = ownerId.ToString(),
                ["p_token_hash"] = tokenHash,
                ["p_token_prefix"] = tokenPrefix,
            }));
            var created = rows?.FirstOrDefault()
                ?? throw new AlSaqr.Domain.Common.NotFoundException("Agent not found.");
            return (created.TokenId, created.CreatedAt);
        }

        public async Task<IReadOnlyList<AgentTokenDto>> ListTokens(Supabase.Client supabase, Guid agentUserId, Guid ownerId)
        {
            var rows = Deserialize<List<AgentTokenRow>>(await Call(supabase, "list_agent_tokens", new()
            {
                ["p_agent_user_id"] = agentUserId.ToString(),
                ["p_owner_id"] = ownerId.ToString(),
            }));
            return (rows ?? new List<AgentTokenRow>()).Select(row => row.ToDto()).ToList();
        }

        public async Task<bool> RevokeToken(Supabase.Client supabase, Guid agentUserId, Guid tokenId, Guid ownerId) =>
            Deserialize<bool>(await Call(supabase, "revoke_agent_token", new()
            {
                ["p_agent_user_id"] = agentUserId.ToString(),
                ["p_token_id"] = tokenId.ToString(),
                ["p_owner_id"] = ownerId.ToString(),
            }));

        private static async Task<string> Call(Supabase.Client supabase, string function, Dictionary<string, object> args)
        {
            try
            {
                return await SupabaseHelper.CallFunction(supabase, function, args);
            }
            catch (PostgrestException ex)
            {
                var mapped = AgentSqlErrors.Translate(ex.Message, ex);
                if (ReferenceEquals(mapped, ex))
                    throw;
                throw mapped;
            }
        }

        private static T? Deserialize<T>(string content) =>
            string.IsNullOrWhiteSpace(content) ? default : JsonSerializer.Deserialize<T>(content);
    }
}
```

The build may report that `PostgrestException` isn't found in `Supabase.Postgrest.Exceptions`. If so, find the exception type the Supabase 1.0.5 client throws from `Rpc` by putting the cursor on `Rpc` in `SupabaseHelper.CallFunction` and using Go to Definition, then fix the `using`. Don't fall back to catching `Exception`.

- [ ] **Step 5: Implement the problem helper, base controller, and `Me`**

`AlSaqr.API/Controllers/Agents/AgentProblems.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace AlSaqr.API.Controllers.Agents
{
    /// <summary>
    /// RFC 7807 bodies for the Agent API. Built directly (not via ControllerBase.Problem)
    /// so they don't depend on ProblemDetailsFactory being registered.
    /// </summary>
    public static class AgentProblems
    {
        public const string AgentTokenRejected = "A valid agent token is required. It may have been revoked.";
        public const string OwnerTokenRejected = "Sign in to Zona to manage agents.";

        public static ObjectResult Unauthorized(string detail) => Create(401, "Unauthorized", detail);

        public static ObjectResult BadRequest(string detail) => Create(400, "Validation failed", detail);

        public static ObjectResult NotFound(string detail) => Create(404, "Resource not found", detail);

        private static ObjectResult Create(int status, string title, string detail) =>
            new(new ProblemDetails { Status = status, Title = title, Detail = detail })
            {
                StatusCode = status,
                ContentTypes = { "application/problem+json" },
            };
    }
}
```

`AlSaqr.API/Controllers/Agents/AgentControllerBase.cs`:

```csharp
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Domain.Utils;
using Microsoft.AspNetCore.Mvc;

namespace AlSaqr.API.Controllers.Agents
{
    /// <summary>
    /// Base for the Agent API. The acting agent comes ONLY from the request's
    /// "Bearer zat_…" token — never from IUserCacheService, whose logged-in user is a
    /// process-wide singleton shared by every caller.
    /// </summary>
    public abstract class AgentControllerBase : ControllerBase
    {
        protected AgentControllerBase(Supabase.Client supabase, IAgentRepository agentRepository)
        {
            SupabaseClient = supabase;
            AgentRepository = agentRepository;
        }

        protected Supabase.Client SupabaseClient { get; }

        protected IAgentRepository AgentRepository { get; }

        /// <returns>The token's agent id, or null when the token is missing, malformed, unknown or revoked.</returns>
        protected async Task<Guid?> AuthenticateAgentAsync()
        {
            if (!AgentTokens.TryReadBearer(Request.Headers.Authorization.ToString(), out var token))
                return null;
            return await AgentRepository.ResolveTokenHash(SupabaseClient, AgentTokens.Hash(token));
        }
    }
}
```

`AlSaqr.API/Controllers/Agents/AgentApiController.cs`:

```csharp
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Infrastructure.SocialMediaCache;
using Microsoft.AspNetCore.Mvc;

namespace AlSaqr.API.Controllers.Agents
{
    /// <summary>
    /// The Agent API (specs/agent-api.md): everything an agent linked through
    /// zona-core-mcp can do, always as the agent its token belongs to.
    /// </summary>
    [ApiController]
    [Route("agent")]
    public class AgentApiController : AgentControllerBase
    {
        private readonly IPostRepository _postRepository;
        private readonly ICommentRepository _commentRepository;
        private readonly IPostStatusRepository _postStatusRepository;
        private readonly IMessageRepository _messageRepository;
        private readonly IUserFollowRepository _userFollowRepository;
        private readonly IUserRepository _userRepository;
        private readonly ISocialMediaCacheService _socialMediaCacheService;

        public AgentApiController(
            Supabase.Client supabase,
            IAgentRepository agentRepository,
            IPostRepository postRepository,
            ICommentRepository commentRepository,
            IPostStatusRepository postStatusRepository,
            IMessageRepository messageRepository,
            IUserFollowRepository userFollowRepository,
            IUserRepository userRepository,
            ISocialMediaCacheService socialMediaCacheService
        )
            : base(supabase, agentRepository)
        {
            _postRepository = postRepository;
            _commentRepository = commentRepository;
            _postStatusRepository = postStatusRepository;
            _messageRepository = messageRepository;
            _userFollowRepository = userFollowRepository;
            _userRepository = userRepository;
            _socialMediaCacheService = socialMediaCacheService;
        }

        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var profile = await AgentRepository.GetProfile(SupabaseClient, agentId.Value);
            return profile is null ? AgentProblems.NotFound("Agent not found.") : Ok(profile);
        }
    }
}
```

The fields for the other repositories are assigned now and used by Tasks 6 and 7. The constructor doesn't change after this task.

- [ ] **Step 6: Register the new services**

In `AlSaqr.API/Program.cs`, after `builder.Services.AddScoped<IProfileRepository, ProfileRepository>();`, add:

```csharp
// Agent API (specs/agent-api.md). TimeProvider backs derived agent presence.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IAgentRepository, AgentRepository>();
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS. All of Tasks 1, 2, and 4 are green, and Task 3 is skipped where there's no Docker.
Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`.

- [ ] **Step 8: Format and commit**

```bash
dotnet csharpier AlSaqr.Domain/SocialMedia/Agents.cs AlSaqr.Data AlSaqr.API/Controllers/Agents AlSaqr.API/Program.cs AlSaqr.Tests
git add AlSaqr.Domain/SocialMedia/Agents.cs AlSaqr.Data/Helpers/AgentSqlErrors.cs AlSaqr.Data/Repositories/SocialMedia/Impl/IAgentRepository.cs AlSaqr.Data/Repositories/SocialMedia/AgentRepository.cs AlSaqr.API/Controllers/Agents AlSaqr.API/Program.cs AlSaqr.Tests
git commit -m "feat: authenticate agents by token and add GET /api/agent/me"
```

---

### Task 5: Author id, model, and status on posts

**Files:**
- Modify: `AlSaqr.Domain/SocialMedia/Posts.cs` (`PostDto`)
- Create: `AlSaqr.Domain/SocialMedia/PostAuthorEnricher.cs`
- Create: `AlSaqr.Domain/SocialMedia/AgentPosts.cs`
- Create: `AlSaqr.Data/Helpers/AgentAuthorLookup.cs`
- Modify: `AlSaqr.Data/Repositories/SocialMedia/PostRepository.cs` (constructor, `GetPosts`, `GetPost`, `GetBookmarkedPosts`)
- Modify: `AlSaqr.Data/Repositories/SocialMedia/CommentRepository.cs` (constructor, `GetComments`)
- Test: `AlSaqr.Tests/Domain/PostAuthorEnricherTests.cs`
- Test: `AlSaqr.Tests/Domain/AgentPostsTests.cs`

**Interfaces:**
- Consumes: `AgentSummaryRow` (Task 4), `AgentRules.StatusFor` (Task 1), `get_agent_summaries` (Task 3).
- Produces:
  - `PostDto.AuthorId: Guid` (JSON `authorId`), `PostDto.AuthorModel: string?` (`authorModel`), `PostDto.AuthorStatus: string?` (`authorStatus`).
  - `PostAuthorEnricher.EnrichAsync(IReadOnlyCollection<PostDto> posts, Func<IReadOnlyList<Guid>, Task<IReadOnlyList<AgentSummaryRow>>> lookup, DateTimeOffset now): Task`
  - `AgentAuthorLookup.EnrichAsync(Supabase.Client supabase, IReadOnlyCollection<PostDto> posts, DateTimeOffset now): Task`
  - `AgentPostDto`, `AgentThreadDto`, and the extensions `PostDto.ToAgentPost(Guid viewerId): AgentPostDto` and `PaginatedResult<PostDto>.ToAgentPosts(Guid viewerId): PaginatedResult<AgentPostDto>`.
  - `IPostRepository.GetPost` now throws `AlSaqr.Domain.Common.NotFoundException` for an unknown post.

- [ ] **Step 1: Write the failing tests**

`AlSaqr.Tests/Domain/PostAuthorEnricherTests.cs`:

```csharp
using AlSaqr.Data.Entities.SocialMedia.Views;
using AlSaqr.Domain.SocialMedia;

namespace AlSaqr.Tests.Domain;

public class PostAuthorEnricherTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    // Built from the real view row: PostDto's constructor binds `dynamic`, which can't
    // see an anonymous type declared in another assembly.
    internal static PostDto Post(Guid authorId) =>
        new(new VwPostDetails
        {
            PostId = Guid.NewGuid(),
            UserId = authorId,
            Content = "hello",
            PostType = "post",
            PostCreatedAt = new DateTime(2026, 10, 1, 11, 0, 0, DateTimeKind.Unspecified),
            Username = "someone",
        });

    [Fact]
    public void The_constructor_keeps_the_author_id()
    {
        var author = Guid.NewGuid();
        Assert.Equal(author, Post(author).AuthorId);
    }

    [Fact]
    public async Task Agent_authors_get_model_and_status_and_humans_get_nulls()
    {
        var agent = Guid.NewGuid();
        var human = Guid.NewGuid();
        var posts = new[] { Post(agent), Post(human), Post(agent) };

        await PostAuthorEnricher.EnrichAsync(
            posts,
            _ => Task.FromResult<IReadOnlyList<AgentSummaryRow>>(
                new[] { new AgentSummaryRow { UserId = agent, Model = "custom", LastSeenAt = Now.AddMinutes(-1) } }),
            Now);

        Assert.All(posts.Where(p => p.AuthorId == agent), p =>
        {
            Assert.Equal("custom", p.AuthorModel);
            Assert.Equal("online", p.AuthorStatus);
        });
        Assert.Null(posts[1].AuthorModel);
        Assert.Null(posts[1].AuthorStatus);
    }

    [Fact]
    public async Task Each_author_is_looked_up_once()
    {
        var agent = Guid.NewGuid();
        IReadOnlyList<Guid>? asked = null;

        await PostAuthorEnricher.EnrichAsync(
            new[] { Post(agent), Post(agent) },
            ids => { asked = ids; return Task.FromResult<IReadOnlyList<AgentSummaryRow>>(Array.Empty<AgentSummaryRow>()); },
            Now);

        Assert.Equal(new[] { agent }, asked);
    }

    [Fact]
    public async Task A_failing_lookup_leaves_posts_unenriched_instead_of_failing_the_feed()
    {
        var posts = new[] { Post(Guid.NewGuid()) };

        await PostAuthorEnricher.EnrichAsync(
            posts,
            _ => throw new InvalidOperationException("function get_agent_summaries does not exist"),
            Now);

        Assert.Null(posts[0].AuthorModel);
        Assert.Null(posts[0].AuthorStatus);
    }

    [Fact]
    public async Task An_empty_page_does_not_query()
    {
        var called = false;
        await PostAuthorEnricher.EnrichAsync(
            Array.Empty<PostDto>(),
            _ => { called = true; return Task.FromResult<IReadOnlyList<AgentSummaryRow>>(Array.Empty<AgentSummaryRow>()); },
            Now);
        Assert.False(called);
    }
}
```

`AlSaqr.Tests/Domain/AgentPostsTests.cs`:

```csharp
using AlSaqr.Domain.SocialMedia;
using static AlSaqr.Domain.Utils.Common;
using static AlSaqr.Tests.Domain.PostAuthorEnricherTests;

namespace AlSaqr.Tests.Domain;

public class AgentPostsTests
{
    private static readonly Guid Viewer = Guid.NewGuid();

    [Fact]
    public void Maps_counts_author_fields_and_viewer_flags()
    {
        var post = Post(Guid.NewGuid());
        post.AuthorModel = "custom";
        post.AuthorStatus = "idle";
        post.LikeCount = 3;
        post.RepostCount = 1;
        post.Likers = new[] { new PostUserInfoDto { UserId = Viewer } };
        post.Reposters = new[] { new PostUserInfoDto { UserId = Guid.NewGuid() } };
        post.Comments = new[] { new PostCommentDto(), new PostCommentDto() };

        var mapped = post.ToAgentPost(Viewer);

        Assert.Equal(post.PostId, mapped.PostId);
        Assert.Equal(post.AuthorId, mapped.AuthorId);
        Assert.Equal("someone", mapped.AuthorUsername);
        Assert.Equal("custom", mapped.AuthorModel);
        Assert.Equal("idle", mapped.AuthorStatus);
        Assert.Equal("hello", mapped.Text);
        Assert.Equal(3, mapped.LikeCount);
        Assert.Equal(1, mapped.RepostCount);
        Assert.Equal(2, mapped.ReplyCount);
        Assert.True(mapped.LikedByMe);
        Assert.False(mapped.RepostedByMe);
        Assert.Null(mapped.ReplyToPostId);
    }

    [Fact]
    public void A_timestamp_without_an_offset_is_treated_as_utc()
    {
        var mapped = Post(Guid.NewGuid()).ToAgentPost(Viewer);
        Assert.Equal(new DateTimeOffset(2026, 10, 1, 11, 0, 0, TimeSpan.Zero), mapped.CreatedAt);
    }

    [Fact]
    public void A_comment_points_at_the_post_it_replies_to()
    {
        var parent = Guid.NewGuid();
        var comment = Post(Guid.NewGuid());
        comment.PostType = "comment";
        comment.RelatedPostId = parent;

        Assert.Equal(parent, comment.ToAgentPost(Viewer).ReplyToPostId);
    }

    [Fact]
    public void Null_collections_and_username_are_safe()
    {
        var post = Post(Guid.NewGuid());
        post.Likers = null;
        post.Reposters = null;
        post.Comments = null;
        post.Username = null;

        var mapped = post.ToAgentPost(Viewer);

        Assert.False(mapped.LikedByMe);
        Assert.False(mapped.RepostedByMe);
        Assert.Equal(0, mapped.ReplyCount);
        Assert.Equal("unknown", mapped.AuthorUsername);
    }

    [Fact]
    public void Pages_map_items_and_keep_pagination()
    {
        var page = new PaginatedResult<PostDto>(
            new[] { Post(Guid.NewGuid()) },
            new Pagination { CurrentPage = 2, ItemsPerPage = 1, TotalItems = 5, TotalPages = 5 });

        var mapped = page.ToAgentPosts(Viewer);

        Assert.Single(mapped.Items);
        Assert.Same(page.Pagination, mapped.Pagination);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~PostAuthorEnricherTests|FullyQualifiedName~AgentPostsTests"`
Expected: build FAILS (`AuthorId`, `PostAuthorEnricher`, and `ToAgentPost` don't exist).

- [ ] **Step 3: Add the author fields to `PostDto`**

In `AlSaqr.Domain/SocialMedia/Posts.cs`, inside the `PostDto(dynamic postDetails)` constructor, after `AuthorBio = postDetails.AuthorBio;`, add:

```csharp
            AuthorId = postDetails.UserId;
```

All four callers (`PostRepository` ×3 and `CommentRepository`) pass a `VwPostDetails`, which has `UserId`.

After the `AuthorBio` property, add:

```csharp
        // Author identity for agent-aware clients (specs/agent-api.md). AuthorModel and
        // AuthorStatus are filled by AgentAuthorLookup and stay null for human authors.
        [JsonPropertyName("authorId")]
        public Guid AuthorId { get; set; }

        [JsonPropertyName("authorModel")]
        public string? AuthorModel { get; set; }

        [JsonPropertyName("authorStatus")]
        public string? AuthorStatus { get; set; }
```

- [ ] **Step 4: Implement the enricher and the agent post mapping**

`AlSaqr.Domain/SocialMedia/PostAuthorEnricher.cs`:

```csharp
using AlSaqr.Domain.Utils;

namespace AlSaqr.Domain.SocialMedia
{
    public static class PostAuthorEnricher
    {
        /// <summary>
        /// Sets AuthorModel/AuthorStatus on posts written by agents (null for humans).
        /// Enrichment is decoration: if the lookup fails — e.g. agents.sql is not applied
        /// yet — the posts are returned unenriched rather than failing the feed.
        /// </summary>
        public static async Task EnrichAsync(
            IReadOnlyCollection<PostDto> posts,
            Func<IReadOnlyList<Guid>, Task<IReadOnlyList<AgentSummaryRow>>> lookup,
            DateTimeOffset now)
        {
            var authorIds = posts.Select(p => p.AuthorId).Where(id => id != Guid.Empty).Distinct().ToList();
            if (authorIds.Count == 0)
                return;

            IReadOnlyList<AgentSummaryRow> agents;
            try
            {
                agents = await lookup(authorIds);
            }
            catch (Exception)
            {
                return;
            }

            var byId = agents.DistinctBy(a => a.UserId).ToDictionary(a => a.UserId);
            foreach (var post in posts)
            {
                var isAgent = byId.TryGetValue(post.AuthorId, out var agent);
                post.AuthorModel = isAgent ? agent!.Model : null;
                post.AuthorStatus = isAgent ? AgentRules.StatusFor(agent!.LastSeenAt, now) : null;
            }
        }
    }
}
```

`AlSaqr.Domain/SocialMedia/AgentPosts.cs`:

```csharp
using System.Text.Json.Serialization;
using static AlSaqr.Domain.Utils.Common;

namespace AlSaqr.Domain.SocialMedia
{
    /// <summary>A post as the Agent API returns it: compact, LLM-friendly, viewer-aware.</summary>
    public sealed class AgentPostDto
    {
        [JsonPropertyName("postId")] public Guid PostId { get; set; }
        [JsonPropertyName("authorId")] public Guid AuthorId { get; set; }
        [JsonPropertyName("authorUsername")] public string AuthorUsername { get; set; } = string.Empty;
        [JsonPropertyName("authorModel")] public string? AuthorModel { get; set; }
        [JsonPropertyName("authorStatus")] public string? AuthorStatus { get; set; }
        [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
        [JsonPropertyName("replyToPostId")] public Guid? ReplyToPostId { get; set; }
        [JsonPropertyName("likeCount")] public long LikeCount { get; set; }
        [JsonPropertyName("repostCount")] public long RepostCount { get; set; }
        [JsonPropertyName("replyCount")] public long ReplyCount { get; set; }
        [JsonPropertyName("likedByMe")] public bool LikedByMe { get; set; }
        [JsonPropertyName("repostedByMe")] public bool RepostedByMe { get; set; }
    }

    public sealed class AgentThreadDto
    {
        [JsonPropertyName("post")] public AgentPostDto Post { get; set; } = new();
        [JsonPropertyName("replies")] public PaginatedResult<AgentPostDto> Replies { get; set; } = null!;
    }

    public static class AgentPostMapping
    {
        public static AgentPostDto ToAgentPost(this PostDto post, Guid viewerId) => new()
        {
            PostId = post.PostId,
            AuthorId = post.AuthorId,
            AuthorUsername = post.Username ?? "unknown",
            AuthorModel = post.AuthorModel,
            AuthorStatus = post.AuthorStatus,
            Text = post.Content ?? string.Empty,
            CreatedAt = AsUtc(post.CreatedAt),
            ReplyToPostId = post.PostType == "comment" ? post.RelatedPostId : null,
            LikeCount = post.LikeCount,
            RepostCount = post.RepostCount,
            // commentCount is never populated by the backend (feed spec quirk 4).
            ReplyCount = post.Comments?.Length ?? 0,
            LikedByMe = post.Likers?.Any(l => l.UserId == viewerId) ?? false,
            RepostedByMe = post.Reposters?.Any(r => r.UserId == viewerId) ?? false,
        };

        public static PaginatedResult<AgentPostDto> ToAgentPosts(this PaginatedResult<PostDto> page, Guid viewerId) =>
            new(page.Items.Select(p => p.ToAgentPost(viewerId)).ToList(), page.Pagination);

        // .NET DateTime from the view has no offset; Postgres stores UTC (feed spec quirk 6).
        private static DateTimeOffset AsUtc(DateTime value) =>
            value.Kind == DateTimeKind.Local
                ? new DateTimeOffset(value.ToUniversalTime(), TimeSpan.Zero)
                : new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc), TimeSpan.Zero);
    }
}
```

`AlSaqr.Data/Helpers/AgentAuthorLookup.cs`:

```csharp
using System.Text.Json;
using AlSaqr.Domain.SocialMedia;

namespace AlSaqr.Data.Helpers
{
    /// <summary>Fills PostDto.AuthorModel/AuthorStatus from agents.sql's get_agent_summaries.</summary>
    public static class AgentAuthorLookup
    {
        public static Task EnrichAsync(Supabase.Client supabase, IReadOnlyCollection<PostDto> posts, DateTimeOffset now) =>
            PostAuthorEnricher.EnrichAsync(posts, ids => FetchAsync(supabase, ids), now);

        private static async Task<IReadOnlyList<AgentSummaryRow>> FetchAsync(Supabase.Client supabase, IReadOnlyList<Guid> ids)
        {
            var content = await SupabaseHelper.CallFunction(
                supabase,
                "get_agent_summaries",
                new Dictionary<string, object> { ["p_user_ids"] = ids.Select(id => id.ToString()).ToArray() });

            return string.IsNullOrWhiteSpace(content)
                ? Array.Empty<AgentSummaryRow>()
                : JsonSerializer.Deserialize<List<AgentSummaryRow>>(content) ?? new List<AgentSummaryRow>();
        }
    }
}
```

- [ ] **Step 5: Wire enrichment into the repositories**

In `AlSaqr.Data/Repositories/SocialMedia/PostRepository.cs`:

1. Replace `public PostRepository() { }` with:

```csharp
        private readonly TimeProvider _time;

        public PostRepository(TimeProvider time)
        {
            _time = time;
        }
```

2. In `GetPosts`, the page query currently orders only by `post_created_at`, which isn't deterministic (backend `CLAUDE.md` §3.2). Change it to:

```csharp
                posts = (await baseQuery.Order("post_created_at", Ordering.Descending)
                                .Order("post_id", Ordering.Descending)
                                .Range(skip, skip + itemsPerPage - 1)
                                .Get(ct))
                                .Models
                                .Select(vwPost => new PostDto(vwPost))
                                .ToList();

                await AgentAuthorLookup.EnrichAsync(supabase, posts, _time.GetUtcNow());
```

3. In `GetBookmarkedPosts`, after `posts = pageResult.Models.Select(vwPost => new PostDto(vwPost)).ToList();`, add:

```csharp
                await AgentAuthorLookup.EnrichAsync(supabase, posts, _time.GetUtcNow());
```

4. Replace the whole `GetPost` method. `.Single()`'s empty-result behavior is unreliable, and an unknown post must be a 404 for the Agent API:

```csharp
        public async Task<PostDto> GetPost(
            Supabase.Client supabase,
            Guid postId)
        {
            var result = await supabase
                .From<VwPostDetails>()
                .Filter("post_id", Operator.Equals, postId.ToString())
                .Limit(1)
                .Get();

            var row = result.Models.FirstOrDefault()
                ?? throw new AlSaqr.Domain.Common.NotFoundException("Post not found.");

            var post = new PostDto(row);
            await AgentAuthorLookup.EnrichAsync(supabase, new[] { post }, _time.GetUtcNow());
            return post;
        }
```

In `AlSaqr.Data/Repositories/SocialMedia/CommentRepository.cs`:

1. Replace `public CommentRepository() { }` with the same `TimeProvider` field and constructor shown above, named `CommentRepository`.
2. In `GetComments`, make the order deterministic and enrich:

```csharp
                postComments = (await baseQuery.Order("post_created_at", Ordering.Descending)
                                .Order("post_id", Ordering.Descending)
                                .Range(skip, skip + itemsPerPage - 1)
                                .Get(ct))
                                .Models
                                .Select(vwPost => new PostDto(vwPost))
                                .ToList();

                await AgentAuthorLookup.EnrichAsync(supabase, postComments, _time.GetUtcNow());
```

`AlSaqr.Data.Helpers` is already imported in both files. DI resolves the new `TimeProvider` constructor parameter, which was registered in Task 4.

- [ ] **Step 6: Run the tests and build**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS (all prior tests, plus 10 new ones).
Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`.

- [ ] **Step 7: Format and commit**

```bash
dotnet csharpier AlSaqr.Domain/SocialMedia AlSaqr.Data AlSaqr.Tests/Domain
git add AlSaqr.Domain/SocialMedia AlSaqr.Data/Helpers/AgentAuthorLookup.cs AlSaqr.Data/Repositories/SocialMedia/PostRepository.cs AlSaqr.Data/Repositories/SocialMedia/CommentRepository.cs AlSaqr.Tests/Domain
git commit -m "feat: expose author id, model and status on posts"
```

---

### Task 6: Agent read endpoints and scoped ProblemDetails

**Files:**
- Modify: `AlSaqr.API/Controllers/Agents/AgentApiController.cs` (add `Timeline`, `Thread`, `SearchAgents`, `GetAgent`)
- Modify: `AlSaqr.API/Program.cs` (enable `ExceptionHandlingMiddleware` for agent routes)
- Test: `AlSaqr.Tests/Api/AgentApiReadTests.cs`
- Test: `AlSaqr.Tests/Api/ExceptionHandlingMiddlewareTests.cs`

**Interfaces:**
- Consumes: `AgentApiHost`, `ResultAssert`, `IAgentRepository` (Task 4). `ToAgentPost` / `ToAgentPosts`, `AgentThreadDto`, and `GetPost` throwing `NotFoundException` (Task 5).
- Produces these actions on `AgentApiController`:
  - `Timeline(int currentPage = 1, int itemsPerPage = 20)` → `GET /api/agent/timeline`
  - `Thread(Guid postId, int currentPage = 1, int itemsPerPage = 20)` → `GET /api/agent/posts/{postId}/thread`
  - `SearchAgents(string? searchTerm = null, int currentPage = 1, int itemsPerPage = 20)` → `GET /api/agent/agents`
  - `GetAgent(Guid userId)` → `GET /api/agent/agents/{userId}`

- [ ] **Step 1: Write the failing tests**

`AlSaqr.Tests/Api/AgentApiReadTests.cs`:

```csharp
using AlSaqr.Domain.SocialMedia;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using static AlSaqr.Domain.Utils.Common;
using static AlSaqr.Tests.Domain.PostAuthorEnricherTests;

namespace AlSaqr.Tests.Api;

public class AgentApiReadTests
{
    private static PaginatedResult<PostDto> Page(params PostDto[] posts) =>
        new(posts, new Pagination { CurrentPage = 1, ItemsPerPage = 20, TotalItems = posts.Length, TotalPages = 1 });

    [Fact]
    public async Task Every_read_endpoint_requires_an_agent_token()
    {
        var host = new AgentApiHost();
        var anonymous = host.WithHeader(null);

        ResultAssert.Problem(await anonymous.Timeline(), 401);
        ResultAssert.Problem(await anonymous.Thread(Guid.NewGuid()), 401);
        ResultAssert.Problem(await anonymous.SearchAgents("x"), 401);
        ResultAssert.Problem(await anonymous.GetAgent(Guid.NewGuid()), 401);
    }

    [Fact]
    public async Task Timeline_clamps_paging_and_marks_what_this_agent_liked()
    {
        var host = new AgentApiHost();
        var post = Post(Guid.NewGuid());
        post.Likers = new[] { new PostUserInfoDto { UserId = host.AgentId } };
        host.Posts.GetPosts(Arg.Any<Supabase.Client>(), Arg.Any<string?>(), 1, 50).Returns(Page(post));

        var body = ResultAssert.OkJson(await host.Authorized().Timeline(currentPage: 0, itemsPerPage: 500));

        var item = Assert.Single(body.GetProperty("items").EnumerateArray());
        Assert.True(item.GetProperty("likedByMe").GetBoolean());
        Assert.Equal(1, body.GetProperty("pagination").GetProperty("currentPage").GetInt32());
    }

    [Fact]
    public async Task Thread_returns_the_post_and_a_page_of_replies()
    {
        var host = new AgentApiHost();
        var root = Post(Guid.NewGuid());
        var reply = Post(Guid.NewGuid());
        reply.PostType = "comment";
        reply.RelatedPostId = root.PostId;
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), root.PostId).Returns(root);
        host.Comments.GetComments(Arg.Any<Supabase.Client>(), root.PostId, 2, 5).Returns(Page(reply));

        var body = ResultAssert.OkJson(await host.Authorized().Thread(root.PostId, currentPage: 2, itemsPerPage: 5));

        Assert.Equal(root.PostId, body.GetProperty("post").GetProperty("postId").GetGuid());
        var replyJson = Assert.Single(body.GetProperty("replies").GetProperty("items").EnumerateArray());
        Assert.Equal(root.PostId, replyJson.GetProperty("replyToPostId").GetGuid());
    }

    [Fact]
    public async Task Thread_for_an_unknown_post_throws_not_found_for_the_middleware_to_map()
    {
        var host = new AgentApiHost();
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), Arg.Any<Guid>())
            .Throws(new AlSaqr.Domain.Common.NotFoundException("Post not found."));

        await Assert.ThrowsAsync<AlSaqr.Domain.Common.NotFoundException>(
            () => host.Authorized().Thread(Guid.NewGuid()));
        await host.Comments.DidNotReceiveWithAnyArgs().GetComments(default!, default, default, default);
    }

    [Fact]
    public async Task Search_trims_the_term_and_clamps_paging()
    {
        var host = new AgentApiHost();
        host.Agents.SearchAgents(Arg.Any<Supabase.Client>(), "gpt_5", 1, 20)
            .Returns(new PaginatedResult<AgentSummaryDto>(
                new[] { new AgentSummaryDto { Username = "gpt_5.fan" } },
                new Pagination { CurrentPage = 1, ItemsPerPage = 20, TotalItems = 1, TotalPages = 1 }));

        var body = ResultAssert.OkJson(await host.Authorized().SearchAgents("  gpt_5 ", currentPage: -1, itemsPerPage: 0));

        Assert.Equal("gpt_5.fan", Assert.Single(body.GetProperty("items").EnumerateArray()).GetProperty("username").GetString());
    }

    [Fact]
    public async Task Search_rejects_an_overlong_term()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().SearchAgents(new string('a', 101)), 400);
    }

    [Fact]
    public async Task GetAgent_returns_the_profile_or_404()
    {
        var host = new AgentApiHost();
        var known = Guid.NewGuid();
        host.Agents.GetProfile(Arg.Any<Supabase.Client>(), known).Returns(new AgentProfileDto { UserId = known });

        Assert.Equal(known, ResultAssert.OkJson(await host.Authorized().GetAgent(known)).GetProperty("userId").GetGuid());
        ResultAssert.Problem(await host.Authorized().GetAgent(Guid.NewGuid()), 404);
    }
}
```

`AlSaqr.Tests/Api/ExceptionHandlingMiddlewareTests.cs`:

```csharp
using System.Text.Json;
using AlSaqr.API.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AlSaqr.Tests.Api;

public class ExceptionHandlingMiddlewareTests
{
    private static async Task<(int Status, JsonElement Body)> Run(Exception thrown)
    {
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw thrown,
            NullLogger<ExceptionHandlingMiddleware>.Instance);
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().BuildServiceProvider(),
        };
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context);

        context.Response.Body.Position = 0;
        return (context.Response.StatusCode, (await JsonDocument.ParseAsync(context.Response.Body)).RootElement);
    }

    [Fact]
    public async Task NotFound_becomes_404_with_the_message_as_detail()
    {
        var (status, body) = await Run(new AlSaqr.Domain.Common.NotFoundException("Post not found."));
        Assert.Equal(404, status);
        Assert.Equal("Post not found.", body.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Conflict_becomes_409()
    {
        var (status, _) = await Run(new AlSaqr.Domain.Common.ConflictException("That username is already taken."));
        Assert.Equal(409, status);
    }

    [Fact]
    public async Task Unexpected_errors_hide_their_message()
    {
        var (status, body) = await Run(new InvalidOperationException("Host=db;Password=secret"));
        Assert.Equal(500, status);
        Assert.DoesNotContain("secret", body.GetProperty("detail").GetString());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~AgentApiReadTests|FullyQualifiedName~ExceptionHandlingMiddlewareTests"`
Expected: build FAILS (`Timeline`, `Thread`, `SearchAgents`, and `GetAgent` don't exist). The middleware tests compile once the controller compiles. They test existing code and should pass right away. If one fails, the existing middleware has a bug, so report it rather than changing the test.

- [ ] **Step 3: Implement the read actions**

In `AlSaqr.API/Controllers/Agents/AgentApiController.cs`, add these usings:

```csharp
using AlSaqr.Domain.SocialMedia;
using AlSaqr.Domain.Utils;
```

And these actions after `Me()`:

```csharp
        /// <summary>The global latest-posts feed, read live (the per-user posts cache ignores the page).</summary>
        [HttpGet("timeline")]
        public async Task<IActionResult> Timeline(
            [FromQuery] int currentPage = 1,
            [FromQuery] int itemsPerPage = AgentRules.DefaultPageSize)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var page = await _postRepository.GetPosts(
                SupabaseClient,
                null,
                AgentRules.ClampPage(currentPage),
                AgentRules.ClampPageSize(itemsPerPage));
            return Ok(page.ToAgentPosts(agentId.Value));
        }

        [HttpGet("posts/{postId:guid}/thread")]
        public async Task<IActionResult> Thread(
            Guid postId,
            [FromQuery] int currentPage = 1,
            [FromQuery] int itemsPerPage = AgentRules.DefaultPageSize)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var post = await _postRepository.GetPost(SupabaseClient, postId);
            var replies = await _commentRepository.GetComments(
                SupabaseClient,
                postId,
                AgentRules.ClampPage(currentPage),
                AgentRules.ClampPageSize(itemsPerPage));

            return Ok(new AgentThreadDto
            {
                Post = post.ToAgentPost(agentId.Value),
                Replies = replies.ToAgentPosts(agentId.Value),
            });
        }

        [HttpGet("agents")]
        public async Task<IActionResult> SearchAgents(
            [FromQuery] string? searchTerm = null,
            [FromQuery] int currentPage = 1,
            [FromQuery] int itemsPerPage = AgentRules.DefaultPageSize)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var term = searchTerm?.Trim() ?? string.Empty;
            if (term.Length > AgentRules.MaxSearchLength)
                return AgentProblems.BadRequest($"Search terms must be at most {AgentRules.MaxSearchLength} characters.");

            return Ok(await AgentRepository.SearchAgents(
                SupabaseClient,
                term,
                AgentRules.ClampPage(currentPage),
                AgentRules.ClampPageSize(itemsPerPage)));
        }

        [HttpGet("agents/{userId:guid}")]
        public async Task<IActionResult> GetAgent(Guid userId)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var profile = await AgentRepository.GetProfile(SupabaseClient, userId);
            return profile is null ? AgentProblems.NotFound("User not found.") : Ok(profile);
        }
```

- [ ] **Step 4: Turn on ProblemDetails for the agent routes only**

In `AlSaqr.API/Program.cs`, the global middleware is commented out. Leave that line alone so legacy routes keep their behavior. After `app.UseCors("AllowConfiguredOrigins");`, add:

```csharp
// The Agent API follows CLAUDE.md §3.3 from day one: repository exceptions become
// ProblemDetails. Scoped to agent routes so legacy endpoints keep their current behavior.
app.UseWhen(
    context =>
        context.Request.Path.StartsWithSegments("/api/agent")
        || context.Request.Path.StartsWithSegments("/api/agents"),
    branch => branch.UseMiddleware<ExceptionHandlingMiddleware>());
```

`StartsWithSegments("/api/agent")` doesn't match `/api/agents`, which is why both routes are listed.

- [ ] **Step 5: Run the tests and build**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS.
Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`.

- [ ] **Step 6: Format and commit**

```bash
dotnet csharpier AlSaqr.API/Controllers/Agents AlSaqr.API/Program.cs AlSaqr.Tests/Api
git add AlSaqr.API/Controllers/Agents/AgentApiController.cs AlSaqr.API/Program.cs AlSaqr.Tests/Api
git commit -m "feat: add agent timeline, thread, search and profile endpoints"
```

---

### Task 7: Agent write endpoints with idempotent like, repost, and follow

**Files:**
- Create: `AlSaqr.Domain/Utils/IdempotentToggle.cs`
- Modify: `AlSaqr.Data/Repositories/SocialMedia/Impl/IPostStatusRepository.cs`, `PostStatusRepository.cs` (`SetLiked`, `SetReposted`)
- Modify: `AlSaqr.Data/Repositories/SocialMedia/Impl/IUserFollowRepository.cs`, `UserFollowRepository.cs` (`SetFollowing`)
- Modify: `AlSaqr.Data/Repositories/SocialMedia/Impl/IUserRepository.cs`, `UserRepository.cs` (`GetUserById`)
- Modify: `AlSaqr.API/Controllers/Agents/AgentApiController.cs` (add `CreatePost`, `Reply`, `Like`, `Repost`, `SendMessage`, `Follow`)
- Test: `AlSaqr.Tests/Domain/IdempotentToggleTests.cs`
- Test: `AlSaqr.Tests/Api/AgentApiWriteTests.cs`

**Interfaces:**
- Consumes: `AgentApiHost` and `ResultAssert` (Task 4), `GetPost` → `NotFoundException` (Task 5), `AgentRules` (Task 1), and the request DTOs (Task 4).
- Produces:
  - `IdempotentToggle.SetAsync(Func<Task<bool>> readCurrent, Func<bool, Task> toggleFromCurrent, bool desired): Task<bool>`. It returns whether anything changed.
  - `IPostStatusRepository.SetLiked(Supabase.Client, Guid userId, Guid postId, bool liked, CancellationToken ct): Task` and `SetReposted(..., bool reposted, ...)`
  - `IUserFollowRepository.SetFollowing(Supabase.Client client, Guid userId, Guid targetUserId, bool following, CancellationToken ct): Task`
  - `IUserRepository.GetUserById(Supabase.Client supabase, Guid userId): Task<AlSaqrUser?>`, which excludes soft-deleted users
  - These actions:
    - `CreatePost(AgentTextRequest, CancellationToken)` → `POST /api/agent/posts`
    - `Reply(Guid postId, AgentTextRequest, CancellationToken)` → `POST /api/agent/posts/{postId}/replies`
    - `Like(Guid postId, AgentLikeRequest, CancellationToken)` → `PUT .../like`
    - `Repost(Guid postId, AgentRepostRequest, CancellationToken)` → `PUT .../repost`
    - `SendMessage(AgentMessageRequest)` → `POST /api/agent/messages`
    - `Follow(Guid userId, AgentFollowRequest, CancellationToken)` → `PUT /api/agent/follows/{userId}`

- [ ] **Step 1: Write the failing tests**

`AlSaqr.Tests/Domain/IdempotentToggleTests.cs`:

```csharp
using AlSaqr.Domain.Utils;

namespace AlSaqr.Tests.Domain;

public class IdempotentToggleTests
{
    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task A_change_toggles_once_from_the_current_state(bool current, bool desired)
    {
        var toggledFrom = new List<bool>();

        var changed = await IdempotentToggle.SetAsync(
            () => Task.FromResult(current),
            from => { toggledFrom.Add(from); return Task.CompletedTask; },
            desired);

        Assert.True(changed);
        Assert.Equal(new[] { current }, toggledFrom);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Asking_for_the_current_state_again_does_nothing(bool state)
    {
        var toggled = false;

        var changed = await IdempotentToggle.SetAsync(
            () => Task.FromResult(state),
            _ => { toggled = true; return Task.CompletedTask; },
            state);

        Assert.False(changed);
        Assert.False(toggled);
    }
}
```

`AlSaqr.Tests/Api/AgentApiWriteTests.cs`:

```csharp
using AlSaqr.Data.Entities.SocialMedia;
using AlSaqr.Domain.SocialMedia;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using static AlSaqr.Tests.Domain.PostAuthorEnricherTests;

namespace AlSaqr.Tests.Api;

public class AgentApiWriteTests
{
    private static readonly CancellationToken None = CancellationToken.None;

    [Fact]
    public async Task Every_write_endpoint_requires_an_agent_token()
    {
        var anonymous = new AgentApiHost().WithHeader(null);
        var id = Guid.NewGuid();

        ResultAssert.Problem(await anonymous.CreatePost(new AgentTextRequest { Text = "hi" }, None), 401);
        ResultAssert.Problem(await anonymous.Reply(id, new AgentTextRequest { Text = "hi" }, None), 401);
        ResultAssert.Problem(await anonymous.Like(id, new AgentLikeRequest { Liked = true }, None), 401);
        ResultAssert.Problem(await anonymous.Repost(id, new AgentRepostRequest { Reposted = true }, None), 401);
        ResultAssert.Problem(await anonymous.SendMessage(new AgentMessageRequest { RecipientId = id, Text = "hi" }), 401);
        ResultAssert.Problem(await anonymous.Follow(id, new AgentFollowRequest { Following = true }, None), 401);
    }

    [Fact]
    public async Task CreatePost_posts_trimmed_text_as_the_tokens_agent()
    {
        var host = new AgentApiHost();
        var postId = Guid.NewGuid();
        host.Posts.CreatePost(Arg.Any<Supabase.Client>(), host.AgentId, Arg.Any<Posts.CreatePostDto>(), None).Returns(postId);

        var body = ResultAssert.OkJson(await host.Authorized().CreatePost(new AgentTextRequest { Text = "  gm  " }, None));

        Assert.Equal(postId, body.GetProperty("postId").GetGuid());
        await host.Posts.Received(1).CreatePost(
            Arg.Any<Supabase.Client>(), host.AgentId, Arg.Is<Posts.CreatePostDto>(d => d.Text == "gm"), None);
        host.Cache.Received(1).ClearInitialPosts(host.AgentId);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    public async Task CreatePost_rejects_blank_text(string? text)
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().CreatePost(new AgentTextRequest { Text = text }, None), 400);
        await host.Posts.DidNotReceiveWithAnyArgs().CreatePost(default!, default, default!, default);
    }

    [Fact]
    public async Task CreatePost_rejects_text_over_500_characters()
    {
        var host = new AgentApiHost();

        var problem = ResultAssert.Problem(
            await host.Authorized().CreatePost(new AgentTextRequest { Text = new string('a', 501) }, None), 400);
        Assert.Contains("500", problem.Detail);
    }

    [Fact]
    public async Task Reply_comments_on_an_existing_post_as_the_agent()
    {
        var host = new AgentApiHost();
        var post = Post(Guid.NewGuid());
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), post.PostId).Returns(post);
        host.Comments.CreateComment(Arg.Any<Supabase.Client>(), host.AgentId, post.PostId, Arg.Any<Posts.CreateCommentDto>(), None)
            .Returns(Guid.NewGuid());

        ResultAssert.OkJson(await host.Authorized().Reply(post.PostId, new AgentTextRequest { Text = "agreed" }, None));

        await host.Comments.Received(1).CreateComment(
            Arg.Any<Supabase.Client>(), host.AgentId, post.PostId,
            Arg.Is<Posts.CreateCommentDto>(d => d.Text == "agreed" && d.UserId == host.AgentId && d.PostId == post.PostId),
            None);
        host.Cache.Received(1).ClearInitialComments(post.PostId);
    }

    [Fact]
    public async Task Reply_to_an_unknown_post_is_not_found_and_writes_nothing()
    {
        var host = new AgentApiHost();
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), Arg.Any<Guid>())
            .Throws(new AlSaqr.Domain.Common.NotFoundException("Post not found."));

        await Assert.ThrowsAsync<AlSaqr.Domain.Common.NotFoundException>(() =>
            host.Authorized().Reply(Guid.NewGuid(), new AgentTextRequest { Text = "hi" }, None));
        await host.Comments.DidNotReceiveWithAnyArgs().CreateComment(default!, default, default, default!, default);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Like_sets_the_desired_state_for_the_agent(bool liked)
    {
        var host = new AgentApiHost();
        var post = Post(Guid.NewGuid());
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), post.PostId).Returns(post);

        var body = ResultAssert.OkJson(await host.Authorized().Like(post.PostId, new AgentLikeRequest { Liked = liked }, None));

        Assert.Equal(liked, body.GetProperty("liked").GetBoolean());
        await host.PostStatuses.Received(1).SetLiked(Arg.Any<Supabase.Client>(), host.AgentId, post.PostId, liked, None);
    }

    [Fact]
    public async Task Like_without_a_desired_state_is_rejected_rather_than_unliking()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().Like(Guid.NewGuid(), new AgentLikeRequest(), None), 400);
        await host.PostStatuses.DidNotReceiveWithAnyArgs().SetLiked(default!, default, default, default, default);
    }

    [Fact]
    public async Task Repost_sets_the_desired_state_for_the_agent()
    {
        var host = new AgentApiHost();
        var post = Post(Guid.NewGuid());
        host.Posts.GetPost(Arg.Any<Supabase.Client>(), post.PostId).Returns(post);

        await host.Authorized().Repost(post.PostId, new AgentRepostRequest { Reposted = true }, None);

        await host.PostStatuses.Received(1).SetReposted(Arg.Any<Supabase.Client>(), host.AgentId, post.PostId, true, None);
    }

    [Fact]
    public async Task SendMessage_sends_from_the_agent_with_both_usernames()
    {
        var host = new AgentApiHost();
        var recipient = new AlSaqrUser { Id = Guid.NewGuid(), Username = "vale.research" };
        host.Users.GetUserById(Arg.Any<Supabase.Client>(), host.AgentId)
            .Returns(new AlSaqrUser { Id = host.AgentId, Username = "atlas.core" });
        host.Users.GetUserById(Arg.Any<Supabase.Client>(), recipient.Id).Returns(recipient);
        host.Messages.SendMessage(Arg.Any<Supabase.Client>(), host.AgentId, Arg.Any<Messages.MessageFormDto>())
            .Returns(Guid.NewGuid());

        ResultAssert.OkJson(await host.Authorized().SendMessage(
            new AgentMessageRequest { RecipientId = recipient.Id, Text = " ping " }));

        await host.Messages.Received(1).SendMessage(
            Arg.Any<Supabase.Client>(), host.AgentId,
            Arg.Is<Messages.MessageFormDto>(m =>
                m.SenderId == host.AgentId && m.SenderUsername == "atlas.core"
                && m.RecipientId == recipient.Id && m.RecipientUsername == "vale.research" && m.Text == "ping"));
        host.Cache.Received(1).ClearInitialMessageThreads(host.AgentId);
        host.Cache.Received(1).ClearInitialMessageThreads(recipient.Id);
    }

    [Fact]
    public async Task SendMessage_to_itself_or_to_nobody_is_rejected()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().SendMessage(new AgentMessageRequest { RecipientId = host.AgentId, Text = "hi" }), 400);
        ResultAssert.Problem(await host.Authorized().SendMessage(new AgentMessageRequest { RecipientId = Guid.Empty, Text = "hi" }), 400);
        ResultAssert.Problem(await host.Authorized().SendMessage(new AgentMessageRequest { RecipientId = Guid.NewGuid(), Text = "hi" }), 404);
        await host.Messages.DidNotReceiveWithAnyArgs().SendMessage(default!, default, default!);
    }

    [Fact]
    public async Task SendMessage_rejects_text_over_1000_characters()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().SendMessage(
            new AgentMessageRequest { RecipientId = Guid.NewGuid(), Text = new string('a', 1001) }), 400);
    }

    [Fact]
    public async Task Follow_sets_the_desired_state_for_the_agent()
    {
        var host = new AgentApiHost();
        var target = new AlSaqrUser { Id = Guid.NewGuid(), Username = "sable.watch" };
        host.Users.GetUserById(Arg.Any<Supabase.Client>(), target.Id).Returns(target);

        var body = ResultAssert.OkJson(await host.Authorized().Follow(target.Id, new AgentFollowRequest { Following = true }, None));

        Assert.True(body.GetProperty("following").GetBoolean());
        await host.Follows.Received(1).SetFollowing(Arg.Any<Supabase.Client>(), host.AgentId, target.Id, true, None);
    }

    [Fact]
    public async Task Follow_itself_or_an_unknown_user_is_rejected()
    {
        var host = new AgentApiHost();

        ResultAssert.Problem(await host.Authorized().Follow(host.AgentId, new AgentFollowRequest { Following = true }, None), 400);
        ResultAssert.Problem(await host.Authorized().Follow(Guid.NewGuid(), new AgentFollowRequest { Following = true }, None), 404);
        await host.Follows.DidNotReceiveWithAnyArgs().SetFollowing(default!, default, default, default, default);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~IdempotentToggleTests|FullyQualifiedName~AgentApiWriteTests"`
Expected: build FAILS (`IdempotentToggle`, `SetLiked`, `GetUserById`, and the write actions don't exist).

- [ ] **Step 3: Implement `IdempotentToggle`**

`AlSaqr.Domain/Utils/IdempotentToggle.cs`:

```csharp
namespace AlSaqr.Domain.Utils
{
    /// <summary>
    /// Brings a toggle-style action to a desired state. The legacy LikePost/RepostPost
    /// flip relative to the state they are *told* is current, so calling them twice
    /// inserts duplicate rows; agents retry, so read first and act only on a real change.
    /// </summary>
    public static class IdempotentToggle
    {
        public static async Task<bool> SetAsync(
            Func<Task<bool>> readCurrent,
            Func<bool, Task> toggleFromCurrent,
            bool desired)
        {
            var current = await readCurrent();
            if (current == desired)
                return false;
            await toggleFromCurrent(current);
            return true;
        }
    }
}
```

- [ ] **Step 4: Add the repository methods**

`IPostStatusRepository.cs`. Add these to the interface:

```csharp
        Task SetLiked(Supabase.Client supabase, Guid userId, Guid postId, bool liked, CancellationToken ct);

        Task SetReposted(Supabase.Client supabase, Guid userId, Guid postId, bool reposted, CancellationToken ct);
```

`PostStatusRepository.cs`. Add `using AlSaqr.Domain.Utils;` and these members:

```csharp
        public Task SetLiked(Supabase.Client supabase, Guid userId, Guid postId, bool liked, CancellationToken ct) =>
            IdempotentToggle.SetAsync(
                () => HasAction(supabase, userId, postId, "liked", ct),
                current => LikePost(supabase, userId, postId, current, ct),
                liked);

        public Task SetReposted(Supabase.Client supabase, Guid userId, Guid postId, bool reposted, CancellationToken ct) =>
            IdempotentToggle.SetAsync(
                () => HasAction(supabase, userId, postId, "reposted", ct),
                current => RepostPost(supabase, userId, postId, current, ct),
                reposted);

        private static async Task<bool> HasAction(
            Supabase.Client supabase, Guid userId, Guid postId, string action, CancellationToken ct)
        {
            var existing = await supabase
                .From<PostStatus>()
                .Filter("user_id", Operator.Equals, userId.ToString())
                .Filter("post_id", Operator.Equals, postId.ToString())
                .Filter("action", Operator.Equals, action)
                .Limit(1)
                .Get(ct);
            return existing.Models.Count > 0;
        }
```

`IUserFollowRepository.cs`. Add:

```csharp
        Task SetFollowing(Supabase.Client client, Guid userId, Guid targetUserId, bool following, CancellationToken ct);
```

`UserFollowRepository.cs`. Add the usings `AlSaqr.Data.Entities.SocialMedia`, `AlSaqr.Domain.Utils`, and `static Supabase.Postgrest.Constants` if any are missing, then:

```csharp
        public Task SetFollowing(Supabase.Client client, Guid userId, Guid targetUserId, bool following, CancellationToken ct) =>
            IdempotentToggle.SetAsync(
                () => IsFollowing(client, userId, targetUserId, ct),
                async current =>
                {
                    if (current)
                        await RemoveUserFollow(client, userId, new UnFollowUserFormDto { UserToUnFollowId = targetUserId }, ct);
                    else
                        await AddUserFollow(client, userId, new FollowUserFormDto { UserToFollowId = targetUserId }, ct);
                },
                following);

        private static async Task<bool> IsFollowing(Supabase.Client client, Guid userId, Guid targetUserId, CancellationToken ct)
        {
            var existing = await client
                .From<UserFollow>()
                .Filter("follower_id", Operator.Equals, userId.ToString())
                .Filter("following_id", Operator.Equals, targetUserId.ToString())
                .Limit(1)
                .Get(ct);
            return existing.Models.Count > 0;
        }
```

`IUserRepository.cs`. Add:

```csharp
        Task<AlSaqrUser?> GetUserById(Supabase.Client supabase, Guid userId);
```

`UserRepository.cs`. Add `using static Supabase.Postgrest.Constants;` if it's missing, then:

```csharp
        public async Task<AlSaqrUser?> GetUserById(Supabase.Client supabase, Guid userId)
        {
            var result = await supabase
                .From<AlSaqrUser>()
                .Filter("id", Operator.Equals, userId.ToString())
                .Filter("deleted_at", Operator.Is, "null")
                .Limit(1)
                .Get();
            return result.Models.FirstOrDefault();
        }
```

- [ ] **Step 5: Implement the write actions**

In `AgentApiController.cs`, add `using AlSaqr.Domain.SocialMedia;` if it isn't already there (Task 6 added it), then these actions:

```csharp
        [HttpPost("posts")]
        public async Task<IActionResult> CreatePost([FromBody] AgentTextRequest request, CancellationToken ct)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var text = AgentRules.ValidateText(request.Text, AgentRules.MaxPostLength, out var error);
            if (text is null)
                return AgentProblems.BadRequest(error);

            var postId = await _postRepository.CreatePost(
                SupabaseClient,
                agentId.Value,
                new Posts.CreatePostDto { Text = text, Tags = Array.Empty<string>() },
                ct);
            _socialMediaCacheService.ClearInitialPosts(agentId.Value);
            return Ok(new { postId });
        }

        [HttpPost("posts/{postId:guid}/replies")]
        public async Task<IActionResult> Reply(Guid postId, [FromBody] AgentTextRequest request, CancellationToken ct)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var text = AgentRules.ValidateText(request.Text, AgentRules.MaxPostLength, out var error);
            if (text is null)
                return AgentProblems.BadRequest(error);

            await _postRepository.GetPost(SupabaseClient, postId); // NotFoundException → 404
            var replyId = await _commentRepository.CreateComment(
                SupabaseClient,
                agentId.Value,
                postId,
                new Posts.CreateCommentDto { Text = text, PostId = postId, UserId = agentId.Value },
                ct);
            _socialMediaCacheService.ClearInitialComments(postId);
            return Ok(new { replyId });
        }

        [HttpPut("posts/{postId:guid}/like")]
        public async Task<IActionResult> Like(Guid postId, [FromBody] AgentLikeRequest request, CancellationToken ct)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);
            if (request.Liked is not bool liked)
                return AgentProblems.BadRequest("liked (true or false) is required.");

            await _postRepository.GetPost(SupabaseClient, postId);
            await _postStatusRepository.SetLiked(SupabaseClient, agentId.Value, postId, liked, ct);
            return Ok(new { liked });
        }

        [HttpPut("posts/{postId:guid}/repost")]
        public async Task<IActionResult> Repost(Guid postId, [FromBody] AgentRepostRequest request, CancellationToken ct)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);
            if (request.Reposted is not bool reposted)
                return AgentProblems.BadRequest("reposted (true or false) is required.");

            await _postRepository.GetPost(SupabaseClient, postId);
            await _postStatusRepository.SetReposted(SupabaseClient, agentId.Value, postId, reposted, ct);
            return Ok(new { reposted });
        }

        [HttpPost("messages")]
        public async Task<IActionResult> SendMessage([FromBody] AgentMessageRequest request)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var text = AgentRules.ValidateText(request.Text, AgentRules.MaxMessageLength, out var error);
            if (text is null)
                return AgentProblems.BadRequest(error);
            if (request.RecipientId == Guid.Empty)
                return AgentProblems.BadRequest("recipientId is required.");
            if (request.RecipientId == agentId.Value)
                return AgentProblems.BadRequest("An agent cannot message itself.");

            var recipient = await _userRepository.GetUserById(SupabaseClient, request.RecipientId);
            if (recipient is null)
                return AgentProblems.NotFound("Recipient not found.");
            var sender = await _userRepository.GetUserById(SupabaseClient, agentId.Value);
            if (sender is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);

            var messageId = await _messageRepository.SendMessage(
                SupabaseClient,
                agentId.Value,
                new Messages.MessageFormDto
                {
                    SenderId = sender.Id,
                    SenderUsername = sender.Username,
                    SenderProfileImg = sender.Avatar ?? string.Empty,
                    RecipientId = recipient.Id,
                    RecipientUsername = recipient.Username,
                    RecipientProfileImg = recipient.Avatar ?? string.Empty,
                    Text = text,
                });
            _socialMediaCacheService.ClearInitialMessageThreads(sender.Id);
            _socialMediaCacheService.ClearInitialMessageThreads(recipient.Id);
            return Ok(new { messageId });
        }

        [HttpPut("follows/{userId:guid}")]
        public async Task<IActionResult> Follow(Guid userId, [FromBody] AgentFollowRequest request, CancellationToken ct)
        {
            var agentId = await AuthenticateAgentAsync();
            if (agentId is null)
                return AgentProblems.Unauthorized(AgentProblems.AgentTokenRejected);
            if (request.Following is not bool following)
                return AgentProblems.BadRequest("following (true or false) is required.");
            if (userId == agentId.Value)
                return AgentProblems.BadRequest("An agent cannot follow itself.");
            if (await _userRepository.GetUserById(SupabaseClient, userId) is null)
                return AgentProblems.NotFound("User not found.");

            await _userFollowRepository.SetFollowing(SupabaseClient, agentId.Value, userId, following, ct);
            return Ok(new { following });
        }
```

In `SendMessage`, the self-message check runs before any lookup, so the order of the 400s in the test holds. `Guid.Empty` is rejected before the self check.

- [ ] **Step 6: Run the tests and build**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS.
Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`.

- [ ] **Step 7: Format and commit**

```bash
dotnet csharpier AlSaqr.Domain/Utils AlSaqr.Data/Repositories AlSaqr.API/Controllers/Agents AlSaqr.Tests
git add AlSaqr.Domain/Utils/IdempotentToggle.cs AlSaqr.Data/Repositories AlSaqr.API/Controllers/Agents/AgentApiController.cs AlSaqr.Tests
git commit -m "feat: add agent post, reply, like, repost, DM and follow endpoints"
```

---

### Task 8: Owner endpoints for creating agents and managing tokens

**Files:**
- Create: `AlSaqr.API/Controllers/Agents/AgentsController.cs`
- Test: `AlSaqr.Tests/Api/AgentsControllerTests.cs`

**Interfaces:**
- Consumes: `TokenService.TryGetUserId` (Task 2), `AgentTokens.Issue()`, `AgentRules` (Task 1), `IAgentRepository` (Task 4), `AgentProblems` (Task 4), `ResultAssert` (Task 4).
- Produces `AgentsController` (`[Route("agents")]`, so `/api/agents`), with the constructor `(Supabase.Client supabase, IAgentRepository agentRepository, TokenService tokenService)` and these actions:
  - `Create(CreateAgentRequest)` → `POST /api/agents`
  - `List()` → `GET /api/agents`
  - `IssueToken(Guid agentId)` → `POST /api/agents/{agentId}/tokens`
  - `ListTokens(Guid agentId)` → `GET /api/agents/{agentId}/tokens`
  - `RevokeToken(Guid agentId, Guid tokenId)` → `DELETE /api/agents/{agentId}/tokens/{tokenId}`

- [ ] **Step 1: Write the failing tests**

`AlSaqr.Tests/Api/AgentsControllerTests.cs`:

```csharp
using AlSaqr.API.Controllers.Agents;
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Domain.SocialMedia;
using AlSaqr.Domain.Utils;
using AlSaqr.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;

namespace AlSaqr.Tests.Api;

public class AgentsControllerTests
{
    private const string Secret = "unit-test-secret-that-is-comfortably-over-32-bytes";
    private readonly TokenService _tokens = new(Secret);
    private readonly IAgentRepository _agents = Substitute.For<IAgentRepository>();
    private readonly Guid _owner = Guid.NewGuid();

    private AgentsController As(string? authorization)
    {
        var controller = new AgentsController(AgentApiHost.Supabase, _agents, _tokens);
        var http = new DefaultHttpContext();
        if (authorization != null)
            http.Request.Headers.Authorization = authorization;
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    private AgentsController Owner() => As($"Bearer {_tokens.GenerateTokens(_owner.ToString()).AccessToken}");

    [Fact]
    public async Task Every_owner_endpoint_rejects_missing_foreign_and_agent_tokens()
    {
        var foreignJwt = new TokenService("some-other-secret-that-is-also-over-32-bytes")
            .GenerateTokens(_owner.ToString()).AccessToken;
        foreach (var header in new[] { null, $"Bearer {foreignJwt}", $"Bearer {AgentTokens.Issue().Token}" })
        {
            var controller = As(header);
            ResultAssert.Problem(await controller.Create(new CreateAgentRequest { Username = "atlas.core" }), 401);
            ResultAssert.Problem(await controller.List(), 401);
            ResultAssert.Problem(await controller.IssueToken(Guid.NewGuid()), 401);
            ResultAssert.Problem(await controller.ListTokens(Guid.NewGuid()), 401);
            ResultAssert.Problem(await controller.RevokeToken(Guid.NewGuid(), Guid.NewGuid()), 401);
        }
        Assert.Empty(_agents.ReceivedCalls());
    }

    [Fact]
    public async Task Create_normalizes_the_username_and_creates_for_the_signed_in_owner()
    {
        var agentId = Guid.NewGuid();
        _agents.CreateAgent(Arg.Any<Supabase.Client>(), _owner, "atlas.core", "Sweeps.").Returns(agentId);
        _agents.GetProfile(Arg.Any<Supabase.Client>(), agentId)
            .Returns(new AgentProfileDto { UserId = agentId, Username = "atlas.core", IsAgent = true, Model = "custom" });

        var body = ResultAssert.OkJson(await Owner().Create(new CreateAgentRequest { Username = "  Atlas.Core ", Bio = " Sweeps. " }));

        Assert.Equal(agentId, body.GetProperty("userId").GetGuid());
        Assert.Equal("custom", body.GetProperty("model").GetString());
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("has space")]
    [InlineData(null)]
    public async Task Create_rejects_invalid_usernames(string? username)
    {
        ResultAssert.Problem(await Owner().Create(new CreateAgentRequest { Username = username }), 400);
        await _agents.DidNotReceiveWithAnyArgs().CreateAgent(default!, default, default!, default);
    }

    [Fact]
    public async Task Create_rejects_an_overlong_bio()
    {
        ResultAssert.Problem(
            await Owner().Create(new CreateAgentRequest { Username = "atlas.core", Bio = new string('a', 161) }), 400);
    }

    [Fact]
    public async Task IssueToken_returns_the_token_once_and_stores_only_its_hash()
    {
        var agentId = Guid.NewGuid();
        var tokenId = Guid.NewGuid();
        _agents.CreateToken(Arg.Any<Supabase.Client>(), agentId, _owner, Arg.Any<string>(), Arg.Any<string>())
            .Returns((tokenId, DateTimeOffset.UtcNow));

        var body = ResultAssert.OkJson(await Owner().IssueToken(agentId));

        var token = body.GetProperty("token").GetString()!;
        Assert.True(AgentTokens.IsWellFormed(token));
        Assert.Equal(tokenId, body.GetProperty("tokenId").GetGuid());
        await _agents.Received(1).CreateToken(
            Arg.Any<Supabase.Client>(), agentId, _owner, AgentTokens.Hash(token), token.Substring(4, 8));
        Assert.DoesNotContain(_agents.ReceivedCalls().SelectMany(c => c.GetArguments()), arg => Equals(arg, token));
    }

    [Fact]
    public async Task ListTokens_for_an_agent_the_caller_does_not_own_is_404()
    {
        _agents.GetOwnedAgents(Arg.Any<Supabase.Client>(), _owner)
            .Returns(new[] { new AgentSummaryDto { UserId = Guid.NewGuid() } });

        ResultAssert.Problem(await Owner().ListTokens(Guid.NewGuid()), 404);
        await _agents.DidNotReceiveWithAnyArgs().ListTokens(default!, default, default);
    }

    [Fact]
    public async Task ListTokens_for_an_owned_agent_returns_metadata()
    {
        var agentId = Guid.NewGuid();
        _agents.GetOwnedAgents(Arg.Any<Supabase.Client>(), _owner).Returns(new[] { new AgentSummaryDto { UserId = agentId } });
        _agents.ListTokens(Arg.Any<Supabase.Client>(), agentId, _owner).Returns(new[] { new AgentTokenDto { Prefix = "abcd1234" } });

        var body = ResultAssert.OkJson(await Owner().ListTokens(agentId));

        Assert.Equal("abcd1234", Assert.Single(body.EnumerateArray()).GetProperty("prefix").GetString());
    }

    [Fact]
    public async Task RevokeToken_is_204_when_revoked_and_404_otherwise()
    {
        var agentId = Guid.NewGuid();
        var mine = Guid.NewGuid();
        _agents.RevokeToken(Arg.Any<Supabase.Client>(), agentId, mine, _owner).Returns(true);

        Assert.IsType<NoContentResult>(await Owner().RevokeToken(agentId, mine));
        ResultAssert.Problem(await Owner().RevokeToken(agentId, Guid.NewGuid()), 404);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter "FullyQualifiedName~AgentsControllerTests"`
Expected: build FAILS (`AgentsController` doesn't exist).

- [ ] **Step 3: Implement the controller**

`AlSaqr.API/Controllers/Agents/AgentsController.cs`:

```csharp
using AlSaqr.Data.Repositories.SocialMedia.Impl;
using AlSaqr.Domain.SocialMedia;
using AlSaqr.Domain.Utils;
using AlSaqr.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace AlSaqr.API.Controllers.Agents
{
    /// <summary>
    /// Owner endpoints (specs/agent-api.md): a signed-in human creates agent accounts
    /// and mints/revokes their tokens. The owner is read from a signature-verified JWT —
    /// never from IUserCacheService. Agents the caller doesn't own are 404, not 403.
    /// </summary>
    [ApiController]
    [Route("agents")]
    public class AgentsController : ControllerBase
    {
        private readonly Supabase.Client _supabase;
        private readonly IAgentRepository _agentRepository;
        private readonly TokenService _tokenService;

        public AgentsController(Supabase.Client supabase, IAgentRepository agentRepository, TokenService tokenService)
        {
            _supabase = supabase;
            _agentRepository = agentRepository;
            _tokenService = tokenService;
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateAgentRequest request)
        {
            if (Owner() is not Guid owner)
                return AgentProblems.Unauthorized(AgentProblems.OwnerTokenRejected);

            var username = AgentRules.NormalizeUsername(request.Username);
            if (!AgentRules.IsValidUsername(username))
                return AgentProblems.BadRequest(
                    "Usernames are 3–30 characters: lowercase letters, digits, '.' and '_'.");
            var bio = request.Bio?.Trim();
            if (bio?.Length > AgentRules.MaxBioLength)
                return AgentProblems.BadRequest($"Bios must be at most {AgentRules.MaxBioLength} characters.");

            var agentId = await _agentRepository.CreateAgent(_supabase, owner, username, bio);
            var profile = await _agentRepository.GetProfile(_supabase, agentId);
            return profile is null ? AgentProblems.NotFound("Agent not found.") : Ok(profile);
        }

        [HttpGet]
        public async Task<IActionResult> List()
        {
            if (Owner() is not Guid owner)
                return AgentProblems.Unauthorized(AgentProblems.OwnerTokenRejected);

            return Ok(await _agentRepository.GetOwnedAgents(_supabase, owner));
        }

        /// <summary>The only response that ever contains a plaintext agent token.</summary>
        [HttpPost("{agentId:guid}/tokens")]
        public async Task<IActionResult> IssueToken(Guid agentId)
        {
            if (Owner() is not Guid owner)
                return AgentProblems.Unauthorized(AgentProblems.OwnerTokenRejected);

            var issued = AgentTokens.Issue();
            var (tokenId, createdAt) = await _agentRepository.CreateToken(
                _supabase, agentId, owner, issued.Hash, issued.DisplayPrefix);

            return Ok(new IssuedAgentTokenDto
            {
                TokenId = tokenId,
                Token = issued.Token,
                Prefix = issued.DisplayPrefix,
                CreatedAt = createdAt,
            });
        }

        [HttpGet("{agentId:guid}/tokens")]
        public async Task<IActionResult> ListTokens(Guid agentId)
        {
            if (Owner() is not Guid owner)
                return AgentProblems.Unauthorized(AgentProblems.OwnerTokenRejected);

            var owned = await _agentRepository.GetOwnedAgents(_supabase, owner);
            if (owned.All(agent => agent.UserId != agentId))
                return AgentProblems.NotFound("Agent not found.");

            return Ok(await _agentRepository.ListTokens(_supabase, agentId, owner));
        }

        [HttpDelete("{agentId:guid}/tokens/{tokenId:guid}")]
        public async Task<IActionResult> RevokeToken(Guid agentId, Guid tokenId)
        {
            if (Owner() is not Guid owner)
                return AgentProblems.Unauthorized(AgentProblems.OwnerTokenRejected);

            return await _agentRepository.RevokeToken(_supabase, agentId, tokenId, owner)
                ? NoContent()
                : AgentProblems.NotFound("Token not found.");
        }

        private Guid? Owner() =>
            _tokenService.TryGetUserId(Request.Headers.Authorization.ToString(), out var userId) ? userId : null;
    }
}
```

`TokenService` is already registered as a singleton in `Program.cs`, so no DI change is needed.

- [ ] **Step 4: Run the tests and build**

Run: `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: PASS.
Run: `dotnet build AlSaqr.API.sln`
Expected: `Build succeeded`.

- [ ] **Step 5: Format and commit**

```bash
dotnet csharpier AlSaqr.API/Controllers/Agents AlSaqr.Tests/Api
git add AlSaqr.API/Controllers/Agents/AgentsController.cs AlSaqr.Tests/Api/AgentsControllerTests.cs
git commit -m "feat: let owners create agents and mint or revoke agent tokens"
```

---

### Task 9: Record the contract, update the Zona docs, and the rollout checklist

**Files:**
- Create: `specs/agent-api.md` (backend)
- Modify: `CLAUDE.md` (backend: §2 project table, §5 scope)
- Modify: `Zona/docs/superpowers/specs/2026-09-27-feed-data-layer-design.md`
- Modify: `Zona/.claude/references/alsaqr-backend-api-v2.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only. The rollout steps at the end are for a human and are not run by the executor.

- [ ] **Step 1: Write the backend spec**

`specs/agent-api.md`:

````markdown
# Specification: Agent API

Design and full contract: Zona repo, `docs/superpowers/specs/2026-10-01-zona-core-mcp-design.md`.
Consumer: `zona-core-mcp` (MCP server, stdio, `npx zona-core-mcp`).

## Rules

1. Agent endpoints (`/api/agent/*`) take the acting agent ONLY from `Authorization: Bearer zat_…`,
   resolved by `resolve_agent_token(sha256(token))`. They MUST NOT read `IUserCacheService`.
2. Owner endpoints (`/api/agents/*`) take the owner ONLY from `TokenService.TryGetUserId`
   (signature-verified JWT). Agents the caller doesn't own are 404.
3. Plaintext tokens are returned once (`POST /api/agents/{id}/tokens`) and never stored or logged.
4. All agent table access goes through the functions in
   `AlSaqr.Data/Entities/SocialMedia/sql/agents.sql`; ownership/revocation rules live there.
5. Like / repost / follow are desired-state and idempotent (`IdempotentToggle`).
6. Errors on agent routes are RFC 7807 ProblemDetails (`ExceptionHandlingMiddleware`, scoped
   to `/api/agent` and `/api/agents` in `Program.cs`).
7. Limits: `AgentRules` — mirrored by zona-core-mcp; change both together.

## Tests

`AlSaqr.Tests`. Database tests (`AgentSqlTests`) need Docker (Testcontainers) and skip without it.
````

- [ ] **Step 2: Update the backend constitution**

In `CLAUDE.md` §2, add a row to the project table:

```markdown
| **AlSaqr.Tests** | xUnit tests: unit tests with NSubstitute fakes, database tests on Testcontainers (§6) | production code |
```

Then change the sentence "These four are the whole solution." to "These four, plus `AlSaqr.Tests`, are the whole solution."

In §5 (Scope), add after the Zook paragraph:

```markdown
**Agent API** — agent accounts owned by a user; agent-scoped tokens; an agent reads the
timeline and threads, posts, replies, likes, reposts, DMs, follows and searches agents as
itself (`specs/agent-api.md`). Consumed by the `zona-core-mcp` MCP server.
```

- [ ] **Step 3: Update the Zona feed spec, which now has the fields it put off**

In `Zona/docs/superpowers/specs/2026-09-27-feed-data-layer-design.md`:

1. Replace the paragraph that starts `**Assumed (correct me if wrong):** agent-only fields stay out until the backend has them.` with:

```markdown
**Update 2026-10-01:** the backend now returns `authorId`, `authorModel`
(`claude` | `gpt-5` | `custom` | null) and `authorStatus` (`online` | `idle` | `offline` | null)
on every `PostDto` (see `2026-10-01-zona-core-mcp-design.md`). Null means a human author.
```

2. In quirk 3, append: ` *(Resolved 2026-10-01: `PostDto.authorId`.)*`
3. In **D1**, replace the sentences from "The avatar seed and `author.id` are the `username`." through "There is no model tag." with:

```markdown
The avatar seed and `author.id` are `authorId`. The name is the `username`, and the handle
is `@username`. A missing username becomes `Unknown agent` / `@unknown`. The status is
`authorStatus` (null → `idle`), and the model tag is `authorModel` (null → no tag).
```

4. In the `PostDto` fields list under **Verified backend contract**, add `authorId`, `authorModel`, `authorStatus`.

This spec is untracked and still awaiting the user's review. Edit it but **do not commit it in the Zona repo**, and mention the edit in the final report.

- [ ] **Step 4: Update the Zona reference file**

Append to `Zona/.claude/references/alsaqr-backend-api-v2.md`:

```markdown

**Agent API** (`/api/agent/*`, `/api/agents/*`, added 2026-10-01): agent accounts and
agent-scoped `zat_…` tokens; the only endpoints whose identity comes from the token rather
than the server-wide logged-in-user singleton. Contract:
`docs/superpowers/specs/2026-10-01-zona-core-mcp-design.md`; rules: the backend's
`specs/agent-api.md`. `PostDto` now carries `authorId` / `authorModel` / `authorStatus`.
```

- [ ] **Step 5: Run the full verification**

Run: `dotnet build AlSaqr.API.sln && dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj`
Expected: `Build succeeded`. All non-database tests PASS, and the 15 `AgentSqlTests` are Skipped (no Docker) or PASS (with Docker). Report the exact counts.

- [ ] **Step 6: Commit (backend only)**

```bash
git add specs/agent-api.md CLAUDE.md
git commit -m "docs: record the Agent API rules and the test project"
```

Commit the Zona reference-file change separately in the Zona repo:

```bash
git -C ~/mobile-projects/Zona add .claude/references/alsaqr-backend-api-v2.md
git -C ~/mobile-projects/Zona commit -m "docs: note the backend Agent API in the backend reference"
```

- [ ] **Step 7: Hand the rollout checklist to the human (do not run it)**

Applying SQL to the shared Supabase project and deploying are outward-facing, so the executor stops here and reports this checklist:

1. **Run the database tests where Docker exists.** Install Docker Desktop, or use CI, then run `dotnet test AlSaqr.Tests/AlSaqr.Tests.csproj --filter FullyQualifiedName~AgentSqlTests`. All 15 must pass before the SQL goes anywhere.
2. **Check the real schema against the stub.** In the Supabase SQL editor:
   `select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema = 'alsaqr-2026' and table_name in ('users','posts','user_follows') order by 1, 2;`
   Confirm that the columns `agents.sql` uses exist, and that `users` has no other `NOT NULL` column without a default. `create_agent` sets only `id, username, bio, is_completed, created_at`. If either check fails, adjust `create_agent` and the stub together.
3. **Confirm the backend's `Supabase:Key` is the service-role key.** RLS is enabled on the new tables with no policies.
4. Apply `AlSaqr.Data/Entities/SocialMedia/sql/agents.sql` in the SQL editor.
5. Deploy the backend.
6. **Smoke test.** Create an agent with `POST /api/agents` (human JWT), mint a token, then `GET /api/agent/me` with `Bearer zat_…` → 200. Revoke the token, then run it again → 401.
