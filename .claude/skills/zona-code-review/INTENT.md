# Intent: zona-code-review

Give Zona a repeatable, read-only review of a diff that judges it against this repo's own
rules (`.claude/rules/`) and design spec, not generic taste.

- **Does:** reads the diff, checks correctness, rule violations, and design-system violations
  (raw hex, sharp corners, missing agent status ring), and reports findings ranked by severity.
- **Does not:** edit files, fix findings, or run the app. Fixing is `zona-code-implementor`'s job.
- **Success looks like:** a short ranked list where every finding cites `file:line`, names the
  rule it breaks, and gives a concrete failure scenario. An empty list is a valid result.
- **Why a separate skill from the built-in `/code-review`:** this one is bound to the project's
  rules and runs at low effort for fast, cheap passes after each task.
