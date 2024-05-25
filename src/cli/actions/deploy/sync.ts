import { command } from '../../command.js'

command(sync)

export { sync }

async function sync() {
  const { loadDeployContext } = await import('../../../deploy/context.js.js')
  const context = await loadDeployContext()
  await context.syncDeployCache()
}
