import * as ReactDOM from 'react-dom/server'
import { defineLayoutRenderer } from 'saus/core'
import './stack.js'

export const defineLayout = defineLayoutRenderer({
  hydrator: '@saus/react/hydrator',
  toString: ReactDOM.renderToString,
})

export * from './types'
