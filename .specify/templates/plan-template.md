# Implementation Plan: [FEATURE NAME]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

## Summary

[One-paragraph description of the technical approach and its key trade-offs.]

## Technical Context

- **Stack**: [e.g. Vue 3.5+, TypeScript 5.7+, Pinia, Vite Plus]
- **Affected area**: [List key files or modules]
- **Constraints**: [e.g. no layout changes, no public API breaks, vp toolchain only]

## Constitution Check

| Principle                     | Status      | Notes   |
| ----------------------------- | ----------- | ------- |
| I. Spec Before Code           | ✅ / ⚠ / ❌ | [notes] |
| II. Brownfield Safety         | ✅ / ⚠ / ❌ | [notes] |
| III. Vite Plus Toolchain      | ✅ / ⚠ / ❌ | [notes] |
| IV. Layer/Module Organization | ✅ / ⚠ / ❌ | [notes] |
| V. Single Source Of Truth     | ✅ / ⚠ / ❌ | [notes] |
| VI. Claims Match Reality      | ✅ / ⚠ / ❌ | [notes] |
| VII. Smallest Useful Slice    | ✅ / ⚠ / ❌ | [notes] |
| VIII. AI Legibility           | ✅ / ⚠ / ❌ | [notes] |

> ⚠ = justified exception (document below in Complexity Tracking)

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature-name]/
├── spec.md       # Feature specification
├── plan.md       # This file
└── tasks.md      # Actionable task list
```

### Source files affected

```text
src/
├── [layer]/
│   └── [file]                          # [reason]
└── [layer]/
    └── [file]                          # [reason]

test/
└── [test file]                         # [what is tested]
```

## Technical Direction

[Describe the solution approach in plain language. Include key decisions and rationale. Avoid pseudocode — reference actual file paths.]

## Risks

| Risk     | Mitigation     |
| -------- | -------------- |
| [Risk 1] | [Mitigation 1] |
| [Risk 2] | [Mitigation 2] |

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                | Why Needed     | Simpler Alternative Rejected Because   |
| ------------------------ | -------------- | -------------------------------------- |
| [e.g. added abstraction] | [current need] | [why simpler approach is insufficient] |
