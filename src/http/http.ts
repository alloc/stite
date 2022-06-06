import { Endpoint } from '../core'
import { writeBody } from '../runtime/writeBody'
import { requestHook, responseHook } from './hooks'
import { startRequest } from './internal/startRequest'
import { urlToHttpOptions } from './internal/urlToHttpOptions'
import { Headers, Response } from './response'
import { HttpMethod, HttpOptions, URL } from './types'

type ForwardedKeys = 'agent' | 'allowBadStatus' | 'signal' | 'sink' | 'timeout'

export interface HttpRequestOptions extends Pick<HttpOptions, ForwardedKeys> {
  body?: Endpoint.ResponseBody
  headers?: Headers
}

/**
 * Note: GET responses are not cached when received with this function.
 */
export function http(
  method: HttpMethod,
  url: string | URL,
  opts?: HttpRequestOptions
) {
  const trace = Error()
  return new Promise<Response>((resolve, reject) => {
    const req = createRequest(url, opts)
    Promise.resolve(requestHook.current(req)).then(resp => {
      const onResponse = (resp: Response) =>
        Promise.resolve(responseHook.current(req, resp)).then(
          () => resolve(resp),
          reject
        )

      if (resp) {
        return onResponse(resp)
      }

      const continueRequest = (req: HttpOptions, redirects: number) => {
        try {
          const client = startRequest(
            req,
            trace,
            reject,
            onResponse,
            redirects,
            url => continueRequest(createRequest(url, opts), redirects + 1)
          )
          if (opts?.body) {
            writeBody(client, opts.body)
          } else {
            client.end()
          }
        } catch (e: any) {
          reject(e)
        }
      }

      continueRequest(req, 0)
    }, reject)
  })
}

http.post = http.bind(null, 'post')

function createRequest(url: string | URL, opts?: HttpRequestOptions) {
  if (typeof url == 'string') {
    url = new URL(url)
  }
  const req = urlToHttpOptions(url)
  if (opts) {
    const { body, ...assignedOpts } = opts
    Object.assign(req, assignedOpts)
  }
  return req
}
