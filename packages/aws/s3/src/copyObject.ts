import { parseXmlResponse } from '@saus/aws-utils'
import { controlExecution } from 'saus/utils/controlExecution'
import { paramsToHeaders } from './api/headers.js'
import { signedRequest } from './api/request.js'
import { writeThrottler } from './utils/throttle.js'

export function copyObject(region: string) {
  return controlExecution(
    signedRequest(region).action('CopyObject', {
      coerceRequest: params => ({
        method: 'put',
        subdomain: params.Bucket,
        path: params.Key,
        query: null,
        headers: paramsToHeaders(params, ['Key']),
      }),
      coerceResponse(resp) {
        return parseXmlResponse(resp).CopyObjectResult
      },
    })
  ).with(writeThrottler)
}
