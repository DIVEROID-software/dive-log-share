import {
  formatShareDetailTitle,
  formatShareListTitle,
  resolveShareLocale,
  SHARE_COPY,
} from './i18n.ts'

function assertEqual(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

assertEqual(resolveShareLocale(['ko-KR']), 'ko')
assertEqual(resolveShareLocale(['en-US']), 'en')
assertEqual(resolveShareLocale(['vi', 'ko']), 'ko')
assertEqual(resolveShareLocale(['vi-VN']), 'en')

assertEqual(SHARE_COPY.en.listHeroLine1, 'Take a look at')
assertEqual(SHARE_COPY.en.enjoyDiving, 'Enjoy diving with DIVEROID!')
assertEqual(SHARE_COPY.en.download, 'Download')
assertEqual(SHARE_COPY.en.maxDepth, 'Max Depth')
assertEqual(SHARE_COPY.en.bottomTemp, 'Bottom Temp')
assertEqual(SHARE_COPY.en.gasType, 'Gas Type')
assertEqual(SHARE_COPY.en.surfaceTime, 'Surface Time')

assertEqual(SHARE_COPY.ko.listHeroLine2, '다이빙 로그예요.')
assertEqual(SHARE_COPY.ko.enjoyDiving, '다이브로이드와 함께 다이빙 100배 즐기기!')
assertEqual(SHARE_COPY.ko.download, '설치')
assertEqual(SHARE_COPY.ko.maxDepth, '최대 수심')
assertEqual(SHARE_COPY.ko.diveTime, '다이빙 시간')
assertEqual(SHARE_COPY.ko.bottomTemp, '바닥 수온')
assertEqual(SHARE_COPY.ko.gasType, '기체 유형')
assertEqual(SHARE_COPY.ko.surfaceTime, '휴식 시간')
assertEqual(SHARE_COPY.ko.scubaShort, '스쿠버')
assertEqual(SHARE_COPY.ko.freeShort, '프리')
assertEqual(SHARE_COPY.ko.scubaDetail, '스쿠버 다이빙')

const freeTrip = {
  isSurfaceTime: false,
  isFreeDiving: true,
  recordLabel: '284-1',
  tabTitle: 'Free #284',
}
assertEqual(formatShareListTitle(freeTrip, SHARE_COPY.en), 'Free #284-1')
assertEqual(formatShareDetailTitle(freeTrip, SHARE_COPY.en), 'Free Diving #284-1')
assertEqual(formatShareListTitle(freeTrip, SHARE_COPY.ko), '프리 #284-1')
assertEqual(formatShareDetailTitle(freeTrip, SHARE_COPY.ko), '프리 다이빙 #284-1')

const surface = {
  isSurfaceTime: true,
  isFreeDiving: false,
  recordLabel: '',
  tabTitle: 'Surface Time',
}
assertEqual(formatShareListTitle(surface, SHARE_COPY.ko), '휴식 시간')
assertEqual(formatShareDetailTitle(surface, SHARE_COPY.en), 'Surface Time')

console.log('i18n check ok')
