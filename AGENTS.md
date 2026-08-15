<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Vuestrata Architecture Rules

Everything below is project-specific and is not managed by Vite+.

## Route Pages Are Thin Inbound Adapters

A page under `src/modules/*/pages/` is the boundary between Vue Router and the
application. **A page coordinates; it does not implement.**

A page **may**:

- depend on Vue Router, and normalize route params and query params into typed
  application values (`useRouteParam`, `useRouteQueryParam`)
- handle route-level concerns: redirects, route metadata, document title,
  breadcrumb labels, layout selection, invalid-route and not-found states,
  route access
- invoke route-level queries and compose a feature screen

A page **must not** contain reusable feature or application logic: business
rules, feature permission policy, API details, mutations, cache invalidation,
form state machines, sorting/filtering algorithms, reusable table state, or
toast orchestration tied to a feature action. Put those in the owning module
under `src/modules/<name>/` and give them explicit inputs.

Feature and domain code **must not** depend on route components or raw router
state. `useRoute()`/`useRouter()` inside a feature is only acceptable when
navigation is genuinely that abstraction's job (nav components, breadcrumbs,
route tabs, links, `useAuth`'s post-login redirect).

Dependency direction is one-way:

```text
router → page → feature → shared/application infrastructure
```

Use the smallest abstraction that fits — a plain function for a deterministic
rule, a query/mutation composable for server state, a feature composable for a
cohesive reactive workflow, a component for presentation. Do not introduce
backend-style `Controller`/`Service`/`Repository`/`Facade` layers; the goal is
simpler code, not more layers.

Full rule, examples and smell checklist:
[`docs/2.architecture/4.route-pages.md`](docs/2.architecture/4.route-pages.md).
