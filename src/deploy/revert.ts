import { getDeployContext } from './context.js'
import { RevertFn } from './types.js'

export function onRevert(revertFn: RevertFn) {
  const ctx = getDeployContext()
  ctx?.revertFns.push(revertFn)
}
