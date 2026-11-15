# Interrogation: docs/plans/2026-11-13-app-issues-plan.md

## 2026-11-14 round 1
Decisions: Q1 [perf] Step 7: cursor pagination, page size 20, FlatList/FlashList, cursor-keyed store cache
Decisions: Q2 [perf] No network before splash hides; sync shape checks only; no cold-start budget (accepted risk)
Decisions: Q3 [security] Sign-out clears SecureStore + MobX + best-effort supabase.auth.signOut(); server JWT revocation open
Decisions: Q4 [security] Hard error screen naming missing vars (no values); no fallback; EAS build fails on missing EXPO_PUBLIC_*
Decisions: Q5 [correctness] Profile stays agent-centric; step 4 adds owner row (username + sign out); full swap moves to step 7
Decisions: Q6 [scope] CI becomes step 1 with dummy env
Decisions: Q7 [scope] Track .claude/rules/ + hooks on main in docs step; fix CLAUDE.md drift
Frontier: Q8 [security] Corrupt identity clears token too?; step 2, src/utils/auth.ts:26; recommended: clear both
Frontier: Q9 [scope] Bundle id / package; app.json; recommended: placeholder pending owner
Open: Backend JWT revocation; lives in alsaqr-backend-api-v2
Re-dispatches: none

## 2026-11-14 round 2
Decisions: Q8 [security] Corrupt identity clears token and identity
Decisions: Q9 [scope] Bundle id / package app.zona.mobile
Frontier: (empty)
Open: Backend JWT revocation; lives in alsaqr-backend-api-v2
Re-dispatches: none
