# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3…)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Project initialization and shared infrastructure.

- [ ] T001 [task description with file path]
- [ ] T002 [P] [task description with file path]

---

## Phase 2: Foundational

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 [task description with file path]
- [ ] T004 [P] [task description with file path]

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: US1 — [Story Title] (Priority: P1) 🎯 MVP

**Story goal**: [What this phase completes]

- [ ] T005 [US1] [task description with file path]
- [ ] T006 [US1] [P] [task description with file path]

**US1 checkpoint**: [Verifiable success condition]

---

## Phase 4: US2 — [Story Title] (Priority: P2)

**Story goal**: [What this phase completes]

- [ ] T007 [US2] [task description with file path]
- [ ] T008 [US2] [P] [task description with file path]

**US2 checkpoint**: [Verifiable success condition]

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] TN01 Run `vp check`
- [ ] TN02 [P] Run `vpr test --run` focused on [test files]
- [ ] TN03 [P] Run `vpr build`

---

## Dependencies & Execution Order

```
T001–T002 (parallel setup) → T003–T004 (parallel foundational)
T003, T004 → T005–T006 (US1, T006 parallel)
T005–T006 → T007–T008 (US2, T008 parallel)
T007–T008 → TN01–TN03 (polish, TN02/TN03 parallel)
```
