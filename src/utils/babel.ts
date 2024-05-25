import * as babel from '@babel/core'
import { NodePath, types as t } from '@babel/core'

export { getBabelConfig } from './babel/config.js'
export { getBabelProgram } from './babel/program.js'
export { transformAsync, transformSync } from './babel/transform.js'
export { babel, NodePath, t }
