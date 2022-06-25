import { prompt } from '@saus/deploy-utils'
import { AESEncryption } from 'aes-password'
import { File, getDeployContext, SecretMap } from 'saus/deploy'

/**
 * Use secrets stored in your git repository and
 * encrypted-at-rest with a password.
 */
export function useGitSecrets() {
  const { secrets, files, logger, syncDeployCache } = getDeployContext()

  const secretsFile = files.get('secrets.aes', SecretsFile)
  const beforeFileAccess = () =>
    Promise.all([requestPassword(), syncDeployCache()])

  secrets.addSource({
    name: 'Git Secrets',
    async load() {
      if (secretsFile.exists) {
        logger.info('Using git for encrypted secret storage.')
        await beforeFileAccess()
        return secretsFile.getData()
      }
      return {}
    },
    async set(secrets, replace) {
      await beforeFileAccess()
      if (secretsFile.exists && !replace) {
        secrets = Object.assign(await secretsFile.getData(), secrets)
      }
      secretsFile.setData(secrets)
    },
  })

  async function requestPassword() {
    while (true) {
      const { password } = await prompt({
        name: 'password',
        type: 'password',
        message: secretsFile.exists ? 'New password' : 'Password',
      })
      if (!password) {
        throw Error('[saus] Operation canceled.')
      }
      if (!secretsFile.exists) {
        const { confirmation } = await prompt({
          name: 'confirmation',
          type: 'password',
          message: 'Confirm password',
        })
        if (password !== confirmation) {
          logger.info('Passwords did not match! Try again.', { clear: true })
          continue
        }
      }
      secretsFile.setPassword(password)
      break
    }
  }
}

class SecretsFile extends File {
  private _password = ''
  setPassword(pass: string) {
    this._password = pass
  }
  async getData(): Promise<SecretMap> {
    const encrypted = this.getBuffer('utf8')
    const decrypted = await AESEncryption.decrypt(encrypted, this._password)
    return JSON.parse(decrypted)
  }
  async setData(data: SecretMap) {
    const decrypted = JSON.stringify(data)
    const encrypted = await AESEncryption.encrypt(decrypted, this._password)
    this.setBuffer(Buffer.from(encrypted))
  }
}