import endent from 'endent'
import * as vite from 'vite'
import { Client, SausContext, Plugin } from '../core'
import { getPageFilename } from '../pages'
import { collectCss } from '../preload'

const clientPrefix = '/@saus/'

export function isClientUrl(id: string) {
  return id.startsWith(clientPrefix)
}

export function getClientUrl(id: string) {
  return clientPrefix + id
}

export function clientPlugin({
  renderPath,
  pages,
  configEnv,
}: SausContext): Plugin {
  let server: vite.ViteDevServer | undefined
  let client: Client | undefined

  return {
    name: 'saus:client',
    configureServer(s) {
      server = s
    },
    async contextUpdate() {
      const { moduleGraph } = server!
      moduleGraph.urlToModuleMap.forEach((mod, url) => {
        isClientUrl(url) && moduleGraph.invalidateModule(mod)
      })
    },
    resolveId(id, importer) {
      if (isClientUrl(id)) {
        return id
      }
      if (importer && isClientUrl(importer)) {
        return this.resolve(id, renderPath, {
          skipSelf: true,
        })
      }
    },
    load(id) {
      if (isClientUrl(id)) {
        return client
      }
    },
    transformIndexHtml: {
      enforce: 'pre',
      async transform(_, { filename, path }) {
        const tags: vite.HtmlTagDescriptor[] = []

        if (!filename.endsWith('.html')) {
          filename = getPageFilename(path)
        }

        const page = pages[filename]
        client = page.client

        // Include the JSON state defined by the renderer.
        tags.push({
          injectTo: 'body',
          tag: 'script',
          attrs: { id: 'initial-state', type: 'application/json' },
          children: JSON.stringify(page.state),
        })

        const routeModuleId = page.routeModuleId
        const cssUrls = new Set<string>()

        if (server) {
          // Cache the main route module.
          await server.transformRequest(routeModuleId)

          // Find CSS modules used by the route module.
          await server.moduleGraph
            .getModuleByUrl(routeModuleId)
            .then(mod => mod && collectCss(mod, cssUrls))
        }

        if (client) {
          const clientUrl = getClientUrl(client.id)

          // Inject the <script> tag for generated client.
          tags.push({
            injectTo: 'body',
            tag: 'script',
            attrs: {
              type: 'module',
              src: clientUrl,
            },
          })

          if (server) {
            // Cache the generated client.
            await server.transformRequest(clientUrl)

            // Find CSS modules used by the generated client.
            await server.moduleGraph
              .getModuleByUrl(clientUrl)
              .then(mod => mod && collectCss(mod, cssUrls))
          }
        }

        const sausClientId =
          (configEnv.mode === 'production' ? '' : '/@id/') + 'saus/client'

        // Hydrate the page.
        tags.push({
          injectTo: 'body',
          tag: 'script',
          attrs: { type: 'module' },
          children: endent`
            import * as routeModule from "${routeModuleId}"
            import { hydrate, state } from "${sausClientId}"
            hydrate(routeModule, {
              path: location.pathname,
              params: state.routeParams,
              state,
            })
          `,
        })

        // Inject stylesheet tags for CSS modules.
        cssUrls.forEach(href =>
          tags.push({
            injectTo: 'head',
            tag: 'link',
            attrs: { href, rel: 'stylesheet' },
          })
        )

        return tags
      },
    },
  }
}
