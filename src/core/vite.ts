import * as vite from 'vite'
import { RenderedPage } from '../bundle/types'
import { ModuleProvider } from '../plugins/moduleProvider'
import { PublicFile } from '../plugins/publicDir'
import { SourceMap } from '../utils/sourceMap'
import { ClientDescription } from './client'
import { SausContext } from './context'
import './viteRequire'

export { vite }

export type ResolvedConfig = vite.ResolvedConfig & {
  readonly saus: Readonly<SausConfig>
}

export interface SausBundleConfig {
  /**
   * Path to the module bundled by the `saus bundle` command.
   * It should import `saus/bundle` (and optionally `saus/paths`)
   * to render pages on-demand and/or ahead-of-time.
   * @default null
   */
  entry?: string | null
  /**
   * For serverless functions, you'll want to set this to `"worker"`.
   * @default "script"
   */
  type?: 'script' | 'worker'
  /**
   * Set `build.target` for the SSR bundle.
   * @default "node14"
   */
  target?: vite.BuildOptions['target']
  /**
   * The module format of the generated SSR bundle.
   * @default "cjs"
   */
  format?: 'esm' | 'cjs'
  /**
   * When defined, client modules
   */
  debugBase?: string
  /**
   * Minify the SSR bundle.
   * @default false
   */
  minify?: boolean
  /**
   * Force certain imports to be isolated such that every page rendered
   * will use a separate instance of the resolved module. This option is
   * useful when a dependency has global state, but you still want to
   * use parallel rendering. Your project's local modules are isolated
   * by default.
   */
  isolate?: (string | RegExp)[]
}

export interface SausConfig {
  /**
   * Path to the module containing `route` calls.
   */
  routes: string
  /**
   * Path to the module containing `render` calls.
   */
  render: string
  /**
   * How many pages can be rendered at once.
   * @default os.cpus().length
   */
  renderConcurrency?: number
  /**
   * Assume this page path when using the default route in build mode
   * and SSR mode.
   * @default "/404"
   */
  defaultPath?: string
  /**
   * The number of seconds each HTML processor has before a timeout
   * error is thrown.
   *
   * Set to `0` to disable timeouts.
   * @default 10
   */
  htmlTimeout?: number
  /**
   * Options for the SSR bundle generated by `saus bundle`.
   */
  bundle?: SausBundleConfig
  /**
   * Renderer packages need to add their `defineClient` object
   * to this array, so the SSR bundler can prepare build artifacts
   * used by the SSR bundle to generate client modules.
   */
  clients?: ClientDescription[]
}

declare module 'vite' {
  interface UserConfig {
    saus?: Partial<SausConfig>
    /**
     * Filter the stack trace from an SSR error so there's
     * less noise from files you don't care about.
     */
    filterStack?: (source: string) => boolean
  }
}

export interface UserConfig extends vite.UserConfig {
  saus: SausConfig
}

export interface BuildOptions extends vite.BuildOptions {
  maxWorkers?: number
}

type Promisable<T> = T | Promise<T>

export const defineConfig = vite.defineConfig as (
  config:
    | Promisable<vite.UserConfig>
    | ((env: vite.ConfigEnv) => Promisable<vite.UserConfig>)
) => vite.UserConfigExport

export interface SausPlugin {
  /**
   * Called when the Saus context is created or replaced.
   * When `saus dev` is used, this hook is also called when
   * the routes/renderers are updated.
   */
  onContext?: (context: SausContext) => Promisable<void>
  /**
   * Transform files from the `publicDir` when the `copyPublicDir`
   * plugin is active in the project.
   */
  transformPublicFile?: (file: PublicFile) => Promisable<void>
  /**
   * Define virtual modules and/or return an array of side-effectful module
   * identifiers to be imported by the SSR bundle.
   */
  fetchBundleImports?: (
    modules: ModuleProvider
  ) => Promisable<string[] | null | void>
  /**
   * Called before the SSR bundle is written to disk.
   * This is only called when `saus bundle` is used.
   */
  onWriteBundle?: (bundle: {
    path: string
    code: string
    map?: SourceMap
  }) => void
  /**
   * Called before rendered pages are written to disk.
   * This is only called when `saus build` is used.
   */
  onWritePages?: (pages: RenderedPage[]) => void
}

export interface Plugin extends vite.Plugin {
  saus?: SausPlugin
}
