# Release Process

## Versioning Policy

Vuestrata uses Semantic Versioning:

- `MAJOR` for breaking template/runtime/API changes
- `MINOR` for backward-compatible feature additions
- `PATCH` for fixes and doc/runtime alignment that does not break consumers

Supported prerelease channels:

- `alpha`
- `beta`
- `rc`

Examples:

- `2.1.0-alpha.0`
- `2.1.0-beta.2`
- `2.1.0-rc.1`

## Bump Commands

```bash
vpr version:show

vpr version:patch
vpr version:minor
vpr version:major

vpr version:prepatch
vpr version:preminor
vpr version:premajor

vpr version:prerelease
vpr version:prerelease:beta
vpr version:prerelease:rc

# explicit version or preid
vpr version:set -- 2.1.0-beta.0
vpr version:prerelease -- --preid beta
```

## Release Checklist

1. Run `vp check`.
2. Run `vpr test --run`.
3. Run `vpr test:e2e` for user-visible or routing changes.
4. Update `CHANGELOG.md`.
5. Bump the version with one of the scripts above.
6. Commit the version/changelog update.
7. Tag the release as `v<version>`.

Examples:

```bash
git tag v2.0.1
git tag v2.1.0-beta.0
git push origin v2.0.1
git push origin v2.1.0-beta.0
```

Tags containing a hyphen, such as `v2.1.0-beta.0`, are published by the GitHub release workflow as prereleases.
