---
name: zona-grill
description: Grills the user on a Zona plan, spec, or feature idea in bounded rounds of ranked questions, each with a recommended answer, then outputs a decision ledger and a go/no-go verdict. Use when asked to "grill", "stress-test", "poke holes in", or "sanity check" a plan or idea before building. Not for writing code or reviewing a diff (use zona-code-review).
model: opus
effort: low
allowed-tools: Read, Grep, Glob, AskUserQuestion
---

# Zona grill

Read `INTENT.md` for scope.

## Before asking anything

1. Read the target (`$ARGUMENTS` path, or the plan in the conversation) and `CLAUDE.md`.
2. Grep the codebase for anything the plan assumes exists. Anything answerable from code is a
   fact, not a question: put it in the ledger as `Found`.
3. List the open unknowns. Tag each with a risk class: `DATA` (schema, migration, auth), `UX`
   (screen, copy, agent states), `SCOPE` (what is in or out), `COST` (time, money, perf).

## Rounds

Repeat until the stop condition holds:

1. Pick the **5 or fewer** unknowns with the biggest blast radius: what is most expensive to
   reverse after shipping comes first.
2. Ask them together with AskUserQuestion. Each question states: the tag, what is unclear, your
   **recommended answer** (listed first), and what breaks if the choice is wrong.
3. Record each answer in the ledger. If an answer creates new unknowns, add them to the pool.
4. Do not re-ask a closed question or argue with a decision the user already made.

## Stop condition

Stop when no `DATA` or `SCOPE` unknown is open, or after 4 rounds, whichever is first. List
anything left open as `Deferred` with its risk.

## Output

A table: `# | tag | decision | source (user / found in code) | risk if wrong`, then one line:
**GO**, **GO WITH DEFERRALS**, or **NO-GO** and the single biggest reason.

## Self-correction

If the user says a question was pointless or an important one was missed, append a dated entry to
`DECISIONS.md` and adjust the ranking or tags above.
