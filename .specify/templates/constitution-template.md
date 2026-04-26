# [PROJECT_NAME] Constitution

<!-- Version: 1.0.0 | Ratified: [DATE] | Last amended: [DATE] -->

## Core Principles

### I. [PRINCIPLE_1_NAME]

[PRINCIPLE_1_DESCRIPTION]

### II. [PRINCIPLE_2_NAME]

[PRINCIPLE_2_DESCRIPTION]

### III. [PRINCIPLE_3_NAME]

[PRINCIPLE_3_DESCRIPTION]

### IV. [PRINCIPLE_4_NAME]

[PRINCIPLE_4_DESCRIPTION]

### V. [PRINCIPLE_5_NAME]

[PRINCIPLE_5_DESCRIPTION]

## Governance

### Amendment Procedure

1. Open a pull request with a diff to this file and a rationale comment in the PR description.
2. At least one human reviewer must approve the amendment.
3. On merge, bump the version line in the HTML comment at the top of this file.
4. Update the `Last amended` date in the version comment.

### Versioning Policy

- **Patch** (x.y.Z): Wording clarification with no change to principle intent.
- **Minor** (x.Y.0): Adding or removing a principle, or extending an existing one.
- **Major** (X.0.0): Any change that invalidates constraints in already-written `spec.md`, `plan.md`, or `tasks.md` files.

### Compliance Review

- Each spec's `plan.md` must include a **Constitution Check** section.
- At the end of an implementation PR, the submitter must confirm no principle was violated without justification.
