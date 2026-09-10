export type ShareLocale = 'en' | 'ko'

export interface ShareCopy {
  listHeroLine1: string
  listHeroLine2: string
  listHeroLine1Named: string
  listHeroLine2Named: string
  sharedLogLabel: string
  sharedLogLabelNamed: string
  scubaShort: string
  freeShort: string
  scubaDetail: string
  freeDetail: string
  scubaDive: string
  freeDive: string
  surfaceTime: string
  maxDepth: string
  diveTime: string
  bottomTemp: string
  surfaceTemp: string
  gasType: string
  enjoyDiving: string
  download: string
  dateUnknown: string
  locationUnknown: string
  loading: string
  loadError: string
  missingLink: string
  emptyLogs: string
  backToList: string
  sharedMedia: string
  diveMedia: string
  diveStatistics: string
  diveProfileChart: string
  diveProfileScrub: string
}

export interface ShareTitleInput {
  isSurfaceTime: boolean
  isFreeDiving: boolean
  recordLabel: string
  tabTitle: string
}

export const SHARE_COPY: Record<ShareLocale, ShareCopy> = {
  en: {
    listHeroLine1: 'Take a look at',
    listHeroLine2: 'Shared Dive Log',
    listHeroLine1Named: 'Take a look at',
    listHeroLine2Named: "{name}'s Dive Log",
    sharedLogLabel: 'Shared Log',
    sharedLogLabelNamed: "{name}'s Log",
    scubaShort: 'Scuba',
    freeShort: 'Free',
    scubaDetail: 'Scuba Diving',
    freeDetail: 'Free Diving',
    scubaDive: 'Scuba Dive',
    freeDive: 'Free Dive',
    surfaceTime: 'Surface Time',
    maxDepth: 'Max Depth',
    diveTime: 'Dive Time',
    bottomTemp: 'Bottom Temp',
    surfaceTemp: 'Surface Temp',
    gasType: 'Gas Type',
    enjoyDiving: 'Enjoy diving with DIVEROID!',
    download: 'Download',
    dateUnknown: 'Date unknown',
    locationUnknown: 'Location unknown',
    loading: 'Loading dive log...',
    loadError: 'Dive log share could not be loaded.',
    missingLink: 'Share link is missing.',
    emptyLogs: 'No shared dive logs.',
    backToList: 'Back to list',
    sharedMedia: 'Shared media',
    diveMedia: 'Dive media',
    diveStatistics: 'Dive statistics',
    diveProfileChart: 'Dive profile chart',
    diveProfileScrub: 'Dive profile. Drag to scrub through media.',
  },
  ko: {
    listHeroLine1: '공유된',
    listHeroLine2: '다이빙 로그예요.',
    listHeroLine1Named: '{name}님이 공유한',
    listHeroLine2Named: '다이빙 로그예요.',
    sharedLogLabel: '공유 로그',
    sharedLogLabelNamed: '{name}님의 로그',
    scubaShort: '스쿠버',
    freeShort: '프리',
    scubaDetail: '스쿠버 다이빙',
    freeDetail: '프리 다이빙',
    scubaDive: '스쿠버 다이빙',
    freeDive: '프리 다이빙',
    surfaceTime: '휴식 시간',
    maxDepth: '최대 수심',
    diveTime: '다이빙 시간',
    bottomTemp: '바닥 수온',
    surfaceTemp: '수면 수온',
    gasType: '기체 유형',
    enjoyDiving: '다이브로이드와 함께 다이빙 100배 즐기기!',
    download: '설치',
    dateUnknown: '날짜 없음',
    locationUnknown: '위치 없음',
    loading: '다이브 로그를 불러오는 중...',
    loadError: '공유된 다이브 로그를 불러오지 못했어요.',
    missingLink: '공유 링크가 없어요.',
    emptyLogs: '공유된 다이브 로그가 없어요.',
    backToList: '목록으로',
    sharedMedia: '공유 미디어',
    diveMedia: '다이브 미디어',
    diveStatistics: '다이빙 데이터',
    diveProfileChart: '다이브 프로파일',
    diveProfileScrub: '다이브 프로파일. 드래그하면 미디어를 볼 수 있어요.',
  },
}

