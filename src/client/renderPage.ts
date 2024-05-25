import { getPagePath } from '@runtime/getPagePath'
import { RouteParams } from '@runtime/routeTypes'
import { loadPageClient, PageClient } from './pageClient.js'
import { prependBase } from './prependBase.js'

export async function renderPage<RenderResult = any>(
  routePath: string,
  routeParams?: RouteParams,
  client?: PageClient<any, any, RenderResult>
): Promise<RenderResult> {
  client ||= await loadPageClient(routePath, routeParams)
  const pagePath = getPagePath(routePath, routeParams)
  const pageUrl = new URL(location.origin + prependBase(pagePath))
  return client.layout.render({
    module: client.routeModule,
    params: routeParams || {},
    path: pageUrl.pathname,
    props: client.props,
    query: pageUrl.search,
  })
}
