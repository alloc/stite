import * as vite from 'vite'
import type { BundleOptions, OutputBundle, PageBundle } from '../bundle'
import type { PublicFile } from '../publicDir'
import type { TestFramework } from '../test/api'
import { App } from './app/types'
import type { SausContext } from './context'
import type { ClientDescription } from './defineClient'
import type { Endpoint } from './endpoint'
import type { ModuleProvider } from './plugins/moduleProvider'
import { RenderModule } from './render'
import { RoutesModule } from './routes'
import type { RuntimeConfig } from './runtime/config'
import type { AbortSignal } from './utils/AbortController'
import './vite/requireHook'

export { vite }

export type Plugin = vite.Plugin

export type ResolvedConfig = Omit<vite.ResolvedConfig, 'saus'> & {
  readonly saus: Readonly<SausConfig>
}

export interface SausBundleConfig {
  /**
   * Path to the module bundled by the `saus bundle` command.
   * It should import `saus/bundle` (and optionally `saus/paths`)
   * to render pages on-demand and/or ahead-of-time.
   * @default null
   */
  entry?: string | false | null
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
   * Expose a debug version of your site, with sourcemaps and unminified
   * production files.
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
  /**
   * Control how the map of client modules is stored by the server.
   *
   * For the `"inline"` setting, client modules are inlined into the bundle
   * and encoded with Base64 if needed. This increases the bundle size
   * considerably.
   *
   * For the `"external"` setting, client modules are written to their own files
   * and loaded with `fs.readFileSync` on-demand.
   *
   * @default "inline"
   */
  moduleMap?: 'external' | 'inline'
  /**
   * Define which modules should never be bundled.
   */
  external?: string[]
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
   * Configure the `saus deploy` command.
   */
  deploy?: {
    /**
     * Path to the module that declares deploy targets.
     */
    entry: string
    /**
     * Which GitHub repository to use for the deployment cache.
     *
     * By default, Saus tries to parse this value from your `origin`
     * repository URL (as listed by `git remote` command).
     */
    githubRepo?: string
    /**
     * GitHub access token so the SSR bundle can load metadata
     * from the deployment cache.
     */
    githubToken?: string
  }
  /**
   * How many pages can be rendered at once.
   * @default os.cpus().length
   */
  renderConcurrency?: number
  /**
   * Where are state modules served from?
   * @default "/state/"
   */
  stateModuleBase?: string
  /**
   * Any `<link>` tags produced by renderers are stripped in favor of injecting
   * them through the page's state module via the `applyHead` client API. This
   * can drastically reduce the elapsed time before `<script>` tags are executed.
   * Always measure performance with and without this option, to see if you
   * actually need it.
   * @experimental
   */
  stripLinkTags?: boolean
  /**
   * Improve the TTFP (time to first paint) of each page by injecting `modulepreload`
   * tags after the first paint. The default behavior includes these tags in the
   * pre-rendered HTML.
   * @experimental
   */
  delayModulePreload?: boolean
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

declare module 'rollup' {
  interface PartialResolvedId {
    /**
     * Use `false` to prevent this module from being reloaded.
     *
     * Perfect for singleton modules that should be shared between
     * modules inside and outside the SSR module graph.
     */
    reload?: boolean
  }
}

declare module 'vite' {
  interface UserConfig {
    saus?: Partial<SausConfig>
    /**
     * You can't use `saus test` command until this is defined.
     */
    testFramework?: (
      config: import('./vite').UserConfig
    ) => Promise<TestFramework | { default: TestFramework }>
    /**
     * Filter the stack trace from an SSR error so there's
     * less noise from files you don't care about.
     */
    filterStack?: (source: string) => boolean
  }

  interface Plugin {
    /**
     * Provide plugin hooks specific to Saus.
     *
     * If a function is given, it's called after the `SausContext`
     * object is created or replaced (when the dev server is
     * restarted).
     */
    saus?:
      | SausPlugin
      | ((context: SausContext) => Promisable<SausPlugin | void>)
  }
}

export interface UserConfig extends Omit<vite.UserConfig, 'build'> {
  saus: SausConfig
  build?: BuildOptions
}

export interface BuildOptions extends vite.BuildOptions {
  /** Skip certain pages when pre-rendering. */
  skip?: (pagePath: string) => boolean
  /** Force a rebundle. */
  force?: boolean
  /** The bundle's mode (usually `development` or `production`) */
  mode?: string
  /**
   * Limit the number of worker threads.  \
   * Use `0` to run on the main thread only.
   */
  maxWorkers?: number
  /** The directory to load the cached bundle from. */
  cacheDir?: string
  /** Used to stop rendering the remaining pages. */
  abortSignal?: AbortSignal
  /** Include `sourcesContent` is cached bundle sourcemap. */
  sourcesContent?: boolean
}

type Promisable<T> = T | Promise<T>

export const defineConfig = vite.defineConfig as (
  config:
    | Promisable<vite.UserConfig>
    | ((env: vite.ConfigEnv) => Promisable<vite.UserConfig>)
) => vite.UserConfigExport

/**
 * Saus plugins are returned by the `saus` hook of a Vite plugin.
 */
export interface SausPlugin {
  /** Used for debugging. If undefined, the Vite plugin name is used. */
  name?: string
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
   * Inspect or mutate the `RuntimeConfig` object, which is serialized to
   * JSON and used by the SSR bundle. The runtime config is also used
   * in development.
   */
  onRuntimeConfig?: (config: RuntimeConfig) => Promisable<void>
  /**
   * Called after the routes are loaded or reloaded. Plugins can
   * modify the routes if they want.
   */
  receiveRoutes?: (context: RoutesModule) => Promisable<void>
  /**
   * Called after the renderers are loaded or reloaded. Plugins can
   * modify the renderers if they want.
   *
   * ⚠︎ This is only called when `saus dev` is used.
   */
  receiveRenderers?: (context: RenderModule) => Promisable<void>
  /**
   * Called after the dev app is created or replaced.
   */
  receiveDevApp?: (app: App) => Promisable<void>
  /**
   * Called before the SSR bundle is written to disk.
   *
   * ⚠︎ This is only called when `saus bundle` is used.
   */
  receiveBundle?: (
    bundle: OutputBundle,
    options: Readonly<BundleOptions>
  ) => Promisable<void>
  /**
   * Called before the SSR bundle is generated.
   *
   * ⚠︎ This is only called when `saus bundle` is used.
   */
  receiveBundleOptions?: (options: BundleOptions) => Promisable<void>
  /**
   * Called before rendered pages are written to disk.
   *
   * ⚠︎ This is only called when `saus build` is used.
   */
  onWritePages?: (pages: PageBundle[]) => void
  /**
   * In development only, SSR errors can be sent to the browser
   * for a better developer experience. The default behavior is
   * minimal but overridable via this plugin hook.
   */
  renderErrorReport?: (req: Endpoint.Request, error: any) => Promisable<string>
}
