import { addDeployHook, addDeployTarget } from 'saus/deploy'
import { PushConfig } from './config.js'

const hook = addDeployHook(() => import('./push-hook.js.js'))

/**
 * Push a local clone to its origin.
 */
export function gitPush(config: PushConfig) {
  return addDeployTarget(hook, config)
}
