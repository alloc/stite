import { prependBase } from '@/utils/base'
import { getPageFilename } from '@/utils/getPageFilename'
import { serializeImports } from '@/utils/imports'
import { collectCss } from '@/vite/collectCss'
import { getPreloadTagsForModules } from '@/vite/modulePreload'
import endent from 'endent'
import path from 'path'
import { DevContext } from '../context'
import { Plugin, RenderedPage, RuntimeConfig, vite } from '../core'
import { debug } from '../debug'
import { CommonServerProps } from '../getModuleRenderer'
import { RouteClients } from '../routeClients'

/**
 * This plugin is responsible for serving the generated client
 * modules in serve mode.
 */
export function routeClientsPlugin(): Plugin {
  let server: vite.ViteDevServer
  let context: DevContext
  let config: RuntimeConfig
  let routeClients: RouteClients

  return {
    name: 'saus:routeClients',
    apply: 'serve',
    configureServer(s) {
      server = s
    },
    saus(c) {
      context = c as DevContext
      routeClients = c.routeClients
      return {
        onRuntimeConfig(c) {
          config = c
        },
      }
    },
    resolveId(id, importer) {
      if (id.startsWith('/.saus/')) {
        return '\0' + path.basename(id)
      }
    },
    load(id) {
      return routeClients.clientsById[id]?.promise
    },
    transformIndexHtml: {
      enforce: 'pre',
      async transform(_, { filename, path }) {
        const tags: vite.HtmlTagDescriptor[] = []

        if (!filename.endsWith('.html')) {
          filename = getPageFilename(path.replace(/\?.*$/, ''))
        }

        type CachedPage = [RenderedPage, any]

        const pagePath = '/' + filename.replace(/(index)?\.html$/, '')
        const [page, error] =
          (await context.getCachedPage<CachedPage>(pagePath)) || []

        if (error) return
        if (!page) {
          return debug('Page %s not found, skipping transform', pagePath)
        }

        const base = context.basePath
        const timestamp = (page.props as CommonServerProps)._ts || 0
        const pageStateUrl = base + filename + '.js?t=' + timestamp
        const sausClientUrl = base + '@id/saus/client'

        // TODO: preload transient dependencies?
        const modulesToPreload = [
          pageStateUrl,
          sausClientUrl,
          ...page.stateModules.map(id =>
            prependBase(config.stateModuleBase + id + '.js', base)
          ),
        ]

        const importedCss = new Set<vite.ModuleNode>()
        const findImportedCss = async (entry: string) => {
          await server.transformRequest(entry)
          await server.moduleGraph
            .getModuleByUrl(entry)
            .then(mod => mod && collectCss(mod, server, importedCss))
        }

        const routeModuleId = page.route.moduleId
        if (routeModuleId) {
          await findImportedCss(routeModuleId)
        }

        const routeClient = routeClients.addRoute(page.route)
        if (routeClient && routeModuleId) {
          // Whether or not the layout is hydrated, we still
          // need to preload any imported stylesheets.
          await findImportedCss(routeClient.layoutEntry)

          // We don't know if the page is hydrated until the
          // client promise is resolved with a non-empty string.
          if (await routeClient.promise) {
            let sausClientImports = ['hydrate']
            let hydrateCall = endent`
              hydrate(client, props, document.getElementById("root"))
            `

            if (context.config.mode == 'development') {
              sausClientImports.push('renderErrorPage')
              hydrateCall += `.catch(renderErrorPage)`
            }

            // Hydrate the page.
            tags.push({
              injectTo: 'body',
              tag: 'script',
              attrs: { type: 'module' },
              children: endent`
                ${serializeImports({
                  [pageStateUrl]: 'props',
                  [sausClientUrl]: sausClientImports,
                })}

                import("${routeClient.url}").then(client => {
                  ${hydrateCall}
                })
              `,
            })

            modulesToPreload.push(
              prependBase(routeModuleId, base),
              prependBase(routeClient.url, base)
            )
          }
        }

        getPreloadTagsForModules(modulesToPreload, tags)

        // Inject stylesheet tags for CSS modules.
        const injectedStyles = await Promise.all(
          Array.from(
            importedCss,
            async (mod): Promise<vite.HtmlTagDescriptor> => ({
              injectTo: 'head',
              tag: 'style',
              attrs: {
                'data-id': mod.id,
              },
              children:
                '\n' +
                (await server.transformRequest(toDirectRequest(mod.url)))!
                  .code +
                '\n',
            })
          )
        )

        tags.push(...injectedStyles)
        return tags
      },
    },
  }
}

/** Add `?direct` so actual CSS is returned */
function toDirectRequest(url: string) {
  return url.replace(/(\?|$)/, q => '?direct' + (q ? '&' : ''))
}
