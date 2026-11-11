# Git and safety

Enforced mechanically by the hooks in `.claude/settings.json` (script:
`.claude/skills/guard-hooks/guard.js`); these rules explain why.

- Never commit or push unless the user asks. Never force-push, `reset --hard`, `clean -fd`, or
  rewrite published history.
- Never read, print, or edit `.env*`, key files, or credential stores.
- Never run destructive filesystem commands outside the project (`rm -rf /`, `~`, drive roots).
- Never pipe a download into a shell (`curl ... | sh`).
- Never `npm publish`, `eas submit`, or any release step without explicit user instruction.
- Do not delete `node_modules` as a troubleshooting step (installs here are very slow; see
  CLAUDE.md).
- If a hook blocks a command, do not look for a way around it. Tell the user what was blocked and
  why, and let them decide.
