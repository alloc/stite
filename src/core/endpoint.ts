import type { App } from '../app/types'
import type { Buffer } from '../client'
import type { Headers, HttpRedirect, Response } from '../http'
import type { httpMethods } from '../utils/httpMethods'
import type { Falsy, Promisable } from '../utils/types'
import type { ParsedUrl } from '../utils/url'
import type { InferRouteParams, Route, RouteParams } from './routes'

export interface Endpoint<Params extends {} = {}>
  extends Endpoint.Function<Params> {
  /** This function responds to this HTTP method. */
  method: string
  /** This function responds to these MIME type requests. */
  contentTypes: Endpoint.ContentType[]
}

export namespace Endpoint {
  export type Generated = Function<RouteParams> & Partial<Endpoint>
  export type Generator = (
    method: string,
    route: Route
  ) => Generated | (Generated | Falsy)[] | Falsy

  export type ContentType = `${string}/${string}`
  export type ContentTypes = [ContentType, ...ContentType[]]

  export type Declarators<Self, Params extends {} = {}> = {
    [T in typeof httpMethods[number]]: {
      /** Declare an endpoint that responds to any `Accept` header */
      (fn: Function<Params>): Self

      /** Declare an endpoint that responds to specific `Accept` headers */
      (contentTypes: ContentTypes, fn: Function<Params>): Self

      /** Declare a JSON endpoint */
      <RoutePath extends string>(
        nestedPath: `${RoutePath}.json`,
        fn: JsonFunction<Params & InferRouteParams<RoutePath>>
      ): Self

      <RoutePath extends string>(
        nestedPath: RoutePath,
        contentTypes: ContentTypes,
        fn: Function<Params & InferRouteParams<RoutePath>>
      ): Self
    }
  }

  export type Result = Response | HttpRedirect | null | void

  /**
   * Endpoints ending in `.json` don't have to wrap their
   * response data. Just return a JSON-compatible value
   * or a promise that resolves with one. If the result
   * is undefined, the next endpoint handler is tried.
   */
  export type JsonFunction<Params extends {} = {}> = (
    request: Request<Params>,
    app: App
  ) => Promisable<any>

  export type Function<Params extends {} = {}> = (
    request: Request<Params>,
    app: App
  ) => Promisable<Result>

  export type Request<RouteParams extends {} = {}> = unknown &
    RequestUrl<RouteParams> &
    RequestMethods &
    Omit<RouteParams, keyof RequestMethods | keyof RequestUrl>

  interface RequestMethods {
    respondWith(...response: ResponseTuple): void
  }

  export interface RequestUrl<RouteParams extends {} = Record<string, string>>
    extends ParsedUrl<RouteParams> {
    readonly method: string
    readonly headers: Readonly<Headers>
    readonly read: () => Promise<Buffer>
    /**
     * The platform-specific request object related to this URL. \
     * For example, it's an `IncomingMessage` instance when using a
     * basic Node.js server.
     */
    object?: any
  }

  export type ResponseHook<App = any> = (
    request: Request,
    response: ResponseTuple,
    app: App
  ) => Promisable<void>

  export type ResponseTuple = [
    status?: number,
    headers?: Headers | null,
    body?: Endpoint.ResponseBody
  ]

  export type ResponseBody =
    | { buffer: Buffer }
    | { stream: NodeJS.ReadableStream }
    | { text: string }
    | { json: any }
    | {}
}
