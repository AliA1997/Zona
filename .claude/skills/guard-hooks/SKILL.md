---
name: guard-hooks
description: Explains and maintains the project-level PreToolUse guard (guard.js) that blocks destructive shell commands and access to secrets or protected paths. Use when a command was blocked by the guard, when adding or loosening a blocked pattern, or when testing the hook. Not for general permission settings (use update-config).
disable-model-invocation: true
---

# guard-hooks

`guard.js` is wired in `.claude/settings.json` as a `PreToolUse` hook for `Bash`, `PowerShell`,
`Read`, `Edit`, `Write`, `MultiEdit`, and `NotebookEdit`. Exit code 2 blocks the call.

## What it blocks
- Destructive deletes of root, home, drives, `.git`, `.claude`, or `node_modules`.
- `git push`, `reset --hard`, `clean`, `branch -D`, `--force`, `--no-verify`, discarding all changes.
- Piping downloads into a shell, `npm publish`, EAS submit/update, `sudo`, registry/system edits.
- Reading or editing `.env*` (except `.env.example`), keys, `.npmrc`, credentials files.
- Writing to `.git/`, `.claude/settings.json`, or this folder.

## Change it
1. Edit the `BASH_RULES` array or path regexes in `guard.js`. One `[regex, reason]` per rule.
2. Test: `echo '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | node .claude/skills/guard-hooks/guard.js; echo $?` should print the reason and `2`.
3. Because the guard protects its own folder, the user must make the edit (or temporarily
   remove the `PROTECTED_WRITE` entry themselves).

This is a guardrail against mistakes, not a sandbox: a determined obfuscated command can evade
regexes. Keep `permissions.deny` in settings as the second layer.
