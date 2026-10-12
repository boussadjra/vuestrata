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

## Known Issues and Deliberate Trade-offs

Documented here so nobody has to rediscover them, and so none of them can be
mistaken for a security control that actually holds.

### `comark` is a vendored pre-release, not a registry version

`package.json` resolves `comark` from `file:vendor/comark-1.0.0-05679bb.tgz`, a
tarball committed to this repository. It holds the exact bytes of the `1.0.0`
pre-release build that used to be fetched from `pkg.pr.new`, a host that does
not retain its builds, so a clean checkout no longer depends on it.
`pnpm-lock.yaml` records the tarball's `integrity` digest, as it does for a
registry package.

What remains is that it is not a registry release: no advisory feed covers it,
and upgrading it is a manual step (`vendor/README.md`).

**Why it has not been replaced.** `comark` _is_ on npm, but the registry release
(`0.6.2` when this was vendored) and the `1.0.0` pre-release have incompatible
entry points:

| Import used here   | In `1.0.0` (vendored) | In `0.6.2` (registry) |
| ------------------ | --------------------- | --------------------- |
| `comark/vue`       | yes                   | **no**                |
| `comark/ast`       | yes                   | **no**                |
| `comark/plugins/*` | yes                   | yes                   |

`comark/vue` and `comark/ast` do not exist in the registry release, so moving to
it is not a version bump — it means rewriting the documentation rendering layer
across the eight files that consume it (`app/config/comark*.ts` and the
`components/docs/*` components).

**Status.** A known gap, tracked in `docs/9.readiness.md`. It serves only the
in-app documentation. Dependabot is configured to ignore the package so it does
not generate PRs that cannot resolve.

### The demo integrity digest is not an authentication mechanism

Demo data in IndexedDB is wrapped in an envelope carrying an `integrityHash`:
`SHA-256(payload + ':' + DEMO_SALT)`.

- It is a **salted digest, not an HMAC**, despite what older documentation said.
- `DEMO_SALT` is a public constant compiled into the client bundle
  (`app/state/demo-storage.ts`). Anything in a client bundle is readable, so it
  cannot be a secret. `e2e/helpers/auth.ts` reproduces it deliberately to seed
  test state.

Its purpose is detecting accidental corruption and version skew in demo data. It
provides no tamper resistance and is not a security boundary. Demo state only
exists in demo builds.

### Frontend RBAC is a UI concern only

The permission system in `core/lib/rbac` decides what the interface offers. It
runs in the browser, on data the browser can modify, and is therefore **not** an
authorization boundary. Every permission it expresses must be independently
enforced by the backend. See `docs/6.configuration/2.auth-rbac.md`.

### The mock adapter cannot authenticate anyone

`AUTH_ADAPTER=mock` validates credentials against records in the browser's own
IndexedDB. Anyone who opens devtools can grant themselves any role. That is
acceptable for a demo and catastrophic anywhere else.

It is not left to discipline. The env schema makes `mock` a **hard build error**
outside demo mode, and `scripts/build/verify-bundle.mjs` asserts that a
production artifact contains no demo store, no demo salt and no demo account
address. Both run in CI, so shipping the demo adapter to production requires
deliberately disabling two independent checks.

### Domain permissions are a closed union

Permissions are a TypeScript union, not `string`. `can('order:manage')` — note
the missing plural — is a compile error rather than a check that silently
returns false and hides a page.

The demo account, the RBAC registry and the e2e helper all derive their
permission lists from `resolveRolePermissions('super_admin')` rather than
hardcoding them. Four hand-written copies previously drifted apart, and a stale
copy means a role silently loses access to pages it should have. This is a
correctness property, not a security one — the backend remains the authority.

### Environment variables are public

Every `VUESTRATA_*` variable is inlined into the client bundle at build time and
is readable by anyone who loads the app. Never put secrets, API keys, or OAuth
client secrets in them. An error-reporting DSN is safe (it is a public ingest
endpoint); a provider API token is not.
