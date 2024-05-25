import type { vite } from '../vite.js'

export function getPreloadTagsForModules(
  moduleUrls: Iterable<string>,
  headTags: vite.HtmlTagDescriptor[]
) {
  for (const moduleUrl of moduleUrls) {
    headTags.push({
      injectTo: 'head',
      tag: 'link',
      attrs: {
        rel: 'modulepreload',
        href: moduleUrl,
      },
    })
  }
}
