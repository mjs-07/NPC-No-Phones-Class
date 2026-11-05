import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { STORY_BEATS, updateClassroomTimeline } from './ClassroomTimeline'
import './ClassroomStory.css'

const clamp = (value) => Math.max(0, Math.min(1, value))
const DEMO_SCREEN_WIDTH = 320
const DEMO_SCREEN_HEIGHT = DEMO_SCREEN_WIDTH * (1.22 / 2.2)

function getDisplayTransform(corners) {
  if (!corners || corners.length !== 4) return ''

  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  const dx1 = topRight.x - bottomRight.x
  const dx2 = bottomLeft.x - bottomRight.x
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const dy1 = topRight.y - bottomRight.y
  const dy2 = bottomLeft.y - bottomRight.y
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  const denominator = dx1 * dy2 - dx2 * dy1

  if (Math.abs(denominator) < 0.0001) return ''

  const perspectiveX = (dx3 * dy2 - dx2 * dy3) / denominator
  const perspectiveY = (dx1 * dy3 - dx3 * dy1) / denominator
  const a = topRight.x - topLeft.x + perspectiveX * topRight.x
  const b = bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x
  const d = topRight.y - topLeft.y + perspectiveX * topRight.y
  const e = bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y
  const matrix = [
    a / DEMO_SCREEN_WIDTH,
    d / DEMO_SCREEN_WIDTH,
    0,
    perspectiveX / DEMO_SCREEN_WIDTH,
    b / DEMO_SCREEN_HEIGHT,
    e / DEMO_SCREEN_HEIGHT,
    0,
    perspectiveY / DEMO_SCREEN_HEIGHT,
    0,
    0,
    1,
    0,
    topLeft.x,
    topLeft.y,
    0,
    1,
  ]

  return `matrix3d(${matrix.join(',')})`
}

