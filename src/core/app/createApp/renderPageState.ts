import { INDENT, RETURN, SPACE } from '@/tokens'
import { dataToEsm } from '@/utils/dataToEsm'
import { ParsedHeadTag } from '@/utils/parseHead'
import { App, CommonServerProps } from '../types'

export const getPageStateFactory = (
  app: App,
  ctx: App.Context
): App['renderPageState'] =>
  function renderPageState(page, preloadUrls) {
    const { path, props, head } = page
    const { base } = ctx.config

    const clientProps = (props as CommonServerProps)._clientProps
    const stateModuleKeys = new Set(
      props._included.map(loaded => loaded.module.key)
    )

    const nestedStateKeys: string[] = []
    const nestedStateAliases: string[] = []

    let code = dataToEsm(clientProps, '', (_, value) => {
      const nestedStateKey = value && value['@import']
      if (nestedStateKey) {
        let index = nestedStateKeys.indexOf(nestedStateKey)
        if (index < 0) {
          index = nestedStateKeys.push(nestedStateKey) - 1
          stateModuleKeys.delete(nestedStateKey)
        }
        const alias = 's' + (index + 1)
        nestedStateAliases[index] = alias
        return alias
      }
    })

    const imports = new Map<string, string[]>()
    const helpers: string[] = []

    if (nestedStateKeys.length) {
      helpers.push('importState')
      const idents = nestedStateAliases.join(',' + SPACE)
      code = `importState(${wrap(
        nestedStateKeys.map(quoteIndent).join(',' + RETURN),
        RETURN
      )}).then(([${idents}]) => (${code}))`
    } else {
      // For consistency's sake, always export a promise even if not
      // required.
      code = `Promise.resolve(${code})`
    }
    code = `export default ` + code

    if (props._inlined.length) {
      const inlined = props._inlined.map(loaded => {
        const { module } = loaded
        return app.renderStateModule(
          module.name,
          module.args || [],
          loaded.state,
          loaded.expiresAt,
          true
        )
      })

      imports.set(base + ctx.config.clientCacheId, ['setState'])
      code = inlined.join('\n') + '\n' + code
    }

    if (stateModuleKeys.size) {
      helpers.push('preCacheState')
      code =
        `await preCacheState(${wrap(
          Array.from(stateModuleKeys, quoteIndent).join(',' + RETURN),
          RETURN
        )})\n` + code
    }

    if (
      head.title ||
      head.stylesheet.length ||
      head.prefetch.length ||
      Object.keys(head.preload).length
    ) {
      const description = dataToEsm(head, '', (key, value) => {
        if (!value) return
        if (Array.isArray(value)) {
          // Omit empty arrays.
          return value.length ? undefined : ''
        }
        if ('value' in value) {
          // Convert head tag to its string value.
          return dataToEsm((value as ParsedHeadTag).value, '')
        }
        if (value.constructor == Object) {
          // Omit empty objects.
          return Object.keys(value).length ? undefined : ''
        }
      })
      helpers.push('describeHead')
      code = `describeHead("${path}",${SPACE}${description})\n` + code
    }

    if (preloadUrls?.length) {
      preloadUrls = preloadUrls.map(url => base + url)
      helpers.push('preloadModules')
      code = `preloadModules(${dataToEsm(preloadUrls, '')})\n` + code
    }

    if (helpers.length) {
      imports.set(base + ctx.config.clientHelpersId, helpers)
    }

    if (imports.size) {
      code =
        Array.from(
          imports,
          ([source, specifiers]) =>
            `import {${wrap(
              specifiers.join(',' + SPACE),
              SPACE
            )}} from "${source}"`
        ).join('\n') +
        '\n' +
        code
    }

    return code
  }

function quoteIndent(str: string) {
  return INDENT + wrap(str, '"')
}

function wrap(wrapped: string, wrapper: string) {
  return wrapper + wrapped + wrapper
}
