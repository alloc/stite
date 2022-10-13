import { makeRequestUrl } from '@/makeRequest'
import type { App } from '@runtime/app'
import { parseUrl } from '@utils/node/url'
import { writeResponse } from '@utils/node/writeResponse'
import { streamToBuffer } from '@utils/streamToBuffer'
import { connect } from './connect'

interface RequestProps {
  app: App
}

export const servePages: connect.Middleware<RequestProps> =
  async function servePage(req, res, next) {
    const url = makeRequestUrl(parseUrl(req.url), {
      object: req,
      method: req.method!,
      headers: req.headers,
      read: encoding => streamToBuffer(req, 0, encoding),
    })
    const { status, headers, body } = await req.app.callEndpoints(url)
    if (status == null) {
      return next()
    }
    writeResponse(res, status, headers, body)
  }
