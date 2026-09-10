import { orderedShareDiveLogs, shareLogClientKey, type ShareLogOrderInput } from './shareOrder.ts'

function assertEqual(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const selectedOrder: ShareLogOrderInput[] = [
  { diveLogId: 'free-48', isFreeDiving: true, isSurfaceTime: false, diveDisplayIndex: 48, dateText: '2026.05.11' },
  { diveLogId: 'scuba-50', isFreeDiving: false, isSurfaceTime: false, diveDisplayIndex: 50, dateText: '2026.05.13' },
  { diveLogId: 'free-49', isFreeDiving: true, isSurfaceTime: false, diveDisplayIndex: 49, dateText: '2026.05.12' },
  { diveLogId: 'scuba-45', isFreeDiving: false, isSurfaceTime: false, diveDisplayIndex: 45, dateText: '2026.05.10' },
  { diveLogId: 'rest-new', isFreeDiving: false, isSurfaceTime: true, diveDisplayIndex: 1, dateText: '2026.05.14' },
  { diveLogId: 'rest-old', isFreeDiving: false, isSurfaceTime: true, diveDisplayIndex: 2, dateText: '2026.05.09' },
]

assertEqual(
  orderedShareDiveLogs(selectedOrder)
    .map((log) => log.diveLogId)
    .join(','),
  'scuba-50,scuba-45,free-49,free-48,rest-new,rest-old',
)

const freeTrips: ShareLogOrderInput[] = [
  {
    diveLogId: 'free-13',
    isFreeDiving: true,
    isSurfaceTime: false,
    diveDisplayIndex: 13,
    dateText: '2022.04.13',
    freeTripNumber: 1,
  },
  {
    diveLogId: 'scuba-102',
    isFreeDiving: false,
    isSurfaceTime: false,
    diveDisplayIndex: 102,
    dateText: '2022.04.13',
  },
  {
    diveLogId: 'free-13',
    isFreeDiving: true,
    isSurfaceTime: false,
    diveDisplayIndex: 13,
    dateText: '2022.04.13',
    freeTripNumber: 2,
  },
]

assertEqual(
  orderedShareDiveLogs(freeTrips)
    .map((log) => shareLogClientKey(log))
    .join(','),
  'scuba-102,free-13::2,free-13::1',
)

console.log('shareOrder check ok')
