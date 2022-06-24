import { BaseContext, loadContext } from '@/context'
import { loadRoutes } from '@/loadRoutes'
import {
  moduleRedirection,
  overrideBareImport,
} from '@/plugins/moduleRedirection'
import { renderPlugin } from '@/plugins/render'
import { plural } from '@/utils/plural'
import { SausBundleConfig, vite } from '@/vite'
import { getViteFunctions, ViteFunctions } from '@/vite/functions'
import { warn } from 'misty'
import { startTask } from 'misty/task'
import path from 'path'
import { internalRedirects, ssrRedirects } from './moduleRedirects'
import { preBundleSsrRuntime } from './runtimeBundle'

type InheritedKeys = 'debugBase' | 'entry' | 'format' | 'moduleMap' | 'target'

export interface InlineBundleConfig
  extends Pick<SausBundleConfig, InheritedKeys> {
  outFile?: string
  write?: boolean
}

type RequiredKeys<T, P extends keyof T> = {} & Omit<T, P> & Required<Pick<T, P>>

/** @internal */
export interface BundleConfig
  extends RequiredKeys<SausBundleConfig, 'format' | 'type' | 'target'> {
  outFile?: string
}

export interface BundleContext extends BaseContext, ViteFunctions {
  command: 'build' | 'deploy'
  loadRoutes: () => Promise<void>
  bundle: BundleConfig
  /** The virtual module ID of the SSR bundle. */
  bundleModuleId: string
  /**
   * These plugins must be used whenever bundling a set of modules
   * that could import from the `saus` package.
   */
  bundlePlugins: vite.Plugin[]
  /**
   * Instead of writing public files to `build.outDir`,
   * call this function with each public file.
   */
  onPublicFile?: (name: string, data: Buffer) => void
}

export async function loadBundleContext<
  T extends Omit<BundleContext, 'command'> = BundleContext
>(
  options: InlineBundleConfig = {},
  inlineConfig: vite.UserConfig = {}
): Promise<T> {
  const context: BundleContext = (await loadContext('build', inlineConfig, [
    renderPlugin,
  ])) as any

  const bundleConfig = context.config.saus.bundle || {}
  const buildConfig = context.userConfig.build || {}

  let {
    debugBase = bundleConfig.debugBase,
    entry,
    format = bundleConfig.format || 'cjs',
    outFile,
    moduleMap = bundleConfig.moduleMap || 'inline',
    target = bundleConfig.target || 'node14',
    write = buildConfig.write,
  } = options

  if (outFile) {
    outFile = path.resolve(outFile)
  }

  if (debugBase) {
    const failure = validateDebugBase(debugBase, context.basePath)
    if (failure) {
      warn(`"debugBase" ${failure}`)
      debugBase = undefined
    }
  }

  if (entry === undefined) {
    entry = bundleConfig.entry
  }
  if (entry) {
    outFile ??= path.resolve(
      context.root,
      entry
        .replace(/^(\.\/)?src\//, (buildConfig.outDir || 'dist') + '/')
        .replace(/\.ts$/, format == 'cjs' ? '.js' : '.mjs')
    )
    entry = path.resolve(context.root, entry)
  }

  if (!outFile && write !== false) {
    throw Error(
      `[saus] The "outFile" option must be provided when ` +
        `"saus.bundle.entry" is not defined in your Vite config ` +
        `(and the "write" option is not false).`
    )
  }

  context.bundle = {
    ...bundleConfig,
    type: bundleConfig.type || 'script',
    entry,
    target,
    format,
    moduleMap,
    outFile,
    debugBase,
  }

  const { pluginContainer } = await vite.createTransformContext(
    context.config,
    false
  )

  Object.assign(context, getViteFunctions(pluginContainer))
  context.loadRoutes = () => {
    const loading = (async () => {
      const loading = startTask('Loading routes...')

      await loadRoutes(context)

      const routeCount =
        context.routes.length +
        (context.defaultRoute ? 1 : 0) +
        (context.catchRoute ? 1 : 0)

      loading.finish(`${plural(routeCount, 'route')} loaded.`)
    })()

    context.loadRoutes = () => loading
    return loading
  }

  context.bundleModuleId = '\0saus/bundle.js'
  context.bundlePlugins = [
    preBundleSsrRuntime(context),
    moduleRedirection([
      ...internalRedirects,
      ...ssrRedirects,
      overrideBareImport('saus/bundle', context.bundleModuleId),
    ]),
  ]

  return context as any
}

function validateDebugBase(debugBase: string, base: string) {
  return !debugBase.startsWith('/')
    ? `must start with /`
    : !debugBase.endsWith('/')
    ? `must end with /`
    : base !== '/' && debugBase.startsWith(base)
    ? `must not include "base"`
    : null
}
