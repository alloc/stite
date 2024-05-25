import { access, get, has, load } from './access.js'
import { clear } from './clear.js'
import { forEach } from './forEach.js'
import { Cache } from './types.js'

export const createCache = <State = unknown>(): Cache<State> => ({
  listeners: {},
  loading: {},
  loaded: {},
  has,
  get,
  load,
  access,
  clear,
  forEach,
})
