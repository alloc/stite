import { addDeployHook, addDeployTarget } from 'saus/core'
import { DnsRecordList } from './types'

const hook = addDeployHook(() => import('./hook'))

export function useCloudflareDNS(zoneId: string, records: DnsRecordList) {
  return addDeployTarget(hook, {
    zoneId,
    records,
  })
}
