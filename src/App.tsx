import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_BASE_URL =
  'https://supabase.diveroid.shop/storage/v1/object/public/dive_log_share'
const DOWNLOAD_URL = 'https://www.diveroid.com/'
const DIVEROID_LOGO_URL = '/diveroid_logo.svg'
const DIVEROID_FULL_LOGO_URL = '/diveroid_full_logo.svg'

interface DiveLogShareManifest {
  schemaVersion: number
  shareId: string
  shareUrl: string
  createdAt: string
  allowDownload: boolean
  diveLogIds: string[]
  diveLogs: DiveLogShareManifestDiveLog[]
  warnings: string[]
}

interface DiveLogShareManifestDiveLog {
  diveLogId: string
  tabTitle: string
  diveDisplayIndex: number
  isFreeDiving: boolean
  dateText: string
  locationText: string
  stats: DiveLogShareManifestStats | null
  chart: DiveLogShareManifestChart | null
  files: DiveLogShareManifestFiles
  media: DiveLogShareManifestMedia[]
}

interface DiveLogShareManifestStats {
  maxDepth: number
  diveTime: number
  bottomTemp: number
  surfaceTemp: number
  gasType: string
  isFreeDiving: boolean
}

interface DiveLogShareManifestChart {
  xValues: number[]
  yValues: number[]
  sessionXValues: number[]
  sessionYValues: number[]
  tripXValues: number[]
  tripYValues: number[]
}

interface DiveLogShareManifestFiles {
  diveLogJson: string
  diveData: string | null
  location: string | null
}

interface DiveLogShareManifestMedia {
  originalName: string
  mediaKind: string
  filePath: string
  posterPath: string | null
}

type LoadState =
  | { status: 'idle' }
  | { status: 'success'; shareId: string; manifest: DiveLogShareManifest }
  | { status: 'error'; shareId: string; message: string }

interface RouteState {
  shareId: string
  selectedLogId: string | null
}

interface ChartPoint {
  x: number
  y: number
}

