# Intent: zona-code-implementor

Implement a scoped change in Zona the same way every time: locate with `jev:jev`, follow the
rules, verify, stop.

- **Does:** always uses the `jev:jev` skill first to find the code a change touches (files are
  located by behavior, not guessed by name), then makes the smallest edit that satisfies the
  request, then runs typecheck and lint.
- **Does not:** review its own work (hand off to `zona-code-review`), commit, push, or widen
  scope beyond the request.
- **Success looks like:** a minimal diff that passes `npx tsc --noEmit` and `npm run lint`,
  follows `.claude/rules/`, and reuses existing components/tokens instead of adding new ones.
- **Hard requirement:** the `jev:jev` step is not optional. If it is skipped the run is invalid.
