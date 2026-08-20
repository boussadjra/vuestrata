# vendor/

Third-party tarballs committed to the repository so a build never depends on a
host that can disappear.

## `comark-1.0.0-05679bb.tgz`

`comark` was previously declared as
`https://pkg.pr.new/comarkdown/comark/comark@05679bb`. `pkg.pr.new` serves
**ephemeral continuous-release builds**: the tarball for a given commit is not
retained indefinitely. When it is garbage-collected the URL 404s, and every
consumer of that spec — CI, the Docker image, a fresh clone — fails at
`vp install --frozen-lockfile` with no way to recover except changing the
dependency. That is a build-stopping single point of failure outside this
project's control.

The registry release (`comark@0.6.2` at the time of writing) is **not** a
drop-in replacement. It exports only `.`, `./plugins/*`, `./utils`, `./parse`
and `./render`. This project imports `comark/vue` and `comark/ast`, which exist
only in the unreleased 1.0 line. Downgrading would mean rewriting every docs
rendering component against an older API.

So the exact bytes that were already resolved are vendored here instead, and
`package.json` points at `file:vendor/comark-1.0.0-05679bb.tgz`. Same code,
same behaviour, no network dependency on a preview host.

### Replacing this with a registry release

When `comark@1.x` is published to npm:

1. `vp install comark@^1.0.0`
2. delete this tarball and the `vendor/` entry from `.dockerignore` if it was
   added there
3. `vpr build && vpr test --run` — the docs surface (`/docs`, the component
   showcase, the form builder) is what exercises it

Nothing else in the repository references this file.