function App() {
  const [route, setRoute] = useState<RouteState>(() => readRouteState())
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    const handlePopState = () => setRoute(readRouteState())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!route.shareId) {
      return
    }

    const controller = new AbortController()
    const shareId = route.shareId

    fetch(manifestUrl(shareId), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Manifest request failed with ${response.status}`)
        }
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        setLoadState({
          status: 'success',
          shareId,
          manifest: normalizeManifest(payload, shareId),
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setLoadState({
          status: 'error',
          shareId,
          message: 'Dive log share could not be loaded.',
        })
      })

    return () => controller.abort()
  }, [route.shareId])

  const selectedDiveLog = useMemo(() => {
    if (
      loadState.status !== 'success' ||
      loadState.shareId !== route.shareId ||
      !route.selectedLogId
    ) {
      return null
    }
    return (
      loadState.manifest.diveLogs.find(
        (diveLog) => diveLog.diveLogId === route.selectedLogId,
      ) ?? null
    )
  }, [loadState, route.shareId, route.selectedLogId])

  const openDiveLog = (diveLogId: string) => {
    navigateTo({ shareId: route.shareId, selectedLogId: diveLogId })
    setRoute(readRouteState())
  }

  const closeDiveLog = () => {
    navigateTo({ shareId: route.shareId, selectedLogId: null })
    setRoute(readRouteState())
  }

  return (
    <main className="share-page">
      <section className="phone-shell" aria-live="polite">
        {!route.shareId && <CenteredState label="Share link is missing." />}
        {route.shareId &&
          loadState.status !== 'success' &&
          (loadState.status !== 'error' || loadState.shareId !== route.shareId) && (
            <CenteredState label="Loading dive log..." />
          )}
        {route.shareId &&
          loadState.status === 'error' &&
          loadState.shareId === route.shareId && <CenteredState label={loadState.message} />}
        {route.shareId &&
          loadState.status === 'success' &&
          loadState.shareId === route.shareId &&
          (selectedDiveLog ? (
            <DiveLogDetailScreen diveLog={selectedDiveLog} onBack={closeDiveLog} />
          ) : (
            <DiveLogListScreen
              manifest={loadState.manifest}
              onOpenDiveLog={openDiveLog}
            />
          ))}
      </section>
    </main>
  )
}

function DiveLogListScreen({
  manifest,
  onOpenDiveLog,
}: {
  manifest: DiveLogShareManifest
  onOpenDiveLog: (diveLogId: string) => void
}) {
  return (
    <div className="screen list-screen">
      <header className="list-hero">
        <DiveroidLogo />
        <h1>
          Take a look at
          <span>Shared Dive Log</span>
        </h1>
      </header>

      {manifest.diveLogs.length === 0 ? (
        <CenteredState label="No shared dive logs." compact />
      ) : (
        <ol className="dive-log-list">
          {manifest.diveLogs.map((diveLog) => (
            <li key={diveLog.diveLogId}>
              <button
                type="button"
                className="dive-log-item"
                onClick={() => onOpenDiveLog(diveLog.diveLogId)}
              >
                <MediaMosaic media={diveLog.media} title={listTitle(diveLog)} />
                <span className="item-copy">
                  <span className="item-date">{fallbackText(diveLog.dateText, 'Date unknown')}</span>
                  <span className="item-title">{listTitle(diveLog)}</span>
                  <span className="item-location">{listLocation(diveLog.locationText)}</span>
                </span>
                <ChevronIcon />
              </button>
            </li>
          ))}
        </ol>
      )}

      <DownloadBanner />
    </div>
  )
}

function DiveLogDetailScreen({
  diveLog,
  onBack,
}: {
  diveLog: DiveLogShareManifestDiveLog
  onBack: () => void
}) {
  return (
    <article className="screen detail-screen">
      <header className="detail-app-bar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back to list">
          <BackIcon />
        </button>
      </header>

      <section className="detail-intro">
        <p className="owner-label">Shared Log</p>
        <h1>{detailTitle(diveLog)}</h1>
        <div className="detail-meta">
          <span>{fallbackText(diveLog.dateText, 'Date unknown')}</span>
          <span>{fallbackText(diveLog.locationText, 'Location unknown')}</span>
        </div>
      </section>

      <StatsGrid stats={diveLog.stats} isFreeDiving={diveLog.isFreeDiving} />
      <DiveProfileChart chart={diveLog.chart} stats={diveLog.stats} />
      <MediaGallery media={diveLog.media} />
    </article>
  )
}

function StatsGrid({
  stats,
  isFreeDiving,
}: {
  stats: DiveLogShareManifestStats | null
  isFreeDiving: boolean
}) {
  const temperatureLabel = isFreeDiving ? 'Surface Temp' : 'Bottom Temp'
  const temperatureValue = isFreeDiving ? stats?.surfaceTemp : stats?.bottomTemp

  return (
    <section className="stats-grid" aria-label="Dive statistics">
      <StatItem
        icon={<DepthIcon />}
        label="Max Depth"
        value={formatNumber(stats?.maxDepth)}
        unit="m"
      />
      <StatItem
        icon={<TimeIcon />}
        label="Dive Time"
        value={formatNumber(stats?.diveTime)}
        unit="min"
      />
      <StatItem
        icon={<TemperatureIcon />}
        label={temperatureLabel}
        value={formatNumber(temperatureValue)}
        unit="℃"
      />
      <StatItem
        icon={<GasIcon />}
        label="Gas Type"
        value={formatGasType(stats?.gasType)}
        compact
      />
    </section>
  )
}

function StatItem({
  icon,
  label,
  value,
  unit,
  compact = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  compact?: boolean
}) {
  return (
    <div className="stat-item">
      <p>{label}</p>
      <div className={compact ? 'stat-value stat-value-compact' : 'stat-value'}>
        {icon}
        <span>{value}</span>
        {unit && <small>{unit}</small>}
      </div>
    </div>
  )
}

function DiveProfileChart({
  chart,
  stats,
}: {
  chart: DiveLogShareManifestChart | null
  stats: DiveLogShareManifestStats | null
}) {
  const points = chartPoints(chart)
  const hasChart = points.length >= 2
  const maxDepth = Math.max(
    1,
    stats?.maxDepth ?? 0,
    ...points.map((point) => Math.abs(point.y)),
  )
  const maxTime = Math.max(1, stats?.diveTime ?? 0, ...points.map((point) => point.x))
  const yAxisLabels = axisDepthLabels(maxDepth)
  const xAxisLabels = axisTimeLabels(maxTime)
  const path = hasChart ? areaPath(points, maxTime, maxDepth) : ''
  const line = hasChart ? linePath(points, maxTime, maxDepth) : ''

  return (
    <section className="profile-card" aria-label="Dive profile chart">
      <svg viewBox="0 0 350 156" role="img" aria-label="Dive profile">
        <defs>
          <linearGradient id="profile-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#BCE7FF" />
            <stop offset="46%" stopColor="#248EFA" />
            <stop offset="100%" stopColor="#612FD4" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((lineIndex) => (
          <line
            key={lineIndex}
            className="chart-grid-line"
            x1="28"
            x2="344"
            y1={18 + lineIndex * 30}
            y2={18 + lineIndex * 30}
          />
        ))}
        {hasChart && (
          <>
            <path className="profile-fill" d={path} />
            <path className="profile-line" d={line} />
          </>
        )}
      </svg>
      {!hasChart && <p className="chart-empty">No dive profile available.</p>}
      <div className="chart-y-labels" aria-hidden="true">
        {yAxisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="chart-x-labels" aria-hidden="true">
        {xAxisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </section>
  )
}

function MediaGallery({ media }: { media: DiveLogShareManifestMedia[] }) {
  if (media.length === 0) {
    return null
  }

  return (
    <section className="media-gallery" aria-label="Shared media">
      {media.map((item) => {
        const mediaUrl = assetUrl(item.filePath)
        const posterUrl = item.posterPath ? assetUrl(item.posterPath) : undefined
        return item.mediaKind === 'video' ? (
          <video
            key={item.filePath}
            src={mediaUrl}
            poster={posterUrl}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img key={item.filePath} src={mediaUrl} alt={item.originalName || 'Dive media'} />
        )
      })}
    </section>
  )
}

function MediaMosaic({
  media,
  title,
}: {
  media: DiveLogShareManifestMedia[]
  title: string
}) {
  const previewMedia = media.slice(0, 4)

  if (previewMedia.length === 0) {
    return (
      <span className="mosaic mosaic-empty" aria-label={`${title} media preview`}>
        <LogoMark />
      </span>
    )
  }

  return (
    <span
      className={`mosaic mosaic-count-${previewMedia.length}`}
      aria-label={`${title} media preview`}
    >
      {previewMedia.map((item) => (
        <img
          key={`${item.filePath}-${item.posterPath ?? ''}`}
          src={assetUrl(item.posterPath ?? item.filePath)}
          alt=""
        />
      ))}
    </span>
  )
}

function DownloadBanner() {
  return (
    <a className="download-banner" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
      <span className="download-brand">
        <LogoMark />
        <span>Enjoy diving with DIVEROID!</span>
      </span>
      <span className="download-button">Download</span>
    </a>
  )
}

function CenteredState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={compact ? 'centered-state centered-state-compact' : 'centered-state'}>
      <LogoMark />
      <p>{label}</p>
    </div>
  )
}

function DiveroidLogo() {
  return <img className="diveroid-logo" src={DIVEROID_FULL_LOGO_URL} alt="DIVEROID" />
}

function LogoMark() {
  return <img className="logo-mark" src={DIVEROID_LOGO_URL} alt="" aria-hidden="true" />
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="chevron-icon">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function DepthIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h18M3 20h18" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 6v11m0 0-3-3m3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TimeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 3h6M12 6v2m0 5V9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TemperatureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 5a2 2 0 1 1 4 0v8.2a5 5 0 1 1-4 0V5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12 14v-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function GasIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 5.5h6l1 3.5v10H8V9l1-3.5ZM10 3h4v2.5h-4V3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 11h6M9 15h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function readRouteState(): RouteState {
  const params = new URLSearchParams(window.location.search)
  return {
    shareId: params.get('id')?.trim() ?? '',
    selectedLogId: params.get('log')?.trim() || null,
  }
}

function navigateTo(route: RouteState) {
  const params = new URLSearchParams(window.location.search)
  params.set('id', route.shareId)
  if (route.selectedLogId) {
    params.set('log', route.selectedLogId)
  } else {
    params.delete('log')
  }
  window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`)
}