export function resolveShareLocale(
  candidates: ReadonlyArray<string | null | undefined>,
): ShareLocale {
  for (const candidate of candidates) {
    const normalized = (candidate ?? '').trim().toLowerCase().replaceAll('_', '-')
    if (normalized.startsWith('ko')) {
      return 'ko'
    }
    if (normalized.startsWith('en')) {
      return 'en'
    }
  }
  return 'en'
}

export function detectShareLocale(): ShareLocale {
  if (typeof window === 'undefined') {
    return 'en'
  }
  const params = new URLSearchParams(window.location.search)
  return resolveShareLocale([
    params.get('lang'),
    ...(navigator.languages ?? []),
    navigator.language,
  ])
}

export function formatShareListHeroLines(
  senderName: string,
  copy: ShareCopy,
): { line1: string; line2: string } {
  const name: string = senderName.trim()
  if (!name) {
    return { line1: copy.listHeroLine1, line2: copy.listHeroLine2 }
  }
  return {
    line1: applyShareName(copy.listHeroLine1Named, name),
    line2: applyShareName(copy.listHeroLine2Named, name),
  }
}

export function formatShareOwnerLabel(senderName: string, copy: ShareCopy): string {
  const name: string = senderName.trim()
  if (!name) {
    return copy.sharedLogLabel
  }
  return applyShareName(copy.sharedLogLabelNamed, name)
}

function applyShareName(template: string, name: string): string {
  return template.replaceAll('{name}', name)
}

export function formatSurfaceTimeTitle(tabTitle: string, copy: ShareCopy): string {
  const trimmed = tabTitle.trim()
  const match = /^(?:surface time)(?:\s+(\d+))?$/i.exec(trimmed)
  if (match) {
    return match[1] ? `${copy.surfaceTime} ${match[1]}` : copy.surfaceTime
  }
  return trimmed || copy.surfaceTime
}

export function formatShareListTitle(input: ShareTitleInput, copy: ShareCopy): string {
  if (input.isSurfaceTime) {
    return formatSurfaceTimeTitle(input.tabTitle, copy)
  }
  if (input.recordLabel) {
    const prefix = input.isFreeDiving ? copy.freeShort : copy.scubaShort
    return `${prefix} #${input.recordLabel}`
  }
  const tabTitle = input.tabTitle.trim()
  if (tabTitle) {
    return localizeStoredTitle(tabTitle, copy)
  }
  return input.isFreeDiving ? copy.freeDive : copy.scubaDive
}

export function formatShareDetailTitle(input: ShareTitleInput, copy: ShareCopy): string {
  if (input.isSurfaceTime) {
    return formatSurfaceTimeTitle(input.tabTitle, copy)
  }
  const listTitle = formatShareListTitle(input, copy)
  const scubaPrefix = `${copy.scubaShort} #`
  const freePrefix = `${copy.freeShort} #`
  if (listTitle.startsWith(scubaPrefix)) {
    return `${copy.scubaDetail} #${listTitle.slice(scubaPrefix.length)}`
  }
  if (listTitle.startsWith(freePrefix)) {
    return `${copy.freeDetail} #${listTitle.slice(freePrefix.length)}`
  }
  return listTitle
}

function localizeStoredTitle(title: string, copy: ShareCopy): string {
  const scuba = /^scuba(?: diving)?\s*#(.+)$/i.exec(title)
  if (scuba) {
    return `${copy.scubaShort} #${scuba[1]}`
  }
  const free = /^free(?: diving)?\s*#(.+)$/i.exec(title)
  if (free) {
    return `${copy.freeShort} #${free[1]}`
  }
  if (/^surface time(?:\s+\d+)?$/i.test(title)) {
    return formatSurfaceTimeTitle(title, copy)
  }
  return title
}
