---
description: Run the right verification gates for what changed
---

Run the gates that match the change, cheapest first. Report actual output; do
not claim success you have not seen.

Always:

```bash
vp check                                   # format, lint, types
node scripts/lint/run-custom-rules.mjs     # six project rules
vp test --run                              # includes test/unit/architecture/
```

Add when relevant:

- routing, layouts, config, providers or runtime wiring changed → `vp build`
- user-visible flow or routing changed → `vp run test:e2e`
- docs, env or UI copy changed → `node scripts/docs/check-links.mjs`
- module `mockHandlers` or demo/production wiring touched →
  `vp build` then `node scripts/build/verify-bundle.mjs --mode=production`

Note: `test/component/users/user-management-components.test.ts` has 7
pre-existing failures on `main`. They are not yours unless you touched that area.
