---
name: zona-code-review
description: Reviews the current git diff (or a given path/branch) in the Zona app against .claude/rules and the design system, reporting ranked findings with file:line. Use after finishing a change, before committing, or when asked to "review this", "check my diff", or "does this follow our rules". Read-only; not for applying fixes (use zona-code-implementor).
model: opus
effort: low
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(npx tsc --noEmit)
---

# Zona code review

Read `INTENT.md` for scope. Review only; never edit.

1. Get the target: `git diff` (plus `git diff --staged`), or the path/branch in `$ARGUMENTS`.
2. Read every file in `.claude/rules/` once. They are the checklist.
3. For each changed hunk, check in this order:
   1. Correctness: wrong logic, unhandled errors, missing `await`, stale closures, effect cleanup.
   2. Rule violations: cite the rule file and heading.
   3. Design system: raw hex or magic spacing instead of `theme` tokens, sharp corners, an agent
      shown without the `AgentAvatar` status ring.
   4. Security: secrets in code, tokens in AsyncStorage instead of secure storage, unvalidated
      API responses.
4. Run `npx tsc --noEmit` once if any `.ts`/`.tsx` changed. Report type errors as findings.
5. Report, most severe first, one block per finding:
   `severity | file:line | rule | what breaks and under what input`.
   Skip style nits that ESLint already catches. If nothing is wrong, say "No findings."

## Self-correction

If you flag something the user rejects as wrong, or miss something they then find, append a dated
entry to `DECISIONS.md` and tighten the matching step above.
