import * as vite from 'vite'
import md5Hex from 'md5-hex'
import annotateAsPure from '@babel/helper-annotate-as-pure'
import { SausContext } from '../context'
import { babel, t, NodePath } from '../babel'
import { isClientUrl } from './client'

export function renderPlugin({
  renderPath,
  configEnv,
}: SausContext): vite.Plugin {
  return {
    name: 'saus:render',
    enforce: 'pre',
    transform(code, id) {
      let visitor: babel.Visitor | undefined
      if (id === renderPath) {
        visitor = { Program: injectRenderMetadata }
      } else if (isClientUrl(id) && configEnv.mode === 'production') {
        visitor = { CallExpression: assumePurity }
      }
      if (visitor) {
        return babel.transformSync(code, {
          sourceMaps: true,
          filename: id,
          plugins: [
            ['@babel/syntax-typescript', { isTSX: /\.[tj]sx$/.test(id) }],
            { visitor },
          ],
        }) as vite.TransformResult
      }
    },
  }
}

// Append the `hash` and `start` arguments to render calls.
function injectRenderMetadata(program: NodePath<t.Program>) {
  program.traverse({
    CallExpression(path) {
      const callee = path.get('callee')
      if (callee.isIdentifier() && /^render([A-Z]|$)/.test(callee.node.name)) {
        const stmt = path.getStatementParent()!
        path.node.arguments.push(
          // Content hash of the render call (for caching).
          t.stringLiteral(md5Hex(stmt.toString()).slice(0, 16)),
          // Start position of the render call (for client generation).
          t.numericLiteral(path.node.start!)
        )
      }
    },
  })
}

// Function calls whose result is used are assumed to be pure.
// This makes it easier for Rollup to treeshake them.
function assumePurity(call: NodePath<t.CallExpression>) {
  if (!call.parentPath.isExpressionStatement()) {
    annotateAsPure(call)
  }
}