import { warn } from 'misty'
import { startTask } from 'misty/task'
import path from 'path'
import {
  moduleRedirection,
  overrideBareImport,
} from '../../plugins/moduleRedirection'
import { renderPlugin } from '../../plugins/render'
import { plural } from '../../utils/plural'
import { loadContext, SausContext } from '../context'
import { loadRoutes } from '../loadRoutes'
import { bundleDir, clientDir, httpDir } from '../paths'
import { SausBundleConfig, vite } from '../vite'
import { internalRedirects } from './internalRedirects'
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

export interface BundleContext extends SausContext {
  bundle: BundleConfig
  /** The virtual module ID of the SSR bundle. */
  bundleModuleId: string
  /**
   * These plugins must be used whenever bundling a set of modules
   * that could import from the `saus` package.
   */
  bundlePlugins: vite.Plugin[]
}

export async function loadBundleContext(
  options: InlineBundleConfig = {},
  inlineConfig: vite.UserConfig = {}
) {
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

  const loading = startTask('Loading routes...')
  await loadRoutes(context, (id, importer) =>
    pluginContainer.resolveId(id, importer!, { ssr: true })
  )

  const routeCount = context.routes.length + (context.defaultRoute ? 1 : 0)
  loading.finish(`${plural(routeCount, 'route')} loaded.`)

  await pluginContainer.close()

  context.bundleModuleId = '\0saus/main.js'
  context.bundlePlugins = [
    await preBundleSsrRuntime(context),
    moduleRedirection([
      ...internalRedirects,
      overrideBareImport('saus', path.join(bundleDir, 'index.ts')),
      overrideBareImport('saus/bundle', context.bundleModuleId),
      overrideBareImport('saus/client', path.join(clientDir, 'index.ssr.ts')),
      overrideBareImport('saus/core', path.join(bundleDir, 'core/index.ts')),
      overrideBareImport('saus/http', path.join(httpDir, 'index.ts')),
    ]),
  ]

  return context
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
