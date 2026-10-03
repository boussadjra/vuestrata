// What a deployment sets when the app STARTS rather than when it is built.
//
// Every page loads this file before the app bundle. As shipped it overrides
// nothing, and the values inlined at build time apply. A deployment replaces
// it: the Docker image's entrypoint writes one from the container's
// environment, and nginx serves that copy instead of this one.
//
// A static host can do the same by hand at deploy time, for the
// runtime-overridable keys only (docs/6.configuration/1.environment.md):
//
//   window.__VUESTRATA_RUNTIME__ = { VUESTRATA_API_URL: 'https://api.example.com' }
//
// An empty string, or a placeholder nothing substituted such as
// '${VUESTRATA_API_URL}', counts as not set.
window.__VUESTRATA_RUNTIME__ ||= {}
