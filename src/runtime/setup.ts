import type { RuntimeHook } from './config.js'
import { routesModule } from './global.js'

/**
 * Set up the runtime according to the given environment.
 *
 * Can only be called from your `saus.routes` module or from
 * a module imported by it (directly or transiently).
 */
export function setup(hook: RuntimeHook) {
  routesModule.runtimeHooks.push(hook)
}
