import { SausContext } from './context.js'
import { SausPlugin, vite } from './vite.js'

export async function getSausPlugins(
  context: SausContext,
  config: vite.ResolvedConfig = context.config
) {
  const sausPlugins: SausPlugin[] = []
  for (const p of config.plugins) {
    if (!p || !p.saus || !isApplicablePlugin(p, config)) {
      continue
    }

    const sausPlugin =
      typeof p.saus == 'function' ? await p.saus(context, config) : p.saus!

    if (sausPlugin) {
      sausPlugin.name ||= p.name
      sausPlugins.push(sausPlugin)
    }
  }
  return sausPlugins
}

function isApplicablePlugin(p: vite.Plugin, config: vite.ResolvedConfig) {
  if (typeof p.apply == 'function') {
    return p.apply(config.inlineConfig, {
      command: config.command,
      mode: config.mode,
    })
  }
  return p.apply == null || p.apply == config.command
}
