# Decisions: zona-code-review

Log of how this skill's instructions have changed and why. Newest first. Add an entry whenever a
review was wrong (false positive) or missed a real defect, then edit `SKILL.md` to prevent it.

Entry format: `date | trigger (what went wrong) | change made to SKILL.md | expected effect`

- 2026-11-10 | Initial version | Frontmatter pinned to `model: opus`, `effort: low`; read-only tool
  allowlist; rules-first checklist | Fast, cheap per-task review that cannot modify the tree.
