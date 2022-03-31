import fs from 'fs'
import { gray, red, yellow } from 'kleur/colors'
import { warn } from 'misty'
import { startTask } from 'misty/task'
import path from 'path'
import { Multicast } from './build/multicast'
import {
  BundleDescriptor,
  loadPageFactory,
  PageEvents,
} from './build/pageFactory'
import { runBundle } from './build/runBundle'
import type { BuildWorker } from './build/worker'
import { printFiles, writePages } from './build/write'
import { bundle } from './bundle'
import type { RenderedPage } from './bundle/types'
import {
  BuildOptions,
  generateRoutePaths,
  MutableRuntimeConfig,
  RouteParams,
  SausContext,
  SourceMap,
  vite,
} from './core'
import { loadBundleContext } from './core/bundle'
import { ProfiledEventHandler } from './pages/types'
import { callPlugins } from './utils/callPlugins'
import { defer, Deferred } from './utils/defer'
import { emptyDir } from './utils/emptyDir'
import { getPagePath } from './utils/getPagePath'
import { prependBase } from './utils/prependBase'
import { loadTinypool } from './utils/tinypool'

export type FailedPage = { path: string; reason: string }
export type BuildResult = { pages: RenderedPage[]; errors: FailedPage[] }

export function build(options: BuildOptions) {
  const pages: RenderedPage[] = []
  const errors: FailedPage[] = []

  return new Promise<BuildResult>((resolve, reject) => {
    buildPages(pages, errors, options).then(
      () => resolve({ pages, errors }),
      reject
    )
    if (options.abortSignal)
      options.abortSignal.onabort = () => {
        resolve({ pages, errors })
      }
  })
}

