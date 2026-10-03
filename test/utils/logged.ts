import { vi } from 'vite-plus/test'

/**
 * What the app's logger wrote, while a test looks.
 *
 * `core/lib/logger` writes through consola's own reporter, straight to the
 * process's streams: a spy on `console.warn` sees nothing, and mocking the
 * logger module does not reach the modules `test/setup.ts` has already
 * loaded. Warnings and errors go to stderr, one line each, as
 * `[warn] [scope] message`.
 *
 * The lines are held back from the test output while the capture is on. Call
 * `restore()` when done (or rely on `vi.restoreAllMocks()`).
 */
export function captureLogged() {
  const lines: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk).trimEnd())
    return true
  })
  return {
    /** The warnings so far, without the `[warn]` prefix. */
    warnings: () =>
      lines
        .filter((line) => line.startsWith('[warn]'))
        .map((line) => line.slice('[warn]'.length).trim()),
    restore: () => spy.mockRestore(),
  }
}
