import type { AnyToObject, OneOrMany } from '@utils/types'
import type { RequireAsync } from '@vm/types'
import type { Promisable } from 'type-fest'
import type { CommonServerProps } from './app/types'
import type { Cache } from './cache/types'
import type { RuntimeHook } from './config'
import type { Endpoint } from './endpoint'
import type { HtmlContext } from './html/process'
import type { RouteLayout } from './layouts'
import type { RoutePlugin } from './routePlugins'
import type { StateModule } from './stateModules'

// Lifted from https://github.com/lukeed/regexparam
export type InferRouteParams<T extends string> =
  T extends `${infer Prev}/*/${infer Rest}`
    ? InferRouteParams<Prev> & { wild: string } & InferRouteParams<Rest>
    : T extends `${string}:${infer P}.${string}/${infer Rest}`
    ? { [K in P]: string } & InferRouteParams<Rest>
    : T extends `${string}:${infer P}?/${infer Rest}`
    ? { [K in P]?: string } & InferRouteParams<Rest>
    : T extends `${string}:${infer P}/${infer Rest}`
    ? { [K in P]: string } & InferRouteParams<Rest>
    : T extends `${string}:${infer P}.${string}`
    ? { [K in P]: string }
    : T extends `${string}:${infer P}?`
    ? { [K in P]?: string }
    : T extends `${string}:${infer P}`
    ? { [K in P]: string }
    : T extends `${string}*.${string}`
    ? { wild: string }
    : T extends `${string}*`
    ? { wild: string }
    : {}

export interface RouteModule extends Record<string, any> {}

export type RouteLoader<T extends object = RouteModule> = () => Promise<T>

export type RouteParams = Record<string, string>

type HasOneKey<T> = [string & keyof T] extends infer Keys
  ? Keys extends [infer Key]
    ? Key extends any
      ? [string & keyof T] extends [Key]
        ? 1
        : 0
      : never
    : never
  : never

type StaticPageParams<Params extends object> = 1 extends HasOneKey<Params>
  ? string | number
  : readonly (string | number)[]

export interface RouteConfig<
  Module extends object = RouteModule,
  Params extends object = RouteParams
> extends RouteStateConfig<Module, Params> {
  /**
   * Either a file path (relative to the caller) or a function that
   * loads the entry module for this route.
   */
  entry?: string | (() => Promise<Module>)
  layout?: string | (() => Promise<{ default: RouteLayout }>)
  /**
   * Define which pages should be statically generated by providing
   * their path params.
   */
  paths?: () => Promisable<readonly StaticPageParams<Params>[]>
  /**
   * If intermediate state is shared between the `state`, `include`,
   * and/or `headProps` options, define a `config` function to avoid
   * work duplication.
   */
  config?: PageSpecificOption<RouteStateConfig<Module, Params>, Module, Params>
  /**
   * The route plugin is a runtime module that modifies the route as it
   * sees fit, such as by adding endpoint functions or mutating the
   * route configuration. It can even load the route module
   * ahead-of-time.
   *
   * This is its module ID (relative to the caller).
   */
  plugin?: RoutePlugin
}

export type PageSpecificOption<
  T = any,
  Module extends object = RouteModule,
  Params extends object = RouteParams
> = (
  request: Endpoint.Request<Params>,
  route: BareRoute<Module>
) => Promisable<T>

export type RoutePropsOption<
  Module extends object = any,
  Params extends object = any
> =
  | Record<string, any>
  | PageSpecificOption<Record<string, any>, Module, Params>

type RouteIncludedState = readonly OneOrMany<StateModule<any, []>>[]

/** A value that defines which state modules are needed by a route. */
export type RouteIncludeOption<
  Module extends object = any,
  Params extends object = any
> = RouteIncludedState | PageSpecificOption<RouteIncludedState, Module, Params>

interface RouteStateConfig<
  Module extends object = any,
  Params extends object = any
