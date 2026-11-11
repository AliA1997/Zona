# Intent: zona-grill

Pressure-test a plan, spec, or idea for Zona before anything is built, by forcing every open
decision into the open and closing it with a recorded answer.

- **Does:** reads the plan and the codebase first, then asks the user a small batch of numbered
  questions per round, each with a recommended answer and the cost of being wrong. Ends with a
  decision table and a go / no-go verdict.
- **Does not:** write code, edit the plan, or ask questions the codebase can answer.
- **How it differs from other grilling skills:** it works in bounded rounds (max 5 questions),
  ranks questions by blast radius instead of walking a design tree top to bottom, tags each
  question with a risk class, keeps a running decision ledger, and has a defined stop condition.
- **Success looks like:** every high-risk unknown has a user-confirmed answer, and the ledger can
  be handed straight to `zona-code-implementor`.
