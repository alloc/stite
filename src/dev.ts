import * as vite from 'vite'
import { klona } from 'klona'
import { debounce } from 'ts-debounce'
import { watch } from 'chokidar'
import { SausContext, loadContext, loadRoutes, resetRenderHooks } from './core'
import { clientPlugin } from './plugins/client'
import { routesPlugin } from './plugins/routes'
import { servePlugin } from './plugins/serve'
import { renderPlugin } from './plugins/render'
import { setContext } from './core/global'

export async function createServer(inlineConfig?: vite.UserConfig) {
  let context = await loadContext('serve', inlineConfig)
  let serverPromise = startServer(context, restart, onError).catch(onError)

  function restart() {
    serverPromise = serverPromise
      .then(async oldServer => {
        await oldServer?.close()
        context = await loadContext('serve', inlineConfig)
        return startServer(context, restart, onError, true)
      })
      .catch(onError)
  }

  function onError(e: any) {
    const { logger } = context
    if (!logger.hasErrorLogged(e)) {
      logger.error(e.message, { error: e })
    }
    return null
  }

  const { logger } = context
  if (logger.isLogged('info')) {
    logger.info('')
    const server = (await serverPromise)!
    vite.printHttpServerUrls(server.httpServer!, server.config)
  }

  return {
    restart,
    close: () =>
      serverPromise.then(server => {
        server?.close()
      }),
  }
}

async function startServer(
  context: SausContext,
  restart: () => void,
  onError: (e: any) => void,
  isRestart?: boolean
) {
  const contextPaths = [context.renderPath, context.routesPath]
  if (context.configPath) {
    contextPaths.push(context.configPath)
  }

  let config = klona(context.config)
  config = vite.mergeConfig(config, <vite.UserConfig>{
    configFile: false,
    plugins: [
      servePlugin(context),
      clientPlugin(context),
      routesPlugin(context),
      renderPlugin(context),
    ],
    server: {
      watch: {
        ignored: contextPaths,
      },
    },
  })

  // Listen immediately to ensure `buildStart` hook is called.
  const server = await vite.createServer(config)
  await server.listen(undefined, isRestart)

  context.routes = []
  resetRenderHooks(context)

  setContext(context)
  try {
    await loadRoutes(server)
  } finally {
    setContext(null)
  }

  // Tell plugins to update local state derived from Saus context.
  emitContextUpdate(server, context)

  const changedFiles = new Set<string>()
  const scheduleReload = debounce(async () => {
    if (changedFiles.has(context.configPath!)) {
      return restart()
    }
    try {
      await loadRoutes(server)

      // Restart if a config hook is added.
      if (context.configHooks.length) {
        return restart()
      }

      emitContextUpdate(server, context)
      changedFiles.forEach(file => server.watcher!.emit('change', file))
      changedFiles.clear()
    } catch (e) {
      onError(e)
    }
  }, 50)

  // Watch our context paths, so routes and renderers are hot-updated.
  const watcher = watch(contextPaths).on('change', file => {
    changedFiles.add(file)
    if (file == context.renderPath) {
      resetRenderHooks(context, true)
    } else if (file == context.routesPath) {
      context.routes = []
    }
    scheduleReload()
  })

  server.httpServer!.on('close', () => {
    watcher.close()
  })

  return server
}

function emitContextUpdate(server: vite.ViteDevServer, context: SausContext) {
  for (const plugin of server.config.plugins)
    hasContextUpdateHook(plugin) && plugin.contextUpdate(context)
}

function hasContextUpdateHook(
  plugin: any
): plugin is { contextUpdate: (context: SausContext) => void } {
  return !!plugin.contextUpdate
}