async function buildPages(
  pages: RenderedPage[],
  errors: FailedPage[],
  options: BuildOptions
): Promise<void> {
  const buildPlugins = [setSourcesContent(options)]

  const context = await loadBundleContext(
    { write: false, entry: null, format: 'cjs', moduleMap: 'inline' },
    { mode: options.mode, plugins: buildPlugins }
  )

  const bundleFile = `bundle.${options.mode || 'production'}.js`
  if (options.cached) {
    options.bundlePath = path.join(context.compileCache.path, bundleFile)
  }

  type Bundle = { code: string; map?: SourceMap; cached?: true }

  let { code, map, cached }: Bundle =
    options.bundlePath && fs.existsSync(options.bundlePath)
      ? { code: fs.readFileSync(options.bundlePath, 'utf8'), cached: true }
      : await bundle(
          { isBuild: true, absoluteSources: true, preferExternal: true },
          context
        )

  const mapFile = bundleFile + '.map'
  if (map) {
    await context.compileCache.set(mapFile, JSON.stringify(map))
    code += '\n//# sourceMappingURL=' + mapFile
  }

  const filename = await context.compileCache.set(bundleFile, code)
  if (options.bundlePath == filename) {
    await context.compileCache.keep(mapFile)
  }

  const buildOptions = context.config.build
  const outDir = path.resolve(context.root, buildOptions.outDir)

  prepareOutDir(outDir, buildOptions.emptyOutDir, context)
  process.chdir(outDir)

  const profile: ProfiledEventHandler = (type, event) => {
    if (type == 'error') {
      console.log(red('» ' + type), event.url, gray(event.message))
    } else {
      const duration =
        event.duration >= 1e3
          ? event.duration.toFixed(2) + 's'
          : event.duration + 'ms'

      console.log(yellow('» ' + type), event.url, gray(duration))
    }
  }

  const runtimeConfig: Partial<MutableRuntimeConfig> | undefined = cached && {
    profile: options.maxWorkers === 0 ? profile : undefined,
    publicDir: path.relative(outDir, context.config.publicDir),
    ...pick(context.config.build, ['assetsDir']),
    ...pick(context.config.saus, [
      'delayModulePreload',
      'htmlTimeout',
      'renderConcurrency',
      'stripLinkTags',
    ]),
  }

  const workerEvents = new Multicast<PageEvents>()
  const workerData: BundleDescriptor = {
    root: context.root,
    code,
    filename,
    eventPort: undefined!,
    runtimeConfig,
    isProfiling: true,
  }

  // Default to serial rendering until #48 is fixed.
  options.maxWorkers ??= 1

  let worker: BuildWorker
  if (options.maxWorkers === 0) {
    workerData.eventPort = workerEvents.newChannel()
    worker = {
      renderPage: loadPageFactory(workerData),
    }
  } else {
    const WorkerPool = await loadTinypool()

    // https://github.com/debug-js/debug/issues/739#issuecomment-573442834
    if (process.env.DEBUG) {
      process.env.DEBUG_COLORS = 'true'
    }

    // Create a new channel every time this is accessed.
    Object.defineProperty(workerData, 'eventPort', {
      enumerable: true,
      configurable: true,
      get() {
        return WorkerPool.move(workerEvents.newChannel())
      },
    })

    const pool = new WorkerPool({
      filename: path.resolve(__dirname, 'build/worker.js'),
      workerData,
      maxThreads: options.maxWorkers,
      idleTimeout: Infinity,
      useAtomics: false,
    })

    worker = {
      renderPage: pool.run.bind(pool),
      destroy: pool.destroy.bind(pool),
    }
  }

  let pageCount = 0
  let renderCount = 0

  const progress = startTask(
    () => `${renderCount} of ${pageCount} pages rendered`
  )

  const failedRoutes = new Set<string>()
  const deferredPages = new Map<string, Deferred<void>>()
  const pageToRouteMap: Record<string, [string, RouteParams?]> = {}

  const renderPage = (
    routePath: string,
    params?: RouteParams,
    isDebug?: boolean
  ) => {
    const pagePath = getPagePath(routePath, params)
    if (!isDebug && options.skip && options.skip(pagePath)) {
      return
    }
    const deferredPage = defer<void>()
    deferredPages.set(pagePath, deferredPage)
    pageToRouteMap[pagePath] = [routePath, params]
    try {
      Promise.resolve(
        worker.renderPage(context.basePath + pagePath.slice(1))
      ).catch(e => {
        deferredPage.reject(e)
        deferredPages.delete(pagePath)
      })
      pageCount++
      progress.update()
    } catch (e: any) {
      deferredPage.reject(e)
      deferredPages.delete(pagePath)
    }
  }

  workerEvents
    .on('profile', profile)
    .on('page', (pagePath, page) => {
      if (page) {
        pages.push(page)
        renderCount++

        // Render the debug view after the production view.
        const { debugBase } = context.bundle
        if (debugBase && !pagePath.startsWith(debugBase)) {
          let [routePath, params] = pageToRouteMap[pagePath]
          routePath = prependBase(routePath, debugBase)
          renderPage(routePath, params, true)
        }
      } else {
        pageCount--
      }
      progress.update()
      deferredPages.get(pagePath)!.resolve()
      deferredPages.delete(pagePath)
    })
    .on('error', (pagePath, stack) => {
      const [routePath] = pageToRouteMap[pagePath]
      if (!failedRoutes.has(routePath)) {
        failedRoutes.add(routePath)
        errors.push({
          path: routePath,
          reason: stack,
        })
      }
    })

  await generateRoutePaths(context, {
    path: renderPage,
    error: e => errors.push(e),
  })

  const { abortSignal } = options
  if (abortSignal)
    abortSignal.onabort = () => {
      // Prevent errors from surfacing after we're aborted.
      deferredPages.forEach(deferredPage => deferredPage.resolve())
    }

  while (deferredPages.size && !abortSignal?.aborted)
    await Promise.all(deferredPages.values())

  progress.finish()
  if (worker.destroy) {
    await worker.destroy()
  }

  if (buildOptions.write !== false && !abortSignal?.aborted) {
    await callPlugins(context.plugins, 'onWritePages', pages)
    const { inlinedAssets } = runBundle(workerData)
    const files = writePages(pages, outDir, inlinedAssets)
    printFiles(
      context.logger,
      files,
      vite.normalizePath(path.relative(context.root, outDir)) + '/',
      buildOptions.chunkSizeWarningLimit,
      context.bundle.debugBase
    )
  }
}

function prepareOutDir(
  outDir: string,
  emptyOutDir: boolean | null | undefined,
  context: SausContext
) {
  if (fs.existsSync(outDir)) {
    if (
      emptyOutDir == null &&
      !vite.normalizePath(outDir).startsWith(context.root + '/')
    ) {
      warn(
        `The \`build.outDir\` will not be emptied, since it exists outside the project root.\n` +
          `Set \`build.emptyOutDir\` to override.`
      )
    } else if (emptyOutDir !== false) {
      emptyDir(outDir, ['.git'])
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

function setSourcesContent(options: BuildOptions): vite.Plugin {
  return {
    name: 'saus:build:setSourcesContent',
    generateBundle(_, chunks) {
      for (const chunk of Object.values(chunks)) {
        if (chunk.type == 'chunk' && chunk.map) {
          if (!options.sourcesContent) {
            chunk.map.sourcesContent = []
          } else {
            const sourcesContent = (chunk.map.sourcesContent ||= [])
            chunk.map.sources.forEach((source, i) => {
              try {
                sourcesContent[i] ||= fs.readFileSync(source, 'utf8')
              } catch {}
            })
          }
        }
      }
    },
  }
}

function pick<T, P extends (keyof T)[]>(
  obj: T,
  keys: P,
  filter: (value: any, key: P[number]) => boolean = () => true
): Pick<T, P[number]> {
  const picked: any = {}
  for (const key of keys) {
    const value = obj[key]
    if (filter(value, key)) {
      picked[key] = value
    }
  }
  return picked
}
