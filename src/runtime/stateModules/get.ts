import { klona as deepCopy } from '@utils/klona'
import { Cache } from '../cache/types.js'
import { getLoadedStateOrThrow } from '../getLoadedStateOrThrow.js'
import { getStateModuleKey } from '../getStateModuleKey.js'
import type { StateModule } from '../stateModules.js'

/**
 * Unwrap a state module with the given arguments. \
 * Throws an error when the state isn't already loaded.
 */
export function getState<T, Args extends readonly any[]>(
  cache: Cache,
  module: StateModule<T, Args, any>,
  args: Args
) {
  const key = getStateModuleKey(module.name, args)
  const cached = getLoadedStateOrThrow(cache, key, args)
  return deepCopy(cached) as Cache.Entry<T>
}
