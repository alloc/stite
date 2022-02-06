import { CacheControl, withCache } from '../core/withCache'
import { globalCache } from './cache'

/** Load state if missing from the global cache */
export const getCachedState = withCache(globalCache) as {
  <State = any>(cacheKey: string): Promise<State | undefined>
  <State = any>(
    cacheKey: string,
    loader: (cacheControl: CacheControl) => Promise<State>
  ): Promise<State>
}
