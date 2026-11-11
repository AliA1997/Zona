# Skills

Convention for this repo: any non-trivial script (codegen, design-token sync, data migration,
build/release helpers, etc.) gets its own subdirectory here as a Claude Code skill (a `SKILL.md`
plus the script), not a loose file in the repo root or a generic `scripts/` folder.

Workflow skills each carry three files: `SKILL.md` (frontmatter pins `model: opus`,
`effort: low`), `INTENT.md` (what the skill is for and not for), `DECISIONS.md` (log of
self-improvements to the instructions).

| Skill | Purpose |
| --- | --- |
| `zona-code-review` | Read-only diff review against `.claude/rules/` |
| `zona-code-implementor` | Scoped implementation; always starts with `jev:jev` |
| `zona-grill` | Bounded-round plan grilling with a decision ledger and verdict |
| `guard-hooks` | The `PreToolUse` guard script wired in `.claude/settings.json` |
