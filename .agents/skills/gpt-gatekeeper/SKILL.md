---
name: gpt-gatekeeper
description: Automatically triggers ChatGPT via chatgpt-cli to perform strict architectural reviews and act as a quality gatekeeper before Antigravity advances across project phases.
---

# GPT Phase Gatekeeper & Review Skill

This skill enforces a formal **Senior Architect Review & Gatekeeper Protocol** between Antigravity (AGY) and ChatGPT (`chatgpt-cli`).

## Core Principle: No Phase Advancement Without GPT Approval

Whenever Antigravity completes the deliverables for an implementation phase (e.g. from `PROJECT_PLAN.md` or a major architectural milestone), Antigravity **MUST NOT** proceed to the next phase without obtaining `VERDICT: [APPROVED]` from the GPT Gatekeeper.

---

## When to Use This Skill

Trigger this review protocol:
1. At the conclusion of any major phase in `PROJECT_PLAN.md`.
2. Before committing major structural database migrations, RLS changes, or payment workflows.
3. When the user asks to "review my work with GPT", "get gpt approval", "run gatekeeper", or "check if ready for next phase".

---

## How to Execute the Gatekeeper Review

### 1. Verification Prerequisite
Before calling the gatekeeper, ensure local automated checks pass:
```bash
node scripts/validate-migrations.js
npm run typecheck
```

### 2. Invoke the Gatekeeper
Execute the gatekeeper script naming the target phase:
```bash
node scripts/gpt-gatekeeper.mjs "Phase 1: Project Foundation & Database Architecture"
```
Or via npm shortcut:
```bash
npm run review:phase -- "Phase 1: Project Foundation & Database Architecture"
```

---

## Protocol Rules for Antigravity (AGY)

1. **If Verdict is `VERDICT: [APPROVED]`**:
   - The review is saved under `docs/reviews/review_<phase>_<timestamp>.md`.
   - AGY marks the phase complete in `PROJECT_PLAN.md`.
   - AGY updates the user and safely advances to the next phase.

2. **If Verdict is `VERDICT: [CHANGES_REQUESTED]`**:
   - AGY **MUST STOP** and read the specific deficiencies listed by ChatGPT.
   - AGY methodically addresses each deficiency in code/SQL.
   - Re-runs validation checks.
   - Re-submits to `node scripts/gpt-gatekeeper.mjs` for a follow-up review until `[APPROVED]` is granted.

3. **Persistent Review Trail**:
   All reviews are permanently logged in `docs/reviews/` for full architectural traceability.