function SessionDemo({ panelRef }) {
  const [demoClock, setDemoClock] = useState({
    seconds: 15,
    rotation: 1,
    elapsed: 0,
  })
  const [qrImage, setQrImage] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDemoClock((current) => {
        const refresh = current.seconds <= 1
        return {
          seconds: refresh ? 15 : current.seconds - 1,
          rotation: current.rotation + (refresh ? 1 : 0),
          elapsed: current.elapsed + 1,
        }
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true

    QRCode.toDataURL(`NPC-DEMO-SESSION-${demoClock.rotation}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 176,
      color: { dark: '#17211d', light: '#f5f1e7' },
    }).then(
      (image) => {
        if (active) setQrImage(image)
      },
      (error) => {
        console.error('NPC demo QR generation failed:', error)
      }
    )

    return () => {
      active = false
    }
  }, [demoClock.rotation])

  const sampleScans = Math.min(3, Math.floor(demoClock.elapsed / 4))
  const participants = 18 + sampleScans

  return (
    <aside
      className="npc-demo-panel npc-screen-demo"
      ref={panelRef}
      aria-label="Demonstration classroom session shown on the faculty display"
      style={{ visibility: 'hidden' }}
    >
      <div className="npc-demo-heading">
        <div>
          <span className="npc-panel-kicker">FACULTY SESSION</span>
          <strong>Physics: Newton’s Laws of Motion</strong>
        </div>
        <span className="npc-demo-badge">DEMO</span>
      </div>

      <div className="npc-demo-session-state">
        <span className="npc-live-dot" />
        Session started
        <span className="npc-demo-state-label">SAMPLE ONLY</span>
      </div>

      <div className="npc-demo-content">
        <div className="npc-demo-qr">
          {qrImage ? (
            <img src={qrImage} alt={`Demonstration QR code, version ${demoClock.rotation}`} />
          ) : (
            <span className="npc-qr-loading" aria-label="Preparing demonstration QR code" />
          )}
          <span className="npc-demo-qr-beam" aria-hidden="true" />
          <span>DEMO · NOT FOR CHECK-IN</span>
        </div>

        <div className="npc-demo-details">
          <div className="npc-demo-count">
            <strong>{participants}</strong>
            <span>students joined</span>
          </div>
          <div className="npc-demo-divider" />
          <div className="npc-demo-refresh">
            <span>QR refreshes in</span>
            <strong><b>{String(demoClock.seconds).padStart(2, '0')}</b> sec</strong>
          </div>
          <p aria-live="polite">
            {sampleScans
              ? `Sample check-in · ${sampleScans} ${sampleScans === 1 ? 'student' : 'students'} scanned`
              : 'Demo roster · 18 already checked in'}
          </p>
        </div>
      </div>

      <div className="npc-demo-foot">
        <span>Concept preview</span>
        <span>Separate from real class data</span>
      </div>
    </aside>
  )
}

function ReportPreview() {
  return (
    <aside className="npc-report-panel" aria-label="Sample attendance report">
      <div className="npc-report-heading">
        <div>
          <span className="npc-panel-kicker">SESSION REPORT · DEMO</span>
          <strong>Physics: Newton’s Laws of Motion</strong>
        </div>
        <span className="npc-report-export" aria-label="Excel export example">XLSX</span>
      </div>

      <div className="npc-report-table" role="table" aria-label="Sample student attendance">
        <div className="npc-report-row npc-report-header" role="row">
          <span role="columnheader">Roll no.</span>
          <span role="columnheader">Login</span>
          <span role="columnheader">Logout</span>
        </div>
        <div className="npc-report-row" role="row">
          <span role="cell">CS23041</span>
          <span role="cell">09:02</span>
          <span role="cell">10:01</span>
        </div>
        <div className="npc-report-row" role="row">
          <span role="cell">CS23058</span>
          <span role="cell">09:03</span>
          <span role="cell">10:00</span>
        </div>
        <div className="npc-report-row" role="row">
          <span role="cell">CS23072</span>
          <span role="cell">09:04</span>
          <span role="cell">10:01</span>
        </div>
      </div>

      <div className="npc-report-summary">
        <span>Session duration <strong>59 min</strong></span>
        <span>Attendance export <strong>Excel</strong></span>
      </div>
      <p className="npc-demo-disclaimer">Illustrative sample · not a real attendance record</p>
    </aside>
  )
}

export default function ClassroomStory() {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const screenDemoRef = useRef(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const beatIndexRef = useRef(0)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const stage = root?.querySelector('.npc-cinema-pin')

    if (!root || !canvas || !stage) return undefined

    let world
    let disposed = false
    let raf = 0
    let latest = 0
    let lastFrameTime = 0
    let sceneVisible = !('IntersectionObserver' in window)
    let reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )

    const renderFrame = (time = 0) => {
      if (!world) return

      const delta = lastFrameTime
        ? Math.min((time - lastFrameTime) / 1000, 0.05)
        : 0
      lastFrameTime = time

      updateClassroomTimeline(
        world.parts,
        latest,
        world.camera,
        world.lookTarget,
        time / 1000,
        delta,
        reducedMotion
      )
      world.render()

      if (beatIndexRef.current >= 2 && screenDemoRef.current) {
        const bounds = world.getDisplayBounds()
        const demo = screenDemoRef.current
        const transform = getDisplayTransform(bounds.corners)
        demo.style.left = '0px'
        demo.style.top = '0px'
        demo.style.width = `${DEMO_SCREEN_WIDTH}px`
        demo.style.height = `${DEMO_SCREEN_HEIGHT}px`
        demo.style.transform = transform
        demo.style.visibility = transform && bounds.width > 0 && bounds.height > 0
          ? 'visible'
          : 'hidden'
      }
    }

    const updateScroll = () => {
      const scrollDistance = Math.max(
        root.offsetHeight - window.innerHeight,
        1
      )
      latest = clamp(-root.getBoundingClientRect().top / scrollDistance)
      stage.style.setProperty('--npc-story-progress', latest)

      const nextBeat = STORY_BEATS.reduce(
        (index, beat, i) => (latest >= beat.at ? i : index),
        0
      )

      if (nextBeat !== beatIndexRef.current) {
        beatIndexRef.current = nextBeat
        setBeatIndex(nextBeat)
      }

      if (reducedMotion && sceneVisible && !document.hidden) {
        renderFrame()
      }
    }

    const draw = (time) => {
      raf = 0
      if (!world || !sceneVisible || document.hidden || reducedMotion) return

      renderFrame(time)
      raf = window.requestAnimationFrame(draw)
    }

    const syncRendering = () => {
      if (world && sceneVisible && !document.hidden && !reducedMotion && !raf) {
        raf = window.requestAnimationFrame(draw)
      } else if ((!sceneVisible || document.hidden || reducedMotion) && raf) {
        window.cancelAnimationFrame(raf)
        raf = 0
      }
    }

    const resizeScene = () => {
      if (!world) return

      world.resize()
      if (sceneVisible && !document.hidden) renderFrame()
    }
    const resizeObserver = 'ResizeObserver' in window
      ? new ResizeObserver(resizeScene)
      : null

    const intersectionObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => {
          sceneVisible = entry.isIntersecting
          if (sceneVisible) renderFrame()
          syncRendering()
        }, { threshold: 0 })
      : null

    const onVisibilityChange = () => {
      lastFrameTime = 0
      syncRendering()
      if (!document.hidden && sceneVisible) renderFrame()
    }

    const onMotionPreferenceChange = (event) => {
      reducedMotion = event.matches
      lastFrameTime = 0
      syncRendering()
      if (sceneVisible && !document.hidden) renderFrame()
    }

    updateScroll()
    if (resizeObserver) resizeObserver.observe(stage)
    else window.addEventListener('resize', resizeScene)
    intersectionObserver?.observe(stage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    motionPreference.addEventListener('change', onMotionPreferenceChange)
    window.addEventListener('scroll', updateScroll, { passive: true })
    window.addEventListener('resize', updateScroll, { passive: true })

    const initializeScene = async () => {
      try {
        const { createClassroomScene } = await import('./ClassroomScene')
        if (disposed) return

        world = createClassroomScene(canvas)
        world.resize()
        renderFrame()
        syncRendering()
      } catch (error) {
        if (!disposed) {
          console.error('NPC classroom scene initialization failed:', error)
          root.classList.add('npc-cinema-no-webgl')
        }
      }
    }

    initializeScene()

    return () => {
      disposed = true
      window.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
      window.removeEventListener('resize', resizeScene)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      motionPreference.removeEventListener('change', onMotionPreferenceChange)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.cancelAnimationFrame(raf)

      if (!world) return

      const geometries = new Set()
      const materials = new Set()
      const textures = new Set()

      world.scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry)

        if (object.material) {
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material]

          objectMaterials.forEach((material) => {
            materials.add(material)
            Object.values(material).forEach((value) => {
              if (value?.isTexture) textures.add(value)
            })
          })
        }
      })

      textures.forEach((texture) => texture.dispose())
      materials.forEach((material) => material.dispose())
      geometries.forEach((geometry) => geometry.dispose())
      world.renderer.renderLists.dispose()
      world.renderer.dispose()
    }
  }, [])

  const beat = STORY_BEATS[beatIndex]

  const jumpToBeat = (index) => {
    const root = rootRef.current
    if (!root) return

    const scrollDistance = Math.max(
      root.offsetHeight - window.innerHeight,
      1
    )
    const target =
      window.scrollY +
      root.getBoundingClientRect().top +
      STORY_BEATS[index].at * scrollDistance

    window.scrollTo({
      top: target,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }

  const handleChapterKeys = (event, index) => {
    let target = index

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target += 1
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target -= 1
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = STORY_BEATS.length - 1
    else return

    event.preventDefault()
    target = Math.max(0, Math.min(STORY_BEATS.length - 1, target))
    rootRef.current
      ?.querySelector(`[data-chapter-index="${target}"]`)
      ?.focus()
    jumpToBeat(target)
  }

  return (
    <section
      className="npc-cinema"
      ref={rootRef}
      aria-label="NPC: a classroom attention story"
    >
      <div className={`npc-cinema-pin chapter-${beatIndex + 1}`}>
        <canvas
          ref={canvasRef}
          className="npc-cinema-canvas"
          aria-hidden="true"
        />
        <div className="npc-cinema-grade" aria-hidden="true" />
        <div className="npc-cinema-vignette" aria-hidden="true" />

        <nav className="npc-cinema-chapters" aria-label="Story chapters">
          {STORY_BEATS.map((item, index) => (
            <button
              key={item.at}
              type="button"
              data-chapter-index={index}
              aria-label={`Go to chapter ${index + 1}: ${item.label}`}
              aria-current={beatIndex === index ? 'step' : undefined}
              onClick={() => jumpToBeat(index)}
              onKeyDown={(event) => handleChapterKeys(event, index)}
            >
              <span className="npc-chapter-number">0{index + 1}</span>
              <span className="npc-chapter-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div
          className={`npc-cinema-copy beat-${beatIndex + 1}`}
          key={beatIndex}
          aria-live="polite"
        >
          <p className="npc-cinema-eyebrow">{beat.eyebrow}</p>
          <h1>
            {beat.title}
            <br />
            <em>{beat.accent}</em>
          </h1>
          <p className="npc-cinema-body">{beat.body}</p>
          {beatIndex === 4 && (
            <Link className="npc-cinema-cta" to="/login">
              Login <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>

        {beatIndex >= 2 && (
          <SessionDemo panelRef={screenDemoRef} />
        )}
        {beatIndex === 4 && <ReportPreview />}

        <div className="npc-cinema-bottom">
          <span className="npc-cinema-mantra">
            NO PHONES, <i>CLASS.</i>
          </span>
          <div className="npc-cinema-progress" aria-label={`Chapter ${beatIndex + 1} of 5`}>
            <div className="npc-cinema-track" aria-hidden="true">
              <span />
            </div>
            <b>0{beatIndex + 1}<small> / 05</small></b>
          </div>
        </div>

        <div className="npc-cinema-beatline" aria-hidden="true" />
      </div>
    </section>
  )
}
