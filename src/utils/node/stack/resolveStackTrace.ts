import { parseStackTrace } from '../../parseStackTrace.js'
import { SourceMap } from '../sourceMap.js'
import { traceStackFrame } from './traceStackFrame'

export function resolveStackTrace(
  stack: string,
  getSourceMap: (file: string) => SourceMap | null
) {
  const parsed = parseStackTrace(stack)
  const lines = [parsed.header]
  for (const frame of parsed.frames) {
    const map = getSourceMap(frame.file)
    if (map) {
      traceStackFrame(frame, map)
    }
    lines.push(frame.text)
  }

  return lines.join('\n')
}
