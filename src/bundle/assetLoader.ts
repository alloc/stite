import fs from 'fs'
import { HttpRedirect } from '../http'
import { textExtensions } from '../utils/textExtensions'
import inlinedAssets from './inlinedAssets'

type Promisable<T> = T | PromiseLike<T>

export interface AssetLoader {
  loadAsset(id: string): Promisable<Buffer | HttpRedirect>
}

export namespace AssetLoader {
  export interface Factory {
    (): AssetLoader
  }
}

// The default asset loader uses an inlined asset map (if given)
// or it loads from the filesystem.
export default (): AssetLoader => ({
  loadAsset(id) {
    const asset = inlinedAssets[id]
    if (asset) {
      return Buffer.from(asset, textExtensions.test(id) ? 'utf8' : 'base64')
    }
    // Assume the working directory is the `build.outDir` option.
    return fs.readFileSync(id)
  },
})
