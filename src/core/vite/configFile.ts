import { SausCommand } from '../context.js'
import { vite } from '../vite.js'
import { getConfigEnv } from './config.js'

export const loadConfigFile = (
  command: SausCommand,
  configFile?: string,
  inlineConfig: vite.InlineConfig = {}
) =>
  vite.loadConfigFromFile(
    getConfigEnv(command, inlineConfig.mode),
    configFile,
    inlineConfig.root,
    inlineConfig.logLevel
  )
