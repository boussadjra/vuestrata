# Native tables and list URLs

This migration serves 2.0.0 and its prereleases. It pins the Vueye and
QueryWeave packages, promotes the three table helpers together, migrates
recognized pristine examples and checks the complete buffered result before
applying anything.

`pristine.json` contains LF-normalized hashes read from the repository's local
1.x release tags and the last pre-2.0 revision,
`c3f3449e15052737c3c689f51b1d2d8dcce1deef`. The test fixtures under
`test/fixtures/cli/table-1.1/` preserve that revision's helper, bootstrap and
customer-route sources, so the guard tests also run in shallow checkouts.

Project-owned source copies live in `shipped/`, with `.txt` suffixes. Refresh
them after formatting the current implementation:

```bash
node packages/cli/migrations/2.0.0/shipped.mjs --write
node packages/cli/migrations/2.0.0/shipped.mjs --check
```

When a later 2.0 prerelease changes an example, first add the prior release's
hash to its pristine list. New companions must be attached to the route or
workflow that owns them. A colliding application-owned companion holds that
route back and receives an incoming review copy.

The final guard protects the shared table and query infrastructure and the
bootstrap installer. A conflict stops the entire release. Only absent incoming
review copies may be written; existing incoming files, application files,
dependencies and the recorded template version stay intact. Read-only planning
never flushes that buffer. Historical migrations are unchanged.

The 1.1 migration directory is archived by the hashes in `../frozen.json`.
Maintainer checks compare that archive with its baseline, and only compare this
active release's project copies with the current application source.
