export function toInlineSourceMap(map: SourceMap) {
  return (
    '\n//# ' +
    'sourceMappingURL=data:application/json;charset=utf-8;base64,' +
    Buffer.from(JSON.stringify(map), 'utf8').toString('base64')
  )
}

export interface SourceMap {
  version: number
  file: string
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}