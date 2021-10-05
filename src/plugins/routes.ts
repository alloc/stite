import fs from 'fs'
import path from 'path'
import * as vite from 'vite'
import { babel, t } from '../babel'
import { SausContext } from '../context'
import { SourceDescription } from '../vite'

const routesPathStub = path.resolve(__dirname, '../../src/client/routes.ts')

export function routesPlugin({ routesPath }: SausContext): vite.Plugin {
  return {
    name: 'saus:routes',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (importer == routesPathStub) {
        return this.resolve(id, routesPath, { skipSelf: true })
      }
    },
    load(id) {
      if (id == routesPathStub) {
        return generateClientRoutes(routesPath)
      }
    },
  }
}

function generateClientRoutes(routesPath: string) {
  const routesModule = babel.parseSync(fs.readFileSync(routesPath, 'utf8'), {
    filename: routesPath,
    plugins: /\.tsx?$/.test(routesPath)
      ? [['@babel/syntax-typescript', { isTSX: routesPath.endsWith('x') }]]
      : [],
  })!

  const exports: t.ObjectProperty[] = []
  babel.traverse(routesModule, {
    CallExpression(path) {
      const callee = path.get('callee')
      if (callee.isIdentifier({ name: 'route' })) {
        const [routePath, importFn] = path.node.arguments as [
          t.StringLiteral,
          t.ArrowFunctionExpression
        ]
        exports.push(
          t.isArrowFunctionExpression(routePath)
            ? t.objectProperty(t.identifier('default'), routePath)
            : t.objectProperty(routePath, importFn)
        )
      }
    },
  })

  const transformer: babel.Visitor = {
    ObjectExpression(path) {
      path.node.properties.push(...exports)
    },
  }

  return babel.transformSync(`export default {}`, {
    plugins: [{ visitor: transformer }],
  }) as SourceDescription
}
