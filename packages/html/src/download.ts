import { relative } from '@cush/relative'
import fs from 'fs'
import MagicString from 'magic-string'
import path from 'path'
import { EnforcementPhase, get, md5Hex, setup } from 'saus/core'
import { debug } from './debug'
import { isExternalUrl } from './isExternalUrl'
import { HtmlTagPath } from './path'
import { $ } from './selector'
import { traverseHtml } from './traversal'
import { HtmlDocument, HtmlVisitorState } from './types'

type File = [FilePromise, ((url: string) => void)[]]
type FilePromise = Promise<string | Buffer>

interface FileCache extends Map<string, File> {
  load(
    url: string,
    fetch: (url: string, files: FileCache) => FilePromise,
    onLoad: (newUrl: string) => void
  ): void
}

export type DownloadOptions = {
  enforce?: EnforcementPhase
  skip?: (url: string) => boolean
  onRequest?: (url: string) => void
  onResponse?: (url: string, content: string | Buffer) => void
  onWriteFile?: (fileName: string) => void
  /**
   * Override the default behavior of writing to the `outDir`.
   */
  writeFile?: (
    fileName: string,
    content: string | Buffer,
    state: HtmlVisitorState
  ) => Promise<void> | void
}

/**
 * Find any external assets referenced by each page's HTML and
 * download them to be self-hosted. This hook does nothing when
 * the `saus dev` command is used.
 */
export function downloadRemoteAssets(options?: DownloadOptions) {
  setup(env => env.command !== 'dev' && installHtmlHook())
}

function defaultWriteFile(fileName: string, content: string | Buffer) {
  fs.mkdirSync(path.dirname(fileName), { recursive: true })
  fs.writeFileSync(fileName, content)
}

function installHtmlHook({
  skip = () => false,
  onRequest,
  onResponse,
  onWriteFile,
  writeFile = defaultWriteFile,
  ...options
}: DownloadOptions = {}) {
  // Reuse `fetch` calls between pages.
  const requests: { [url: string]: Promise<Buffer> } = {}

  const filesByDocument = new WeakMap<HtmlDocument, FileCache>()
  const getFiles = (tag: HtmlTagPath) => {
    let files = filesByDocument.get(tag.document)!
    if (!files) {
      files = new Map() as FileCache
      files.load = (url, fetch, onLoad) => {
        if (skip(url)) {
          return debug(`skipped asset: ${url}`)
        }
        const file = toFilePath(url)
        const listeners = files.get(file)?.[1]
        if (listeners) {
          listeners.push(onLoad)
        } else {
          debug(`loading asset: ${url}`)
          const loading = fetch(url, files)
          files.set(file, [loading, [onLoad]])
        }
      }
      filesByDocument.set(tag.document, files)
    }
    return files
  }

  traverseHtml(options.enforce, [
    {
      html: {
        async close(tag, state) {
          const { config } = state
          // Don't await file promises until the entire document is processed.
          // This allows other HTML manipulation to occur while downloading.
          await Promise.all(
            Array.from(getFiles(tag), async ([file, [loading, listeners]]) => {
              const ext = path.extname(file)
              try {
                const content = await loading
                const contentHash = md5Hex(content).slice(0, 8)
                const fileName = path.posix.join(
                  config.assetsDir,
                  `${file.slice(1, -ext.length)}.${contentHash}${ext}`
                )

                const url = config.base + fileName
                listeners.forEach(onLoad => onLoad(url))

                await writeFile(fileName, content, state)
                onWriteFile?.(fileName)
              } catch (err) {
                console.error(err)
              }
            })
          )
        },
      },
    },
    $('script[src]', scriptTag => {
      const scriptUrl = scriptTag.attributes.src
      if (typeof scriptUrl == 'string' && isExternalUrl(scriptUrl)) {
        const files = getFiles(scriptTag)
        // Assume the script does not import anything.
        files.load(scriptUrl, fetch, url => {
          scriptTag.setAttribute('src', url)
        })
      }
    }),
    $('link[rel="stylesheet"]', linkTag => {
      const cssUrl = linkTag.attributes.href
      if (typeof cssUrl == 'string' && isExternalUrl(cssUrl)) {
        const files = getFiles(linkTag)
        files.load(cssUrl, fetchStyles, url => {
          linkTag.setAttribute('href', url)
        })
      }
    }),
  ])

  function fetchStyles(cssUrl: string, files: FileCache) {
    return fetch(cssUrl).then(cssText =>
      replaceCssUrls(
        cssText.toString('utf8'),
        cssUrl,
        assetUrl =>
          new Promise<string>(setAssetUrl => {
            files.load(assetUrl, fetch, setAssetUrl)
          })
      )
    )
  }

  function fetch(url: string) {
    let request = requests[url]
    if (request) {
      return request
    }

    const download = (): Promise<Buffer> =>
      get(url, {
        headers: {
          // An explicit user agent ensures the most modern asset is cached.
          // In the future, we may want to send a duplicate request with an
          // antiquated user agent, so backwards compatibility is preserved.
          // This workaround is mostly relevant to Google Fonts, where "ttf"
          // fonts are served to browsers where "woff2" is not supported.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:93.0) Gecko/20100101 Firefox/93.0',
        },
      }).then(
        content => {
          onResponse?.(url, content)
          return content
        },
        err => {
          // Connection may reset when debugging.
          if (err.code == 'ECONNRESET') {
            return download()
          }
          throw err
        }
      )

    onRequest?.(url)
    request = requests[url] = download()
    return request
  }
}

function toFilePath(url: string) {
  let file = '/'

  const { host, pathname, searchParams } = new URL(url)
  if (host == 'www.googletagmanager.com') {
    file += `${host}/gtag.js`
  } else if (host == 'fonts.googleapis.com') {
    const [family] = searchParams.get('family')!.split(':')
    file += `${host}/${family}.css`
  } else {
    file += host + decodeURIComponent(pathname)
  }

  return file
}

async function replaceCssUrls(
  text: string,
  parentUrl: string,
  replacer: (url: string) => string | Promise<string>
) {
  const editor = new MagicString(text)
  const loading: Promise<void>[] = []
  const cssUrlRE = /url\(\s*('[^']+'|"[^"]+"|[^'")]+)\s*\)/g
  for (;;) {
    const match = cssUrlRE.exec(text)
    if (!match) {
      await Promise.all(loading)
      return editor.toString()
    }
    let url = match[1]
    if (/^['"]/.test(url)) {
      url = url.slice(1, -1)
    }
    const prevUrl = url
    if (/^\.\.?\//.test(url)) {
      url = relative(parentUrl, url) || url
      debug(`resolve "${prevUrl}" to "${url}"`)
    } else if (!isExternalUrl(url)) {
      url = parentUrl.slice(0, parentUrl.lastIndexOf('/') + 1) + url
      debug(`resolve "${prevUrl}" to "${url}"`)
    }
    if (isExternalUrl(url))
      loading.push(
        Promise.resolve(replacer(url)).then(url => {
          editor.overwrite(
            match.index + 4,
            match.index + match[0].length - 1,
            JSON.stringify(url)
          )
        })
      )
  }
}