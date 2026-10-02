import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

/**
 * `app/config/api.overrides.ts` reaches the API client through
 * `installSeams()`. The seeded file is empty in the template, so it is
 * replaced here by one that sets something of every kind: what is asserted is
 * the wiring, not the file's contents.
 *
 * Everything is imported after the mock, from a fresh module graph, so the
 * seams module reads the replaced file.
 */
const tenantHeader = vi.fn(() => 'acme')
const ownClassifier = vi.fn(() => null)
const ownMapper = vi.fn(() => null)

vi.mock('~/config/api.overrides', () => ({
  default: {
    headers: { 'X-Tenant': tenantHeader },
    classify: [ownClassifier],
    errors: [ownMapper],
    csrf: { source: 'cookie', name: 'csrftoken', header: 'X-CSRFToken' },
    timeoutMs: 4_000,
    tracing: { requestId: true },
  },
}))

let seams: typeof import('@/bootstrap/seams')
let runtime: typeof import('@/lib/runtime')
let integration: typeof import('@/lib/api/integration')
let i18n: typeof import('@/plugins/i18n')

beforeAll(async () => {
  vi.resetModules()
  seams = await import('@/bootstrap/seams')
  runtime = await import('@/lib/runtime')
  integration = await import('@/lib/api/integration')
  i18n = await import('@/plugins/i18n')
})

describe('api.overrides.ts wiring', () => {
  it('installs nothing until installSeams() runs', () => {
    expect(runtime.tryGetApiIntegration()).toBeNull()
    expect(integration.currentApiIntegration()).toBe(integration.DEFAULT_API_INTEGRATION)
  })

  it('installs the project overrides as the runtime slot', () => {
    seams.installSeams()
    const installed = runtime.tryGetApiIntegration()

    expect(installed).toMatchObject({
      csrf: { source: 'cookie', name: 'csrftoken', header: 'X-CSRFToken' },
      timeoutMs: 4_000,
      tracing: { requestId: true, requestIdHeader: 'X-Request-Id', traceparent: false },
    })
    // The project's first, the built-ins last.
    expect(installed!.classifiers[0]).toBe(ownClassifier)
    expect(installed!.classifiers).toHaveLength(2)
    expect(installed!.errorMappers[0]).toBe(ownMapper)
    expect(installed!.errorMappers).toHaveLength(2)
    expect(integration.currentApiIntegration()).toBe(installed)
  })

  it('runs Accept-Language before the project headers, from the active locale', async () => {
    seams.installSeams()
    const { requestHooks } = runtime.tryGetApiIntegration()!
    i18n.getI18n().global.locale.value = 'fr'

    const headers = new Headers()
    const order: string[] = []
    for (const hook of requestHooks) {
      await hook({
        url: 'http://localhost/api/orders',
        method: 'GET',
        headers,
        setHeader: (name, value) => {
          order.push(name)
          if (value === null || value === undefined) headers.delete(name)
          else headers.set(name, value)
        },
        hasCallerHeader: () => false,
      })
    }
    i18n.getI18n().global.locale.value = 'en'

    expect(order).toEqual(['Accept-Language', 'X-Tenant'])
    expect(Object.fromEntries(headers.entries())).toEqual({
      'accept-language': 'fr',
      'x-tenant': 'acme',
    })
    expect(tenantHeader).toHaveBeenCalledOnce()
  })

  it('is safe to call twice: the second install replaces the first', () => {
    seams.installSeams()
    const first = runtime.tryGetApiIntegration()
    seams.installSeams()

    const second = runtime.tryGetApiIntegration()
    expect(second).not.toBe(first)
    expect(second!.classifiers).toEqual(first!.classifiers)
    expect(second!.errorMappers).toEqual(first!.errorMappers)
    expect(second!.requestHooks).toHaveLength(first!.requestHooks.length)
  })
})