> {
  /**
   * The maximum number of seconds that the page props should be cached
   * for. Note that any state modules used by this route may lower the
   * max age.
   */
  maxAge?: Cache.MaxAge
  /**
   * Load the page props for this route. These props exist during
   * hydration and are usually provided to the root component on the
   * page.
   */
  props?: RoutePropsOption<Module, Params>
  /**
   * Declare which state modules are required by this route.
   *
   * For state modules whose `load` method expects one or more
   * arguments, you should define those arguments with the `bind`
   * method. If no arguments are expected, pass the state module without
   * calling any method.
   */
  include?: RouteIncludeOption<Module, Params>
  /**
   * Similar to the `include` option, but the state modules' data is
   * declared inside the "page state module" so no extra HTTP requests
   * are needed.
   */
  inline?: RouteIncludeOption<Module, Params>
  /**
   * Load or generate state used only when rendering the `<head>`
   * element.  \
   * This state is never sent to the client.
   */
  headProps?:
    | Record<string, any>
    | ((
        request: Endpoint.Request<Params>,
        state: CommonServerProps
      ) => Promisable<Record<string, any>>)
}

export interface ParsedRoute {
  pattern: RegExp
  keys: string[]
}

export interface BareRoute<T extends object = RouteModule> extends ParsedRoute {
  path: string
  load: RouteLoader<T> | undefined
  moduleId: string | null
  layoutEntry?: string
  /**
   * This is set by the `getRouteRenderers` function and it's always
   * undefined from inside the `saus.receiveRoutes` plugin hook.
   */
  renderer?: RouteRenderer
  /** The file this route was declared from. */
  file?: string
  parent?: Route
  generated?: boolean
  endpoints?: Endpoint[]
  defaultState?: RouteIncludeOption<T>[]
  requestHooks?: Endpoint.RequestHook[]
  responseHooks?: Endpoint.ResponseHook[]
  errorHooks?: Endpoint.ErrorHook[]
  /**
   * This is generated on-demand when the route is matched.
   */
  methods?: { [method: string]: RouteEndpointMap }
}

export interface RouteRenderer {
  fileName: string
  routeModuleId: string
  layoutModuleId: string
  routes: Route[]
}

export type RouteEndpointMap = Record<Endpoint.ContentType, Endpoint[]>

export interface Route<Module extends object = any, Params extends object = any>
  extends BareRoute<Module>,
    RouteConfig<Module, Params> {}

export namespace Route {
  export interface API<Params extends object = any>
    extends Endpoint.Declarators<API<Params>, Params> {
    /**
     * In the given callback, you can add routes that have this route's
     * path automatically prepended to theirs.
     */
    extend: (
      extension: (route: DefineRouteExtension<Params>) => void
    ) => API<Params>
  }
  interface DefineRouteExtension<InheritedParams extends object> {
    /** Define a catch route */
    <Module extends object>(
      path: 'error',
      load: RouteLoader<Module>,
      config?: RouteConfig<Module, InheritedParams & { error: any }>
    ): void

    /** Define a route */
    <RoutePath extends string, Module extends object>(
      path: RoutePath,
      load?: RouteLoader<Module>,
      config?: RouteConfig<
        Module,
        InheritedParams & InferRouteParams<RoutePath>
      >
    ): Route.API<InheritedParams & InferRouteParams<RoutePath>>

    /** Define a route */
    <RoutePath extends string, Module extends object>(
      path: RoutePath,
      config: RouteConfig<Module, InheritedParams & InferRouteParams<RoutePath>>
    ): Route.API<InheritedParams & InferRouteParams<RoutePath>>
  }
}

/**
 * Values configurable from the `saus.routes` module defined in your
 * Vite config.
 */
export interface RoutesModule extends HtmlContext {
  /** These hooks are called after the routes module is loaded */
  runtimeHooks: RuntimeHook[]
  /** Routes defined with the `route` function */
  routes: Route[]
  /** The route used when no route is matched */
  defaultRoute?: Route
  /** The route used when an error is thrown while rendering */
  catchRoute?: Route
  /** State modules that are loaded by default */
  defaultState?: RouteIncludeOption[]
  /** Import a module by its SSR path */
  ssrRequire: RequireAsync
  requestHooks?: Endpoint.RequestHook[]
  responseHooks?: Endpoint.ResponseHook[]
  errorHooks?: Endpoint.ErrorHook[]
}

/**
 * Server-side route entry
 */
export interface RouteEntry<
  Props extends object = any,
  Module extends object = any,
  RenderResult = any
> {
  layout: RouteLayout<Props, any, Module, RenderResult>
  routeModule: AnyToObject<Module, RouteModule>
  /** This exists in server context only. */
  routes?: string[]
}
