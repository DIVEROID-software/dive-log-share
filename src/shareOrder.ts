/**
 * Recipient list order matches the in-app share customize tabs:
 * Scuba → Free → Rest time, newest first within each type.
 * Same free-dive session: higher trip number first (Free #13-2 before #13-1).
 */
export type ShareLogOrderInput = {
  diveLogId: string
  isFreeDiving: boolean
  isSurfaceTime: boolean
  diveDisplayIndex: number
  dateText: string
  freeTripNumber?: number
}

export function shareLogClientKey(log: {
  diveLogId: string
  freeTripNumber?: number
}): string {
  const tripNumber: number = log.freeTripNumber ?? 0
  if (tripNumber <= 0) {
    return log.diveLogId
  }
  return `${log.diveLogId}::${tripNumber}`
}

export function shareLogTypeRank(log: ShareLogOrderInput): number {
  if (log.isSurfaceTime) {
    return 2
  }
  if (log.isFreeDiving) {
    return 1
  }
  return 0
}

export function orderedShareDiveLogs<T extends ShareLogOrderInput>(logs: T[]): T[] {
  return [...logs].sort(compareShareDiveLogs)
}

function compareShareDiveLogs(left: ShareLogOrderInput, right: ShareLogOrderInput): number {
  const rankDiff: number = shareLogTypeRank(left) - shareLogTypeRank(right)
  if (rankDiff !== 0) {
    return rankDiff
  }
  if (left.isSurfaceTime) {
    if (
      left.diveDisplayIndex > 0 &&
      right.diveDisplayIndex > 0 &&
      left.diveDisplayIndex !== right.diveDisplayIndex
    ) {
      return left.diveDisplayIndex - right.diveDisplayIndex
    }
    return right.dateText.localeCompare(left.dateText)
  }
  if (left.diveDisplayIndex !== right.diveDisplayIndex) {
    return right.diveDisplayIndex - left.diveDisplayIndex
  }
  const dateDiff: number = right.dateText.localeCompare(left.dateText)
  if (dateDiff !== 0) {
    return dateDiff
  }
  return (right.freeTripNumber ?? 0) - (left.freeTripNumber ?? 0)
}
