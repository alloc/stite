import getBody from 'raw-body'
import * as http2 from 'http2'
import { Plugin, renderStateModule, SausContext, vite } from '../core'
import { globalCachePath } from '../core/paths'
import { renderPageState } from '../core/renderPageState'
import { ServedPage } from '../pages/servePage'
import { RenderedFile } from '../pages/types'
import { globalCache } from '../runtime/cache'
import { stateModuleBase } from '../runtime/constants'
import { getCachedState } from '../runtime/getCachedState'
import { stateModulesById } from '../runtime/stateModules'
import { formatAsyncStack } from '../vm/formatAsyncStack'

const { Http2ServerResponse } = http2

export const servePlugin = (onError: (e: any) => void) => (): Plugin[] => {
  // The server starts before Saus is ready, so we stall
  // any early page requests until it is.
  let init: PromiseLike<void>
  let didInit: () => void
  init = new Promise(resolve => (didInit = resolve))

  let context: SausContext
  let server: vite.ViteDevServer

  function isPageStateRequest(url: string) {
    return url.endsWith('.html.js')
  }
  function isStateModuleRequest(url: string) {
    return url.startsWith(stateModuleBase) && url.endsWith('.js')
  }

  const serveState: Plugin = {
    name: 'saus:serveState',
    resolveId(id) {
      return isPageStateRequest(id) || isStateModuleRequest(id) ? id : null
    },
    async load(id) {
      if (isPageStateRequest(id)) {
        await init
        const url = id.replace(/(\/index)?\.html\.js$/, '') || '/'
        const page = await server.renderPage(url)
        if (page) {
          return renderPageState(
            page,
            context.basePath,
            '@id/saus/src/client/helpers.ts'
          )
        }
      } else if (isStateModuleRequest(id)) {
        await init

        const stateModuleId = id.slice(7, -3)
        await getCachedState(stateModuleId, globalCache.loaders[stateModuleId])

        const stateEntry = globalCache.loaded[stateModuleId]
        if (stateEntry) {
          return renderStateModule(
            stateModuleId,
            stateEntry,
            '/@fs/' + globalCachePath
          )
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') {
          return next()
        }

        const url = req.url!.slice(context.basePath.length - 1) || '/'
        if (!isStateModuleRequest(url)) {
          return next()
        }

        try {
          const [id, args] = JSON.parse(
            (await getBody(req)).toString('utf8')
          ) as [string, any[]]

          const stateModule = stateModulesById.get(id)
          if (!stateModule) {
            return next()
          }

          await stateModule.load(...args)
          res.writeHead(200)
          res.end()
        } catch (error: any) {
          formatAsyncStack(
            error,
            server.moduleMap,
            [],
            context.config.filterStack
          )
          console.error(error)
          res.writeHead(500)
          res.end()
        }
      })
    },
  }

  let fileCache: Record<string, RenderedFile> = {}

  const servePages: Plugin = {
    name: 'saus:servePages',
    saus(c) {
      context = c
      server = c.server!
      init = {
        // Defer to the reload promise after the context is initialized.
        then: (...args) => (c.reloading || Promise.resolve()).then(...args),
      }
      didInit()
    },
    configureServer: server => () =>
      server.middlewares.use(async (req, res, next) => {
        await init

        let url = req.originalUrl!
        if (!url.startsWith(context.basePath)) {
          return next()
        }

        // Remove URL fragment, but keep querystring
        url = url.replace(/#[^?]*/, '')
        // Remove base path
        url = url.slice(context.basePath.length - 1) || '/'

        if (url in fileCache) {
          const { data, mime } = fileCache[url]
          return respond({
            body: typeof data == 'string' ? data : Buffer.from(data.buffer),
            headers: [['Content-Type', mime]],
          })
        }

        let { reloadId } = context
        await server.servePage(url).then(respond)

        function respond({ error, body, headers, push }: ServedPage = {}): any {
          if (reloadId !== (reloadId = context.reloadId)) {
            return (context.reloading || Promise.resolve()).then(() => {
              return server.servePage(url).then(respond)
            })
          }
          if (error) {
            onError(error)
            res.writeHead(500)
            res.end()
          } else if (body) {
            headers?.forEach(([key, value]) => res.setHeader(key, value))
            res.writeHead(200)
            if (push && res instanceof Http2ServerResponse) {
              const {
                HTTP2_HEADER_PATH,
                HTTP2_HEADER_CONTENT_TYPE,
                HTTP2_HEADER_ETAG,
              } = http2.constants
              for (const uri of push) {
                const headers = { [HTTP2_HEADER_PATH]: uri }
                const cachedFile = fileCache[uri]
                if (cachedFile) {
                  headers[HTTP2_HEADER_CONTENT_TYPE] = cachedFile.mime
                }
                res.stream.pushStream(headers, (err, stream, headers) => {
                  if (err) {
                    return
                  }

                  const dataRequest = cachedFile
                    ? Promise.resolve(cachedFile.data)
                    : server.transformRequest(uri).then(result => {
                        if (!result) {
                          return null
                        }
                        headers[HTTP2_HEADER_ETAG] = result.etag
                        return result.code
                      })

                  dataRequest
                    .then(data => {
                      stream.respond({ ':status': data == null ? 404 : 200 })
                      stream.end(data)
                    })
                    .catch(err => {
                      onError(err)
                      stream.respond({ ':status': 500 })
                      stream.end()
                    })
                })
              }
            }
            res.write(body)
            res.end()
          } else {
            next()
          }
        }
      }),
  }

  return [serveState, servePages]
}