function manifestUrl(shareId: string): string {
  return `${STORAGE_BASE_URL}/${encodeURIComponent(shareId)}/manifest.json`
}

function assetUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, '')
  return `${STORAGE_BASE_URL}/${cleanPath.split('/').map(encodeURIComponent).join('/')}`
}

function normalizeManifest(payload: unknown, fallbackShareId: string): DiveLogShareManifest {
  const manifest = isRecord(payload) ? payload : {}
  const diveLogs = readArray(manifest.diveLogs).map(normalizeDiveLog)
  return {
    schemaVersion: readNumber(manifest.schemaVersion, 1),
    shareId: readString(manifest.shareId, fallbackShareId),
    shareUrl: readString(manifest.shareUrl, ''),
    createdAt: readString(manifest.createdAt, ''),
    allowDownload: readBoolean(manifest.allowDownload, false),
    diveLogIds: readArray(manifest.diveLogIds).map((item) => readString(item, '')),
    diveLogs,
    warnings: readArray(manifest.warnings).map((item) => readString(item, '')),
  }
}

function normalizeDiveLog(payload: unknown): DiveLogShareManifestDiveLog {
  const diveLog = isRecord(payload) ? payload : {}
  return {
    diveLogId: readString(diveLog.diveLogId, ''),
    tabTitle: readString(diveLog.tabTitle, ''),
    diveDisplayIndex: readNumber(diveLog.diveDisplayIndex, 0),
    isFreeDiving: readBoolean(diveLog.isFreeDiving, false),
    dateText: readString(diveLog.dateText, ''),
    locationText: readString(diveLog.locationText, ''),
    stats: normalizeStats(diveLog.stats),
    chart: normalizeChart(diveLog.chart),
    files: normalizeFiles(diveLog.files),
    media: readArray(diveLog.media).map(normalizeMedia).filter((media) => media.filePath),
  }
}

