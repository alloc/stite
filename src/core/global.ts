import type { RenderModule } from './render'
import type { RoutesModule } from './routes'

export let routesModule: RoutesModule

export const setRoutesModule = (module: RoutesModule | null) =>
  (routesModule = module!)

export let renderModule: RenderModule

export const setRenderModule = (module: RenderModule | null) =>
  (renderModule = module!)