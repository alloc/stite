import { AbortSignal } from 'node-abort-controller'
import * as vite from 'vite'
import type { RenderedPage } from '../bundle/types'
import type { ServePageFn } from '../pages/servePage'
import type { RenderedFile, RenderPageFn } from '../pages/types'
import type { ModuleProvider } from '../plugins/moduleProvider'
import type { PublicFile } from '../plugins/publicDir'
import type { TestFramework } from '../test'
import type { SourceMap } from '../utils/sourceMap'
import type { LinkedModuleMap, ModuleMap, RequireAsync } from '../vm/types'
import type { ClientDescription } from './client'
import type { SausContext } from './context'
import './viteRequire'

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

  interface ViteDevServer {
    /** Produce an HTML document for a given URL. */
    renderPage: RenderPageFn
    /** Like `renderPage` but with a result tuned for an HTTP response. */
    servePage: ServePageFn
    /** Files produced by a renderer and cached by a `servePage` call. */
    servedFiles: Record<string, RenderedFile>
    moduleMap: ModuleMap
    linkedModules: LinkedModuleMap
    externalExports: Map<string, any>
    require: RequireAsync
    ssrRequire: RequireAsync
    ssrForceReload?: (id: string) => boolean
  }

  interface Plugin {
    /**
     * Provide plugin hooks specific to Saus.
     *
     * If a function is given, it gets called whenever the Saus context
     * is created or replaced. When `saus dev` is used, it's also called
     * when the routes/renderers are updated.
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
  /** Use the bundle from last `saus build` run. */
  cached?: boolean
  /** The bundle's mode (usually `development` or `production`) */
  mode?: string
  /**
   * Limit the number of worker threads.  \
   * Use `0` to run on the main thread only.
   */
  maxWorkers?: number
  /** Use this bundle instead of generating one. */
  bundlePath?: string
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
   * Provide generated routes in addition to the user's routes.
   *
   * These routes work in development and SSR bundles. In SSR, these routes
   * are pre-generated, so they're constant between SSR instances.
   */
  routes?: (
    addRoute: typeof import('../routes').generateRoute
  ) => Promisable<void>
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
  /**
   * In development only, SSR errors can be sent to the browser
   * for a better developer experience. The default behavior is
   * minimal but overridable via this plugin hook.
   */
  renderErrorReport?: (url: string, error: any) => Promisable<string>
}
