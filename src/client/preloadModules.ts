import { BASE_URL } from './baseUrl.js'
import { injectLinkTag } from './head.js'

export function preloadModules(urls: string[]) {
  for (const url of urls)
    injectLinkTag(
      BASE_URL + url,
      url.endsWith('.css') ? 'stylesheet' : undefined
    )
}
