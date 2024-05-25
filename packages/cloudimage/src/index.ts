import { addDeployHook, addDeployTarget, addSecrets } from 'saus/deploy'
import { Config } from './config.js'
import secrets from './secrets.js'

const hook = addDeployHook(() => import('./hook.js.js'))
addSecrets(useCloudimage, secrets)

export function useCloudimage(config: Config) {
  return addDeployTarget(hook, config)
}