function normalizeStats(payload: unknown): DiveLogShareManifestStats | null {
  if (!isRecord(payload)) {
    return null
  }
  return {
    maxDepth: readNumber(payload.maxDepth, 0),
    diveTime: readNumber(payload.diveTime, 0),
    bottomTemp: readNumber(payload.bottomTemp, 0),
    surfaceTemp: readNumber(payload.surfaceTemp, 0),
    gasType: readString(payload.gasType, ''),
    isFreeDiving: readBoolean(payload.isFreeDiving, false),
  }
}

function normalizeChart(payload: unknown): DiveLogShareManifestChart | null {
  if (!isRecord(payload)) {
    return null
  }
  return {
    xValues: readNumberArray(payload.xValues),
    yValues: readNumberArray(payload.yValues),
    sessionXValues: readNumberArray(payload.sessionXValues),
    sessionYValues: readNumberArray(payload.sessionYValues),
    tripXValues: readNumberArray(payload.tripXValues),
    tripYValues: readNumberArray(payload.tripYValues),
  }
}

function normalizeFiles(payload: unknown): DiveLogShareManifestFiles {
  const files = isRecord(payload) ? payload : {}
  return {
    diveLogJson: readString(files.diveLogJson, ''),
    diveData: nullableString(files.diveData),
    location: nullableString(files.location),
  }
}

function normalizeMedia(payload: unknown): DiveLogShareManifestMedia {
  const media = isRecord(payload) ? payload : {}
  return {
    originalName: readString(media.originalName, ''),
    mediaKind: readString(media.mediaKind, 'photo'),
    filePath: readString(media.filePath, ''),
    posterPath: nullableString(media.posterPath),
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readNumberArray(value: unknown): number[] {
  return readArray(value).filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function chartPoints(chart: DiveLogShareManifestChart | null): ChartPoint[] {
  if (!chart) {
    return []
  }
  const pointCount = Math.min(chart.xValues.length, chart.yValues.length)
  return Array.from({ length: pointCount }, (_, index) => ({
    x: chart.xValues[index],
    y: Math.abs(chart.yValues[index]),
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function chartX(value: number, maxTime: number): number {
  return 28 + (value / maxTime) * 316
}

function chartY(value: number, maxDepth: number): number {
  return 18 + (Math.abs(value) / maxDepth) * 120
}

function linePath(points: ChartPoint[], maxTime: number, maxDepth: number): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${chartX(point.x, maxTime).toFixed(2)} ${chartY(point.y, maxDepth).toFixed(2)}`
    })
    .join(' ')
}

function areaPath(points: ChartPoint[], maxTime: number, maxDepth: number): string {
  const line = linePath(points, maxTime, maxDepth)
  const first = points[0]
  const last = points[points.length - 1]
  return `${line} L${chartX(last.x, maxTime).toFixed(2)} 18 L${chartX(first.x, maxTime).toFixed(2)} 18 Z`
}

function axisDepthLabels(maxDepth: number): string[] {
  const step = Math.max(1, Math.ceil(maxDepth / 4))
  return ['0', `${step}m`, `${step * 2}m`, `${step * 3}m`, `${step * 4}m`]
}

function axisTimeLabels(maxTime: number): string[] {
  const step = Math.max(1, Math.round(maxTime / 4))
  return [0, step, step * 2, step * 3, Math.round(maxTime)].map(formatTimeLabel)
}

function formatTimeLabel(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))}:00`
}

function listTitle(diveLog: DiveLogShareManifestDiveLog): string {
  if (diveLog.tabTitle.trim()) {
    return diveLog.tabTitle.trim()
  }
  const prefix = diveLog.isFreeDiving ? 'Free' : 'Scuba'
  const index = diveLog.diveDisplayIndex > 0 ? diveLog.diveDisplayIndex : ''
  return index ? `${prefix} #${index}` : `${prefix} Dive`
}

function detailTitle(diveLog: DiveLogShareManifestDiveLog): string {
  const title = listTitle(diveLog)
  if (title.startsWith('Scuba #')) {
    return title.replace('Scuba #', 'Scuba Diving #')
  }
  if (title.startsWith('Free #')) {
    return title.replace('Free #', 'Free Diving #')
  }
  return title
}

function listLocation(locationText: string): string {
  const parts = locationText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]}  |  ${parts[1]}`
  }
  return fallbackText(locationText, 'Location unknown')
}

function fallbackText(value: string, fallback: string): string {
  return value.trim() || fallback
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && value > 0 ? Math.round(value).toString() : '—'
}

function formatGasType(value: string | undefined): string {
  const gasType = value?.trim()
  return gasType || '—'
}

export default App
