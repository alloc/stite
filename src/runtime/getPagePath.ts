import { renderRoutePath } from './renderRoutePath.js'
import type { RouteParams } from './routeTypes.js'

export function getPagePath(
  routePath: string,
  routeParams?: RouteParams | null
) {
  if (routeParams) {
    return renderRoutePath(routePath, routeParams)
  }
  return routePath
}
