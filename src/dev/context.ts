import type { App, RenderedFile } from '@/app/types'
import type { BaseContext } from '@/context'
import type { ParsedUrl } from '@/node/url'
import type { Promisable } from '@/utils/types'
import type { vite } from '@/vite'
import type { ViteFunctions } from '@/vite/functions'
import type { RequireAsyncConfig } from '@/vm/asyncRequire'
import type { RequireAsync } from '@/vm/types'
import type { DevEventEmitter } from './events'
import type { HotReloadFn } from './hotReload'

export interface DevContext extends BaseContext, DevState, DevMethods {
  // Overrides
  command: 'serve'
  ssrRequire: RequireAsync
}

type PageSetupHook = (url: ParsedUrl) => Promisable<void>

type RequireConfig = Required<
  Pick<RequireAsyncConfig, 'moduleMap' | 'externalExports' | 'linkedModules'>
>

interface DevState extends RequireConfig {
  app: App
  events: DevEventEmitter
  server: vite.ViteDevServer
  watcher: vite.FSWatcher
  /** Defines which files in `node_modules` have live exports. */
  liveModulePaths: Set<string>
  /** These hooks are called before each page is rendered. */
  pageSetupHooks: PageSetupHook[]
  /** Files emitted by a renderer are cached here. */
  servedFiles: Record<string, RenderedFile>
}

interface DevMethods extends ViteFunctions {
  hotReload: HotReloadFn
  require: RequireAsync
  ssrForceReload?: (id: string) => boolean
}
