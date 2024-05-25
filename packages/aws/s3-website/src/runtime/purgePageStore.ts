import { PurgePlugin } from 'saus'
import { emptyPageStore } from './emptyPageStore.js'
import { PurgeProps } from './types.js'

export function purgePageStore(props: PurgeProps): PurgePlugin {
  return {
    name: '@aws/s3-website:purgePageStore',
    purge(request) {
      if (request.globs.has('/*')) {
        return emptyPageStore(props)
      }
      // TODO: purge specific pages!
    },
  }
}
