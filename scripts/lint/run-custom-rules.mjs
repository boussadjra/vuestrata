import path from 'node:path'

import { createConsola } from 'consola'

import { inlineVueHandlersPlugin } from './plugins/inline-vue-handlers.plugin.mjs'
import { moduleScopeStatePlugin } from './plugins/module-scope-state.plugin.mjs'

const logger = createConsola({
  level: 3,
  formatOptions: {
    colors: true,
    compact: false,
  },
})

const root = process.cwd()
const plugins = [inlineVueHandlersPlugin(), moduleScopeStatePlugin()]

let hasError = false

for (const plugin of plugins) {
  logger.start(`Running custom lint plugin: ${plugin.name}`)
  try {
    const result = plugin.check({ root, logger, path })
    if (!result?.ok) {
      hasError = true
      logger.error(result?.message ?? `Plugin failed: ${plugin.name}`)
    }
  } catch (error) {
    hasError = true
    logger.error(`Plugin crashed: ${plugin.name}`)
    logger.error(error)
  }
}

if (hasError) {
  process.exit(1)
}

logger.success('All custom lint plugins passed.')
