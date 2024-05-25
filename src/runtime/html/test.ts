import { HtmlVisitor } from './types.js'
import { bindVisitors } from './visitors/bind.js'

/** Used for testing purposes */
export function traverse(html: string, visitors: HtmlVisitor | HtmlVisitor[]) {
  return bindVisitors(visitors)(html, {
    page: {
      path: '/',
      html,
      files: [],
    },
    config: {
      assetsDir: 'assets',
      base: '/',
      bundleType: 'script',
      command: 'dev',
      defaultPath: '/404',
      minify: false,
      mode: 'development',
      publicDir: 'public',
      ssrRoutesId: '',
      stateCacheId: '',
    },
  })
}
