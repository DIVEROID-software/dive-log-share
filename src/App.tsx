import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import './App.css'
import {
  detectShareLocale,
  formatShareDetailTitle,
  formatShareListTitle,
  formatSurfaceTimeTitle,
  SHARE_COPY,
  type ShareCopy,
} from './i18n.ts'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'https://supabase.diveroid.shop'
).replace(/\/+$/, '')
const STORAGE_BASE_URL = `${API_BASE_URL}/storage/v1/object/public/dive_log_share`
const DOWNLOAD_URL = 'https://www.diveroid.com/'
const DIVEROID_LOGO_URL = `${import.meta.env.BASE_URL}diveroid_logo.svg`
const DIVEROID_FULL_LOGO_URL = `${import.meta.env.BASE_URL}diveroid_full_logo.svg`
const ICON_BASE_URL = `${import.meta.env.BASE_URL}icons/`

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
  isSurfaceTime: boolean
  /** 1-based free-dive trip index; 0 when the share is a whole session / scuba. */
  freeTripNumber: number
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
  /** Seconds from dive start; null when capture metadata was unavailable. */
  captureOffsetSeconds: number | null
}

interface MediaMarker {
  mediaIndex: number
  offsetSeconds: number
}

type LoadState =
  | { status: 'idle' }
  | { status: 'success'; shareId: string; manifest: DiveLogShareManifest }
  | { status: 'error'; shareId: string }

const ShareCopyContext = createContext<ShareCopy>(SHARE_COPY.en)

function ShareCopyProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<ShareCopy>(() => SHARE_COPY[detectShareLocale()])

  useEffect(() => {
    const sync = (): void => {
      const locale = detectShareLocale()
      setCopy(SHARE_COPY[locale])
      document.documentElement.lang = locale
    }
    sync()
    window.addEventListener('languagechange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('languagechange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  return <ShareCopyContext.Provider value={copy}>{children}</ShareCopyContext.Provider>
}

function useShareCopy(): ShareCopy {
  return useContext(ShareCopyContext)
}

interface RouteState {
  shareId: string
  selectedLogId: string | null
  shareType: string | null
}

interface ChartPoint {
  x: number
  y: number
}

function App() {
  return (
    <ShareCopyProvider>
      <ShareApp />
    </ShareCopyProvider>
  )
}

function ShareApp() {
  const copy = useShareCopy()
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
    navigateTo({ shareId: route.shareId, selectedLogId: diveLogId, shareType: route.shareType })
    setRoute(readRouteState())
  }

  const closeDiveLog = () => {
    navigateTo({ shareId: route.shareId, selectedLogId: null, shareType: route.shareType })
    setRoute(readRouteState())
  }

  return (
    <main className="share-page">
      <section className="phone-shell" aria-live="polite">
        {!route.shareId && <CenteredState label={copy.missingLink} />}
        {route.shareId &&
          loadState.status !== 'success' &&
          (loadState.status !== 'error' || loadState.shareId !== route.shareId) && (
            <CenteredState label={copy.loading} />
          )}
        {route.shareId &&
          loadState.status === 'error' &&
          loadState.shareId === route.shareId && <CenteredState label={copy.loadError} />}
        {route.shareId &&
          loadState.status === 'success' &&
          loadState.shareId === route.shareId &&
          (selectedDiveLog ? (
            isSurfaceTimeLog(selectedDiveLog) ? (
              <SurfaceTimeDetailScreen
                key={selectedDiveLog.diveLogId}
                diveLog={selectedDiveLog}
                showBackButton={route.shareType !== 'single'}
                onBack={closeDiveLog}
              />
            ) : (
              <DiveLogDetailScreen
                key={selectedDiveLog.diveLogId}
                diveLog={selectedDiveLog}
                showBackButton={route.shareType !== 'single'}
                onBack={closeDiveLog}
              />
            )
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
  const copy = useShareCopy()
  return (
    <div className="screen list-screen">
      <header className="list-hero">
        <DiveroidLogo />
        <h1>
          <span>{copy.listHeroLine1}</span>
          <span>{copy.listHeroLine2}</span>
        </h1>
      </header>

      {manifest.diveLogs.length === 0 ? (
        <CenteredState label={copy.emptyLogs} compact />
      ) : (
        <ol className="dive-log-list">
          {manifest.diveLogs.map((diveLog) => (
            <li key={diveLog.diveLogId}>
              <button
                type="button"
                className="dive-log-item"
                onClick={() => onOpenDiveLog(diveLog.diveLogId)}
              >
                <MediaMosaic media={diveLog.media} title={listTitle(diveLog, copy)} />
                <span className="item-copy">
                  <span className="item-date">{fallbackText(diveLog.dateText, copy.dateUnknown)}</span>
                  <span className="item-title">{listTitle(diveLog, copy)}</span>
                  <ListLocation locationText={diveLog.locationText} />
                </span>
                <FigmaIcon
                  name="ic_l_arrow_right_g_16"
                  className="item-chevron"
                  size={16}
                />
              </button>
            </li>
          ))}
        </ol>
      )}

      <DownloadBanner />
    </div>
  )
}

function SurfaceTimeDetailScreen({
  diveLog,
  showBackButton,
  onBack,
}: {
  diveLog: DiveLogShareManifestDiveLog
  showBackButton: boolean
  onBack: () => void
}) {
  const copy = useShareCopy()
  return (
    <article className="screen detail-screen surface-time-screen">
      <header className="detail-app-bar">
        {showBackButton && (
          <button type="button" className="icon-button" onClick={onBack} aria-label={copy.backToList}>
            <FigmaIcon name="ic_l_back_24" className="back-icon" />
          </button>
        )}
      </header>

      <section className="detail-intro surface-time-intro">
        <p className="owner-label">{copy.sharedLogLabel}</p>
        <h1>{surfaceTimeTitle(diveLog, copy)}</h1>
        <p className="surface-time-date">{fallbackText(diveLog.dateText, copy.dateUnknown)}</p>
      </section>

      <SurfaceTimeMediaGallery media={diveLog.media} />
      <DownloadBanner />
    </article>
  )
}

function SurfaceTimeMediaGallery({ media }: { media: DiveLogShareManifestMedia[] }) {
  const copy = useShareCopy()
  if (media.length === 0) {
    return null
  }

  return (
    <section className="surface-time-gallery" aria-label={copy.sharedMedia}>
      {media.map((item) => {
        const mediaUrl = assetUrl(item.filePath)
        const posterUrl = item.posterPath ? assetUrl(item.posterPath) : undefined
        const isVideo = item.mediaKind === 'video'
        return (
          <div key={item.filePath} className="surface-time-gallery-item">
            {isVideo ? (
              <>
                <video
                  src={mediaUrl}
                  poster={posterUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
                <FigmaIcon
                  name="ic_s_pause_32"
                  className="surface-time-video-badge"
                  size={32}
                />
              </>
            ) : (
              <img src={mediaUrl} alt={item.originalName || copy.diveMedia} />
            )}
          </div>
        )
      })}
    </section>
  )
}

function DiveLogDetailScreen({
  diveLog,
  showBackButton,
  onBack,
}: {
  diveLog: DiveLogShareManifestDiveLog
  showBackButton: boolean
  onBack: () => void
}) {
  const copy = useShareCopy()
  const points = useMemo(() => chartPoints(diveLog.chart), [diveLog.chart])
  const mediaMarkers = useMemo(
    () => buildMediaMarkers(diveLog.media, points),
    [diveLog.media, points],
  )
  const [selectedPointIndex, setSelectedPointIndex] = useState(0)
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1)
  const [chartScrollProgress, setChartScrollProgress] = useState(0)
  const isTouchingChartRef = useRef(false)
  const programmaticScrollTargetRef = useRef<number | null>(null)
  const programmaticTimeoutRef = useRef<number | null>(null)
  const mediaItemRefs = useRef<Array<HTMLElement | null>>([])
  const stickyChartRef = useRef<HTMLDivElement | null>(null)
  const detailScreenRef = useRef<HTMLElement | null>(null)

  const clearProgrammaticScroll = useCallback(() => {
    programmaticScrollTargetRef.current = null
    if (programmaticTimeoutRef.current !== null) {
      window.clearTimeout(programmaticTimeoutRef.current)
      programmaticTimeoutRef.current = null
    }
  }, [])

  const applyMediaMarker = useCallback(
    (mediaIndex: number) => {
      setActiveMediaIndex(mediaIndex)
      const marker = nearestMediaMarkerByIndex(mediaMarkers, mediaIndex)
      if (marker && points.length > 0) {
        setSelectedPointIndex(findClosestIndex(points, marker.offsetSeconds))
      }
    },
    [mediaMarkers, points],
  )

  const scrollMediaIntoView = useCallback(
    (mediaIndex: number) => {
      const target = mediaItemRefs.current[mediaIndex]
      if (!target) {
        return
      }
      programmaticScrollTargetRef.current = mediaIndex
      if (programmaticTimeoutRef.current !== null) {
        window.clearTimeout(programmaticTimeoutRef.current)
      }
      programmaticTimeoutRef.current = window.setTimeout(() => {
        programmaticScrollTargetRef.current = null
        programmaticTimeoutRef.current = null
      }, 1500)
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [],
  )

  const handleChartPointSelect = useCallback(
    (pointIndex: number, nearbyMediaIndex: number | null) => {
      setSelectedPointIndex(pointIndex)
      if (nearbyMediaIndex === null) {
        return
      }
      setActiveMediaIndex(nearbyMediaIndex)
      scrollMediaIntoView(nearbyMediaIndex)
    },
    [scrollMediaIntoView],
  )

  const handleGalleryActiveChange = useCallback(
    (mediaIndex: number) => {
      if (isTouchingChartRef.current) {
        return
      }
      const programmaticTarget = programmaticScrollTargetRef.current
      if (programmaticTarget !== null) {
        if (mediaIndex !== programmaticTarget) {
          return
        }
        clearProgrammaticScroll()
      }
      applyMediaMarker(mediaIndex)
    },
    [applyMediaMarker, clearProgrammaticScroll],
  )

  useEffect(() => {
    return () => {
      if (programmaticTimeoutRef.current !== null) {
        window.clearTimeout(programmaticTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const detailScreen = detailScreenRef.current
    const stickyChart = stickyChartRef.current
    if (!detailScreen || !stickyChart) {
      return
    }
    const scrollRoot =
      detailScreen.closest('.phone-shell') instanceof HTMLElement
        ? (detailScreen.closest('.phone-shell') as HTMLElement)
        : null
    if (!scrollRoot) {
      return
    }

    const updateFadeProgress = () => {
      const chartRect = stickyChart.getBoundingClientRect()
      const shellRect = scrollRoot.getBoundingClientRect()
      const isStuck = chartRect.top <= shellRect.top + 1
      if (!isStuck) {
        setChartScrollProgress(0)
        return
      }
      const firstMedia = mediaItemRefs.current.find((element) => element !== null) ?? null
      if (!firstMedia) {
        setChartScrollProgress(0)
        return
      }
      const mediaRect = firstMedia.getBoundingClientRect()
      const overlap = chartRect.bottom - mediaRect.top
      const progress = Math.min(1, Math.max(0, overlap / Math.max(chartRect.height, 1)))
      setChartScrollProgress(progress)
    }

    const cancelProgrammaticScroll = (event: Event) => {
      if (programmaticScrollTargetRef.current === null) {
        return
      }
      const eventTarget = event.target
      if (
        eventTarget instanceof Element &&
        eventTarget.closest('.sticky-chart, .profile-card, .chart-hit-area')
      ) {
        return
      }
      clearProgrammaticScroll()
    }

    const handleScroll = () => {
      updateFadeProgress()
    }

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true })
    scrollRoot.addEventListener('touchstart', cancelProgrammaticScroll, { passive: true })
    scrollRoot.addEventListener('wheel', cancelProgrammaticScroll, { passive: true })
    window.addEventListener('resize', updateFadeProgress)
    updateFadeProgress()

    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll)
      scrollRoot.removeEventListener('touchstart', cancelProgrammaticScroll)
      scrollRoot.removeEventListener('wheel', cancelProgrammaticScroll)
      window.removeEventListener('resize', updateFadeProgress)
    }
  }, [clearProgrammaticScroll, diveLog.diveLogId, diveLog.media.length])

  const stickyBackground = `rgba(255, 255, 255, ${(1 - chartScrollProgress).toFixed(3)})`

  return (
    <article ref={detailScreenRef} className="screen detail-screen">
      <header className="detail-app-bar">
        {showBackButton && (
          <button type="button" className="icon-button" onClick={onBack} aria-label={copy.backToList}>
            <FigmaIcon name="ic_l_back_24" className="back-icon" />
          </button>
        )}
      </header>

      <section className="detail-intro">
        <p className="owner-label">{copy.sharedLogLabel}</p>
        <h1>{detailTitle(diveLog, copy)}</h1>
        <div className="detail-meta">
          <span className="detail-meta-date">
            {fallbackText(diveLog.dateText, copy.dateUnknown)}
          </span>
          <span className="detail-meta-location">
            {fallbackText(diveLog.locationText, copy.locationUnknown)}
          </span>
        </div>
      </section>

      <StatsGrid stats={diveLog.stats} isFreeDiving={diveLog.isFreeDiving} />
      <div
        ref={stickyChartRef}
        className="sticky-chart"
        style={{ backgroundColor: stickyBackground }}
      >
        <DiveProfileChart
          stats={diveLog.stats}
          points={points}
          mediaMarkers={mediaMarkers}
          selectedPointIndex={selectedPointIndex}
          scrollProgress={chartScrollProgress}
          onSelectPoint={handleChartPointSelect}
          onTouchingChange={(isTouching) => {
            isTouchingChartRef.current = isTouching
          }}
        />
      </div>
      <MediaGallery
        media={diveLog.media}
        activeMediaIndex={activeMediaIndex}
        itemRefs={mediaItemRefs}
        onActiveMediaChange={handleGalleryActiveChange}
      />
      <DownloadBanner />
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
  const copy = useShareCopy()
  const temperatureLabel = isFreeDiving ? copy.surfaceTemp : copy.bottomTemp
  const temperatureValue = isFreeDiving ? stats?.surfaceTemp : stats?.bottomTemp

  return (
    <section className="stats-grid" aria-label={copy.diveStatistics}>
      <StatItem
        icon={<FigmaIcon name="ic_l_max_depth_24" />}
        label={copy.maxDepth}
        value={formatNumber(stats?.maxDepth)}
        unit="m"
      />
      <StatItem
        icon={<FigmaIcon name="ic_l_diving_time_24" />}
        label={copy.diveTime}
        value={formatNumber(stats?.diveTime)}
        unit="min"
      />
      <StatItem
        icon={<FigmaIcon name="ic_l_water_temperature_24" />}
        label={temperatureLabel}
        value={formatNumber(temperatureValue)}
        unit="℃"
      />
      <GasTypeStatItem gasType={stats?.gasType} />
    </section>
  )
}

function StatItem({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="stat-item">
      <p>{label}</p>
      <div className="stat-value">
        {icon}
        <span className="stat-metrics">
          <span className="stat-number">{value}</span>
          {unit && <small>{unit}</small>}
        </span>
      </div>
    </div>
  )
}

function GasTypeStatItem({ gasType }: { gasType: string | undefined }) {
  const copy = useShareCopy()
  const parts = parseGasTypeParts(gasType)

  return (
    <div className="stat-item">
      <p>{copy.gasType}</p>
      <div className="stat-value">
        <FigmaIcon name="ic_l_air_24" />
        {parts ? (
          <span className="stat-metrics">
            {parts.leading ? <small>{parts.leading}</small> : null}
            <span className="stat-number">{parts.numeric}</span>
            {parts.trailing ? <small>{parts.trailing}</small> : null}
          </span>
        ) : (
          <span className="stat-metrics">
            <span className="stat-number">—</span>
          </span>
        )}
      </div>
    </div>
  )
}

function DiveProfileChart({
  stats,
  points,
  mediaMarkers,
  selectedPointIndex,
  scrollProgress,
  onSelectPoint,
  onTouchingChange,
}: {
  stats: DiveLogShareManifestStats | null
  points: ChartPoint[]
  mediaMarkers: MediaMarker[]
  selectedPointIndex: number
  scrollProgress: number
  onSelectPoint: (pointIndex: number, nearbyMediaIndex: number | null) => void
  onTouchingChange: (isTouching: boolean) => void
}) {
  const copy = useShareCopy()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const lastMediaIndexRef = useRef(-1)
  const hasChart = points.length >= 2
  const clampedProgress = Math.min(1, Math.max(0, scrollProgress))
  const maxDepth = Math.max(
    1,
    stats?.maxDepth ?? 0,
    ...points.map((point) => Math.abs(point.y)),
  )
  // Chart X and capture offsets are seconds; stats.diveTime is minutes.
  const maxTime = Math.max(
    1,
    (stats?.diveTime ?? 0) * 60,
    ...points.map((point) => point.x),
  )
  const minTime = points.length > 0 ? points[0].x : 0
  const yAxisLabels = axisDepthLabels(maxDepth)
  const xAxisLabels = axisTimeLabels(maxTime)
  const path = hasChart ? areaPath(points, maxTime, maxDepth) : ''
  const line = hasChart ? linePath(points, maxTime, maxDepth) : ''
  const markerIndex = hasChart
    ? Math.min(Math.max(selectedPointIndex, 0), points.length - 1)
    : 0
  const markerPoint = hasChart ? points[markerIndex] : null
  const markerCanvas = markerPoint
    ? {
        x: chartX(markerPoint.x, maxTime),
        y: chartY(markerPoint.y, maxDepth),
      }
    : null
  const markerLabel = markerPoint
    ? `↕ ${Math.round(Math.abs(markerPoint.y))}m │ ⏱ ${formatTimeLabel(markerPoint.x)}`
    : ''
  const labelLayout = markerCanvas
    ? resolveMarkerLabelLayout(markerCanvas.x, markerCanvas.y, markerLabel)
    : null
  const guideOpacity = 1 - clampedProgress
  const axisOpacity = 1 - clampedProgress
  const lineStops = LINE_GRADIENT_STOPS.map((stop) => ({
    offset: stop.offset,
    color: lerpHexColor(stop.color, '#FFFFFF', clampedProgress),
  }))
  const areaStops = AREA_GRADIENT_STOPS.map((stop) => {
    const faded = rgbaFromHex('#FFFFFF', stop.fadeAlpha)
    return {
      offset: stop.offset,
      color: lerpCssColor(stop.color, faded, clampedProgress),
    }
  })

  const updateFromClientX = (clientX: number) => {
    if (!hasChart || !svgRef.current) {
      return
    }
    const bounds = svgRef.current.getBoundingClientRect()
    if (bounds.width <= 0) {
      return
    }
    const viewX = ((clientX - bounds.left) / bounds.width) * CHART_VIEW_WIDTH
    const clampedFraction = Math.min(
      1,
      Math.max(0, (viewX - CHART_PLOT_LEFT) / CHART_PLOT_WIDTH),
    )
    const dataX = minTime + clampedFraction * (maxTime - minTime)
    const pointIndex = findClosestIndex(points, dataX)
    const currentX = points[pointIndex].x
    const threshold = (maxTime - minTime) / 50
    let nearbyMediaIndex: number | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const marker of mediaMarkers) {
      const distance = Math.abs(marker.offsetSeconds - currentX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearbyMediaIndex = distance <= threshold ? marker.mediaIndex : null
      }
    }
    if (nearbyMediaIndex === null) {
      lastMediaIndexRef.current = -1
      onSelectPoint(pointIndex, null)
      return
    }
    if (lastMediaIndexRef.current === nearbyMediaIndex) {
      onSelectPoint(pointIndex, null)
      return
    }
    lastMediaIndexRef.current = nearbyMediaIndex
    onSelectPoint(pointIndex, nearbyMediaIndex)
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!hasChart) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onTouchingChange(true)
    updateFromClientX(event.clientX)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }
    updateFromClientX(event.clientX)
  }

  const clearTouching = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onTouchingChange(false)
  }

  return (
    <section
      className="profile-card"
      aria-label={copy.diveProfileChart}
      style={{ ['--chart-axis-opacity' as string]: axisOpacity.toFixed(3) }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
        role="img"
        aria-label={copy.diveProfileScrub}
      >
        <defs>
          <linearGradient id="profile-fill" x1="0" x2="0" y1="0" y2="1">
            {areaStops.map((stop) => (
              <stop
                key={`fill-${stop.offset}`}
                offset={`${stop.offset * 100}%`}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
          <linearGradient id="profile-line-stroke" x1="0" x2="1" y1="0" y2="0">
            {lineStops.map((stop) => (
              <stop
                key={`line-${stop.offset}`}
                offset={`${stop.offset * 100}%`}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((lineIndex) => (
          <line
            key={lineIndex}
            className="chart-grid-line"
            x1={CHART_PLOT_LEFT}
            x2={CHART_PLOT_LEFT + CHART_PLOT_WIDTH}
            y1={CHART_PLOT_TOP + lineIndex * 30}
            y2={CHART_PLOT_TOP + lineIndex * 30}
          />
        ))}
        {hasChart && (
          <>
            <path className="profile-fill" d={path} />
            <path className="profile-line" d={line} />
          </>
        )}
        {markerCanvas && (
          <g className="chart-marker" aria-hidden="true">
            <line
              className="chart-marker-guide"
              x1={markerCanvas.x}
              x2={markerCanvas.x}
              y1={markerCanvas.y}
              y2={CHART_PLOT_TOP + CHART_PLOT_HEIGHT}
              style={{ opacity: guideOpacity }}
            />
            <circle
              className="chart-marker-outer"
              cx={markerCanvas.x}
              cy={markerCanvas.y}
              r="8"
            />
            <circle
              className="chart-marker-inner"
              cx={markerCanvas.x}
              cy={markerCanvas.y}
              r="5"
            />
            {labelLayout && (
              <>
                <rect
                  className="chart-marker-label-bg"
                  x={labelLayout.x}
                  y={labelLayout.y}
                  width={labelLayout.width}
                  height={labelLayout.height}
                  rx={labelLayout.height / 2}
                />
                <text
                  className="chart-marker-label"
                  x={labelLayout.x + 12}
                  y={labelLayout.y + labelLayout.height / 2 + 4}
                >
                  {markerLabel}
                </text>
              </>
            )}
          </g>
        )}
        {hasChart && (
          <rect
            className="chart-hit-area"
            x={CHART_PLOT_LEFT}
            y={CHART_PLOT_TOP}
            width={CHART_PLOT_WIDTH}
            height={CHART_PLOT_HEIGHT}
            fill="transparent"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearTouching}
            onPointerCancel={clearTouching}
            onLostPointerCapture={() => onTouchingChange(false)}
          />
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

function MediaGallery({
  media,
  activeMediaIndex,
  itemRefs,
  onActiveMediaChange,
}: {
  media: DiveLogShareManifestMedia[]
  activeMediaIndex: number
  itemRefs: MutableRefObject<Array<HTMLElement | null>>
  onActiveMediaChange: (mediaIndex: number) => void
}) {
  const copy = useShareCopy()
  const galleryRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (media.length === 0 || !galleryRef.current) {
      return
    }
    const elements = itemRefs.current.filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) {
      return
    }

    const scrollRoot =
      galleryRef.current.closest('.phone-shell') instanceof HTMLElement
        ? (galleryRef.current.closest('.phone-shell') as HTMLElement)
        : null
    const ratios = new Map<Element, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        let bestIndex = -1
        let bestRatio = 0
        elements.forEach((element, index) => {
          const ratio = ratios.get(element) ?? 0
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestIndex = index
          }
        })
        if (bestIndex >= 0 && bestRatio > 0) {
          onActiveMediaChange(bestIndex)
        }
      },
      {
        root: scrollRoot,
        threshold: [0.25, 0.5, 0.75, 1],
        rootMargin: '-15% 0px -40% 0px',
      },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [media, itemRefs, onActiveMediaChange])

  if (media.length === 0) {
    return null
  }

  return (
    <section ref={galleryRef} className="media-gallery" aria-label={copy.sharedMedia}>
      {media.map((item, index) => {
        const mediaUrl = assetUrl(item.filePath)
        const posterUrl = item.posterPath ? assetUrl(item.posterPath) : undefined
        const isActive = index === activeMediaIndex
        return (
          <div
            key={item.filePath}
            className={isActive ? 'media-gallery-item is-active' : 'media-gallery-item'}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            data-media-index={index}
          >
            {item.mediaKind === 'video' ? (
              <video
                src={mediaUrl}
                poster={posterUrl}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img src={mediaUrl} alt={item.originalName || copy.diveMedia} />
            )}
          </div>
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
  const copy = useShareCopy()
  return (
    <a className="download-banner" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
      <span className="download-brand">
        <LogoMark />
        <span>{copy.enjoyDiving}</span>
      </span>
      <span className="download-button">{copy.download}</span>
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

function FigmaIcon({
  name,
  className = 'stat-icon',
  size = 24,
}: {
  name: string
  className?: string
  size?: number
}) {
  return (
    <img
      className={className}
      src={`${ICON_BASE_URL}${name}.svg`}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  )
}

function readRouteState(): RouteState {
  const params = new URLSearchParams(window.location.search)
  const shareType = params.get('type')?.trim().toLowerCase() || null
  return {
    shareId: params.get('id')?.trim() ?? '',
    selectedLogId: params.get('log')?.trim() || null,
    shareType,
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
  if (route.shareType) {
    params.set('type', route.shareType)
  } else {
    params.delete('type')
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
    isSurfaceTime:
      readBoolean(diveLog.isSurfaceTime, false) || inferIsSurfaceTime(diveLog),
    freeTripNumber: readNumber(diveLog.freeTripNumber, 0),
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
    captureOffsetSeconds: nullableNumber(media.captureOffsetSeconds),
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
  const series = visibleChartSeries(chart)
  const pointCount = Math.min(series.xValues.length, series.yValues.length)
  return Array.from({ length: pointCount }, (_, index) => ({
    x: series.xValues[index],
    y: Math.abs(series.yValues[index]),
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

/**
 * Free-dive trip shares plot the trip series when the app sends it; otherwise
 * the primary x/y series (already trip-only on newer manifests).
 */
function visibleChartSeries(chart: DiveLogShareManifestChart): {
  xValues: number[]
  yValues: number[]
} {
  const tripCount = Math.min(chart.tripXValues.length, chart.tripYValues.length)
  if (tripCount > 0) {
    return {
      xValues: chart.tripXValues.slice(0, tripCount),
      yValues: chart.tripYValues.slice(0, tripCount),
    }
  }
  return { xValues: chart.xValues, yValues: chart.yValues }
}

function buildMediaMarkers(
  media: DiveLogShareManifestMedia[],
  points: ChartPoint[],
): MediaMarker[] {
  if (points.length === 0) {
    return []
  }
  const minTime = points[0].x
  const maxTime = points[points.length - 1].x
  const markers: MediaMarker[] = []
  media.forEach((item, mediaIndex) => {
    const offset = item.captureOffsetSeconds
    if (offset === null || offset < minTime || offset > maxTime) {
      return
    }
    markers.push({ mediaIndex, offsetSeconds: offset })
  })
  return markers
}

function nearestMediaMarkerByIndex(
  markers: MediaMarker[],
  mediaIndex: number,
): MediaMarker | null {
  if (markers.length === 0) {
    return null
  }
  let best: MediaMarker | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const marker of markers) {
    const distance = Math.abs(marker.mediaIndex - mediaIndex)
    if (distance < bestDistance) {
      bestDistance = distance
      best = marker
    }
  }
  return best
}

function findClosestIndex(points: ChartPoint[], targetX: number): number {
  if (points.length === 0) {
    return 0
  }
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (points[mid].x < targetX) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  if (low === 0) {
    return 0
  }
  const previous = points[low - 1].x
  const current = points[low].x
  return Math.abs(previous - targetX) <= Math.abs(current - targetX) ? low - 1 : low
}

function resolveMarkerLabelLayout(
  canvasX: number,
  canvasY: number,
  label: string,
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(88, label.length * 6.2 + 24)
  const height = 24
  const gap = 14
  const outerRadius = 8
  const rightX = canvasX + outerRadius + gap
  const leftX = canvasX - outerRadius - gap - width
  const x =
    rightX + width <= CHART_PLOT_LEFT + CHART_PLOT_WIDTH
      ? rightX
      : Math.max(CHART_PLOT_LEFT, leftX)
  const y = Math.min(
    CHART_PLOT_TOP + CHART_PLOT_HEIGHT - height,
    Math.max(CHART_PLOT_TOP, canvasY - height / 2),
  )
  return { x, y, width, height }
}

/** Matches DiveLogDataGraph plot band: y = 18 + depthRatio * 120. */
const CHART_VIEW_WIDTH = 350
const CHART_VIEW_HEIGHT = 156
const CHART_PLOT_LEFT = 28
const CHART_PLOT_WIDTH = 316
const CHART_PLOT_TOP = 18
const CHART_PLOT_HEIGHT = 120
/**
 * Same defaults as Vico `LineCartesianLayer.PointConnector.cubic()`
 * (curvature = 0.5, Y_MULTIPLIER = 4).
 */
const CUBIC_CURVATURE = 0.5
const CUBIC_Y_MULTIPLIER = 4
/** Mirrors DiveLogDataGraph.lineGradient stops. */
const LINE_GRADIENT_STOPS: Array<{ offset: number; color: string }> = [
  { offset: 0, color: '#EDF6FF' },
  { offset: 0.1127, color: '#198DFA' },
  { offset: 0.5276, color: '#2617BC' },
  { offset: 0.8497, color: '#198DFA' },
  { offset: 1, color: '#ECF6FF' },
]
/** Mirrors DiveLogDataGraph.areaGradient stops and fadedWhite alphas. */
const AREA_GRADIENT_STOPS: Array<{ offset: number; color: string; fadeAlpha: number }> = [
  { offset: 0, color: '#F7FBFF', fadeAlpha: 0 },
  { offset: 0.2131, color: '#BEE0FF', fadeAlpha: 0.25 },
  { offset: 0.4805, color: '#3C9EFB', fadeAlpha: 0.51 },
  { offset: 0.7604, color: '#5D52CE', fadeAlpha: 0.76 },
  { offset: 1, color: '#4538C8', fadeAlpha: 1 },
]

interface CanvasPoint {
  x: number
  y: number
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = parseHexColor(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function lerpHexColor(fromHex: string, toHex: string, progress: number): string {
  const from = parseHexColor(fromHex)
  const to = parseHexColor(toHex)
  const t = Math.min(1, Math.max(0, progress))
  const r = Math.round(from.r + (to.r - from.r) * t)
  const g = Math.round(from.g + (to.g - from.g) * t)
  const b = Math.round(from.b + (to.b - from.b) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } {
  if (color.startsWith('#')) {
    const { r, g, b } = parseHexColor(color)
    return { r, g, b, a: 1 }
  }
  const match = color.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/,
  )
  if (!match) {
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
}

function lerpCssColor(fromColor: string, toColor: string, progress: number): string {
  const from = parseCssColor(fromColor)
  const to = parseCssColor(toColor)
  const t = Math.min(1, Math.max(0, progress))
  const r = Math.round(from.r + (to.r - from.r) * t)
  const g = Math.round(from.g + (to.g - from.g) * t)
  const b = Math.round(from.b + (to.b - from.b) * t)
  const a = from.a + (to.a - from.a) * t
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

function chartX(value: number, maxTime: number): number {
  return CHART_PLOT_LEFT + (value / maxTime) * CHART_PLOT_WIDTH
}

function chartY(value: number, maxDepth: number): number {
  return CHART_PLOT_TOP + (Math.abs(value) / maxDepth) * CHART_PLOT_HEIGHT
}

function toCanvasPoints(
  points: ChartPoint[],
  maxTime: number,
  maxDepth: number,
): CanvasPoint[] {
  return points.map((point) => ({
    x: chartX(point.x, maxTime),
    y: chartY(point.y, maxDepth),
  }))
}

/**
 * Cubic Bézier connector matching Vico CubicPointConnector:
 * xDelta = min(1, 4 * |dy| / plotHeight) * curvature * dx
 * cubicTo(x1 + xDelta, y1, x2 - xDelta, y2, x2, y2)
 */
function cubicLinePath(canvasPoints: CanvasPoint[]): string {
  if (canvasPoints.length === 0) {
    return ''
  }

  const first: CanvasPoint = canvasPoints[0]
  let path: string = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`

  for (let index = 1; index < canvasPoints.length; index += 1) {
    const previous: CanvasPoint = canvasPoints[index - 1]
    const current: CanvasPoint = canvasPoints[index]
    const xDelta: number =
      Math.min(1, (CUBIC_Y_MULTIPLIER * Math.abs(current.y - previous.y)) / CHART_PLOT_HEIGHT) *
      CUBIC_CURVATURE *
      (current.x - previous.x)
    path +=
      ` C${(previous.x + xDelta).toFixed(2)} ${previous.y.toFixed(2)}` +
      ` ${(current.x - xDelta).toFixed(2)} ${current.y.toFixed(2)}` +
      ` ${current.x.toFixed(2)} ${current.y.toFixed(2)}`
  }

  return path
}

function linePath(points: ChartPoint[], maxTime: number, maxDepth: number): string {
  return cubicLinePath(toCanvasPoints(points, maxTime, maxDepth))
}

function areaPath(points: ChartPoint[], maxTime: number, maxDepth: number): string {
  const canvasPoints: CanvasPoint[] = toCanvasPoints(points, maxTime, maxDepth)
  const line: string = cubicLinePath(canvasPoints)
  const first: CanvasPoint = canvasPoints[0]
  const last: CanvasPoint = canvasPoints[canvasPoints.length - 1]
  return `${line} L${last.x.toFixed(2)} ${CHART_PLOT_TOP} L${first.x.toFixed(2)} ${CHART_PLOT_TOP} Z`
}

function axisDepthLabels(maxDepth: number): string[] {
  const step = Math.max(1, Math.ceil(maxDepth / 4))
  return ['0', `${step}m`, `${step * 2}m`, `${step * 3}m`, `${step * 4}m`]
}

function axisTimeLabels(maxTimeSeconds: number): string[] {
  const step = Math.max(1, Math.round(maxTimeSeconds / 4))
  return [0, step, step * 2, step * 3, Math.round(maxTimeSeconds)].map(formatTimeLabel)
}

function formatTimeLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function recordNumberLabel(diveLog: DiveLogShareManifestDiveLog): string {
  const index = diveLog.diveDisplayIndex
  if (index <= 0) {
    return ''
  }
  if (diveLog.isFreeDiving && diveLog.freeTripNumber > 0) {
    return `${index}-${diveLog.freeTripNumber}`
  }
  return `${index}`
}

function listTitle(
  diveLog: DiveLogShareManifestDiveLog,
  copy: ShareCopy = SHARE_COPY.en,
): string {
  return formatShareListTitle(
    {
      isSurfaceTime: diveLog.isSurfaceTime,
      isFreeDiving: diveLog.isFreeDiving,
      recordLabel: recordNumberLabel(diveLog),
      tabTitle: diveLog.tabTitle,
    },
    copy,
  )
}

function detailTitle(diveLog: DiveLogShareManifestDiveLog, copy: ShareCopy): string {
  return formatShareDetailTitle(
    {
      isSurfaceTime: isSurfaceTimeLog(diveLog),
      isFreeDiving: diveLog.isFreeDiving,
      recordLabel: recordNumberLabel(diveLog),
      tabTitle: diveLog.tabTitle,
    },
    copy,
  )
}

function surfaceTimeTitle(diveLog: DiveLogShareManifestDiveLog, copy: ShareCopy): string {
  return formatSurfaceTimeTitle(diveLog.tabTitle, copy)
}

function isSurfaceTimeLog(diveLog: DiveLogShareManifestDiveLog): boolean {
  if (diveLog.isSurfaceTime) {
    return true
  }
  const tabTitle = normalizeShareTitle(diveLog.tabTitle)
  if (tabTitle === 'surface time' || /^surface time \d+$/.test(tabTitle)) {
    return true
  }
  const displayTitle = normalizeShareTitle(listTitle(diveLog))
  if (displayTitle === 'surface time' || /^surface time \d+$/.test(displayTitle)) {
    return true
  }
  return hasSurfaceTimeShareFingerprint(diveLog)
}

function normalizeShareTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function hasEmptyShareChart(chart: DiveLogShareManifestChart | null): boolean {
  return chartPoints(chart).length === 0
}

function hasSurfaceTimeShareStats(stats: DiveLogShareManifestStats | null): boolean {
  if (!stats) {
    return true
  }
  const gasType = stats.gasType.trim()
  return (
    stats.maxDepth <= 0 &&
    stats.diveTime <= 0 &&
    stats.bottomTemp <= 0 &&
    stats.surfaceTemp <= 0 &&
    (gasType === '' || gasType === '—' || gasType === '-' || gasType === '–')
  )
}

function hasSurfaceTimeShareFingerprint(diveLog: DiveLogShareManifestDiveLog): boolean {
  if (!hasEmptyShareChart(diveLog.chart) || !hasSurfaceTimeShareStats(diveLog.stats)) {
    return false
  }
  const combined = `${diveLog.tabTitle} ${listTitle(diveLog)}`.toLowerCase()
  return combined.includes('surface')
}

function inferIsSurfaceTime(diveLog: Record<string, unknown>): boolean {
  const tabTitle = normalizeShareTitle(readString(diveLog.tabTitle, ''))
  return tabTitle === 'surface time' || /^surface time \d+$/.test(tabTitle)
}

function listLocationParts(
  locationText: string,
  unknownLabel: string,
): [string] | [string, string] {
  const normalized = locationText.replace(/\s+\|\s+/g, ', ')
  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return [parts[parts.length - 2], parts[parts.length - 1]]
  }
  if (parts.length === 1) {
    return [parts[0]]
  }
  return [unknownLabel]
}

function ListLocation({ locationText }: { locationText: string }) {
  const copy = useShareCopy()
  const parts = listLocationParts(locationText, copy.locationUnknown)
  return (
    <span className="item-location">
      <span>{parts[0]}</span>
      {parts[1] ? (
        <>
          <span className="item-location-divider" aria-hidden="true" />
          <span>{parts[1]}</span>
        </>
      ) : null}
    </span>
  )
}

function fallbackText(value: string, fallback: string): string {
  return value.trim() || fallback
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && value > 0 ? Math.round(value).toString() : '—'
}

function parseGasTypeParts(
  value: string | undefined,
): { leading: string; numeric: string; trailing: string } | null {
  const raw = value?.trim() ?? ''
  if (!raw || raw === '—') {
    return null
  }

  const compact = raw.replace(/\s+/g, ' ')
  const airMatch = /^(?:ean|air)\s*21(?:\s*[([].*[)\]])?$/i.exec(compact)
  if (airMatch) {
    return { leading: 'EAN', numeric: '21', trailing: '[Air]' }
  }

  const match = /^([^\d]*)(\d+)(.*)$/.exec(compact)
  if (!match) {
    return { leading: '', numeric: compact, trailing: '' }
  }

  let leading = match[1].trim()
  if (/^air$/i.test(leading) || leading === '') {
    leading = 'EAN'
  }
  const numeric = match[2]
  let trailing = match[3].trim().replace(/^\((.*)\)$/, '[$1]')
  if (numeric === '21' && trailing === '') {
    trailing = '[Air]'
  }
  return { leading, numeric, trailing }
}

export default App
