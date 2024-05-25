import path from 'path'
import { addDeployHook, addDeployTarget, getDeployContext } from 'saus/deploy'
import { Props } from './types.js'

const hook = addDeployHook(() => import('./hook.js'))

export function pushVercelFunctions(options: Props) {
  const { root } = getDeployContext()
  const functionDir = path.resolve(root, options.functionDir)
  return addDeployTarget(hook, {
    gitBranch: options.gitBranch,
    functionDir: path.relative(root, functionDir),
    entries: options.entries,
    minify: options.minify,
  })
}
