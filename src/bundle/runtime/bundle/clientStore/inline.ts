import clientAssets from '../clientAssets.js'
import clientModules from '../clientModules.js'

export async function loadModule(id: string) {
  return clientModules[id]
}

export async function loadAsset(id: string): Promise<Buffer> {
  return Buffer.from(clientAssets[id], 'base64')
}
