import type { StateModule } from '../runtime/stateModules'
import type { ParsedUrl } from '../utils/url'
import { RequireAsync } from '../vm/types'
import type { SausContext } from './context'
import type { HtmlContext } from './html'
import type { RuntimeHook } from './setup'

export * as RegexParam from 'regexparam'
export type { RouteParams as InferRouteParams } from 'regexparam'

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

type Promisable<T> = T | PromiseLike<T>

export interface RouteConfig<
  Module extends object = RouteModule,
  Params extends object = RouteParams
> extends RouteStateConfig<Module, Params> {
  /**
   * Define which pages should be statically generated by providing
   * their path params.
   */
  paths?: () => Promisable<readonly StaticPageParams<Params>[]>
  /**
   * If intermediate state is shared between the `state`, `include`, and/or
   * `headProps` options, define a `config` function to avoid work duplication.
   */
  config?: (
    url: ParsedUrl<Params>,
    route: BareRoute<Module>
  ) => Promisable<RouteStateConfig<Module, Params>>
}

type RouteStateOption<Module extends object> =
  | Record<string, any>
  | ((
      url: ParsedUrl,
      route: BareRoute<Module>
    ) => Promisable<Record<string, any>>)

/** A value that defines which state modules are needed by a route. */
export type RouteIncludeOption<
  Module extends object = any,
  Params extends object = any
> =
  | StateModule<any, []>[]
  | ((
      url: ParsedUrl<Params>,
      route: BareRoute<Module>
    ) => StateModule<any, []>[])

interface RouteStateConfig<
  Module extends object = RouteModule,
  Params extends object = RouteParams
> {
  /**
   * Load the page state for this route. This state exists during hydration
   * and is usually provided to the root component on the page.
   */
  state?: RouteStateOption<Module>
  /**
   * Declare which state modules are required by this route.
   *
   * For state modules whose `load` method expects one or more arguments,
   * you should define those arguments with the `bind` method. If no arguments
   * are expected, pass the state module without calling any method.
   */
  include?: RouteIncludeOption<Module, Params>
  /**
   * Load or generate state used only when rendering the `<head>` element.
   * This state is never sent to the client.
   */
  headProps?:
    | Record<string, any>
    | ((url: ParsedUrl, state: any) => Promisable<Record<string, any>>)
}

export interface GeneratedRouteConfig<
  Module extends object = RouteModule,
  Params extends object = RouteParams
> extends RouteConfig<Module, Params> {
  entry: string | (() => Promise<Module>)
  /**
   * Defaults to the caller of `generateRoute`.
   */
  importer?: string
}

export interface ParsedRoute {
  pattern: RegExp
  keys: string[]
}

export interface BareRoute<T extends object = RouteModule> extends ParsedRoute {
  path: string
  load: RouteLoader<T>
  moduleId: string
  generated?: boolean
  importer?: string
}

export interface Route extends BareRoute, RouteConfig {}

export function matchRoute(path: string, route: ParsedRoute) {
  return route.pattern
    .exec(path)
    ?.slice(1)
    .reduce((params: Record<string, string>, value, i) => {
      params[route.keys[i]] = value
      return params
    }, {})
}

/**
 * Values configurable from the `saus.routes` module defined
 * in your Vite config.
 */
export interface RoutesModule extends HtmlContext {
  /** State modules that are loaded by default */
  defaultState: RouteIncludeOption[]
  /** These hooks are called after the routes module is loaded */
  runtimeHooks: RuntimeHook[]
  /** Routes defined with the `route` function */
  routes: Route[]
  /** The route used when no route is matched */
  defaultRoute?: Route
  /** The route used when an error is thrown while rendering */
  catchRoute?: Route
  /** Used by generated routes to import their route module */
  ssrRequire?: RequireAsync
}

type RoutePathHandlers = {
  path: (path: string, params?: RouteParams) => void
  error: (error: { reason: string; path: string }) => void
}

/**
 * Using `context.routes` and `context.defaultRoute`, every known path is passed
 * to the `path` handler. The default route generates the `default` path. Routes
 * with dynamic params will be called once per element in their `paths` array,
 * and you still need to call `getPagePath` to get the real path.
 */
export async function generateRoutePaths(
  context: Pick<SausContext, 'routes' | 'defaultRoute' | 'defaultPath'>,
  handlers: RoutePathHandlers
) {
  const { path: onPath, error: onError } = handlers

  for (const route of context.routes) {
    if (route.paths) {
      if (!route.keys.length) {
        onError({
          path: route.path,
          reason: `Route with "paths" needs a route parameter`,
        })
      } else {
        for (const result of await route.paths()) {
          const values = Array.isArray(result)
            ? (result as (string | number)[])
            : [result]

          const params: RouteParams = {}
          route.keys.forEach((key, i) => {
            params[key] = '' + values[i]
          })

          onPath(route.path, params)
        }
      }
    } else if (!route.keys.length) {
      onPath(route.path)
    }
  }

  if (context.defaultRoute) {
    onPath(context.defaultPath)
  }
}
