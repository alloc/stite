import { kSecretDefinition } from './symbols.js'
import { DefinedSecrets, SecretMap } from './types.js'

export function defineSecrets<T extends SecretMap>(def: T): DefinedSecrets<T> {
  return { [kSecretDefinition]: def } as any
}
