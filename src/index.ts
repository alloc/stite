import { Promisable } from 'type-fest'
import { UserConfig, vite } from './core/index.js'

export * from './bundle/runtime/api.js'
export type { OutputBundle } from './bundle/types.js'
export { Plugin, UserConfig, loadBundle, setEnvData, vite } from './core.js'

export const build = importWhenCalled(
    'build',
    () => import('./build/api.js.js')
  ),
  deploy = importWhenCalled('deploy', () => import('./deploy/api.js.js')),
  generateBundle = importWhenCalled(
    'bundle',
    () => import('./bundle/api.js.js')
  ),
  createServer = importWhenCalled(
    'createServer',
    () => import('./dev/api.js.js')
  )

// The type-casting below ensures the "saus" config is type-checked.
export const defineConfig = vite.defineConfig as (
  config: UserConfig | ((env: vite.ConfigEnv) => Promisable<UserConfig>)
) => vite.UserConfigExport

function importWhenCalled<T, P extends string, Module extends { [K in P]: T }>(
  name: P,
  importFn: () => Promise<Module>
): P extends keyof Module ? Function & Module[P] : never {
  let exports: any
  const wrapper = async (...args: any[]) => {
    const { [name]: fn } = await (exports ||= importFn())
    return fn(...args)
  }
  return wrapper as any
}
