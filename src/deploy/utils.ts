import { toObjectHash } from '@/utils/objectHash'
import { omitKeys } from '@saus/deploy-utils'
import { DeployPlugin, DeployTarget, DeployTargetId } from './types'

export function omitEphemeral(
  state: Record<string, any>,
  plugin: DeployPlugin
) {
  if (plugin.ephemeral) {
    return omitKeys(state, (_, key) => plugin.ephemeral!.includes(key))
  }
  return state
}

export function defineTargetId(
  target: DeployTarget,
  values: Record<string, any>
): asserts target is { _id: DeployTargetId } {
  Object.defineProperty(target, '_id', {
    value: { hash: toObjectHash(values), values },
  })
}