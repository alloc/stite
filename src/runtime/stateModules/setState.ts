import { stateModulesByName } from '../cache/global.js'
import type { Cache } from '../cache/types.js'
import { getStateModuleKey } from '../getStateModuleKey.js'
import { hydrateState } from '../stateModules/hydrate.js'

/**
 * State modules must call this when loaded by the client.
 */
export function setState<Args extends readonly any[]>(
  name: string,
  args: Args,
  state: any,
  timestamp: number,
  maxAge?: Cache.MaxAge
): any {
  const key = getStateModuleKey(name, args)
  const served = { state, args, timestamp, maxAge }
  const module = stateModulesByName.get(name)
  if (module) {
    hydrateState(key, served, module)
  }
  return state
}
