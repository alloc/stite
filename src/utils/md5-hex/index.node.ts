import crypto from 'crypto'

export function md5Hex(data: string | string[] | Buffer) {
  const hash = crypto.createHash('md5')

  if (Array.isArray(data)) {
    for (const element of data) {
      hash.update(element, 'utf8')
    }
  } else if (Buffer.isBuffer(data)) {
    hash.update(data)
  } else {
    hash.update(data, 'utf8')
  }

  return hash.digest('hex')
}
