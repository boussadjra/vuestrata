# Security Policy

## Reporting A Vulnerability

Please do not open a public issue for security-sensitive problems.

Preferred path:

- Use GitHub Security Advisories / private vulnerability reporting if enabled for the repository.
- If that is not available, contact the maintainers privately before public disclosure.

Include:

- affected version or commit
- reproduction steps
- impact assessment
- any suggested mitigation

## Response Expectations

- We will acknowledge valid reports as soon as practical.
- We will prioritize fixes for issues that affect published template consumers or expose user data.
- Public disclosure should wait until a fix or mitigation path exists.

## Scope

This includes:

- auth/session logic
- RBAC or permission bypasses
- CSP, headers, or deployment hardening regressions
- dependency or supply-chain issues that affect shipped template users
