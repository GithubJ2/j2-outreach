import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BALL_SIZE = 56
const HOOP_W = 150
const HOOP_H = 110

// The top-left logo can be dragged. Pull it about a quarter of the way down the
// screen and it turns into a basketball; a hoop appears. Drop the ball through the
// hoop to open the learning hub. Let go anywhere else and it snaps back.
export default function BasketballLogo({ onScore }) {
  const navigate = useNavigate()
  const [drag, setDrag] = useState(null) // {x, y, startX, startY, moved}
  const [hoop, setHoop] = useState(null) // {x, y}
  const [scoring, setScoring] = useState(false)
  const dragRef = useRef(null)

  const isBall = drag && drag.y > window.innerHeight * 0.25
  const overHoop = (x, y) => hoop && x > hoop.x + 20 && x < hoop.x + HOOP_W - 20 && y > hoop.y + 10 && y < hoop.y + 70

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }
    setDrag(dragRef.current)
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const x = e.clientX, y = e.clientY
      const d = dragRef.current
      dragRef.current = { ...d, x, y, moved: d.moved || Math.hypot(x - d.startX, y - d.startY) > 6 }
      setDrag(dragRef.current)
      if (!hoop && y > window.innerHeight * 0.25) {
        const hx = Math.min(window.innerWidth - HOOP_W - 24, Math.max(24, window.innerWidth * 0.6 + (Math.random() * 120 - 60)))
        const hy = Math.min(window.innerHeight - HOOP_H - 24, Math.max(window.innerHeight * 0.35, window.innerHeight * 0.45 + (Math.random() * 120 - 60)))
        setHoop({ x: hx, y: hy })
      }
    }
    const onUp = (e) => {
      const x = e.clientX, y = e.clientY
      const wasBall = y > window.innerHeight * 0.25
      if (wasBall && overHoop(x, y)) {
        setScoring(true)
        setTimeout(() => { setScoring(false); setHoop(null); setDrag(null); onScore() }, 650)
        return
      }
      if (!dragRef.current?.moved) navigate('/')
      setDrag(null)
      setHoop(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, hoop])

  return (
    <>
      <span
        className={`brand-logo${drag ? ' is-lifted' : ''}`}
        onPointerDown={onPointerDown}
        title="Drag me down the page"
        role="button"
        tabIndex={-1}
      >
        <img src="/favicon.svg" alt="" width="22" height="22" draggable="false" />
      </span>

      {drag && (
        <div
          className={`ball${isBall ? ' is-ball' : ''}${scoring ? ' is-scoring' : ''}${overHoop(drag.x, drag.y) ? ' is-over' : ''}`}
          style={{ left: drag.x - (isBall ? BALL_SIZE / 2 : 11), top: drag.y - (isBall ? BALL_SIZE / 2 : 11) }}
          aria-hidden="true"
        >
          {isBall ? <BallSvg /> : <img src="/favicon.svg" alt="" width="22" height="22" draggable="false" />}
        </div>
      )}

      {hoop && (
        <div className={`hoop${drag && overHoop(drag.x, drag.y) ? ' is-ready' : ''}${scoring ? ' is-scored' : ''}`} style={{ left: hoop.x, top: hoop.y }} aria-hidden="true">
          <HoopSvg />
          <span className="hoop-hint">{scoring ? 'Swish!' : 'Drop it in'}</span>
        </div>
      )}
    </>
  )
}

function BallSvg() {
  return (
    <svg viewBox="0 0 64 64" width={BALL_SIZE} height={BALL_SIZE}>
      <circle cx="32" cy="32" r="30" fill="#e0792a" stroke="#8f4414" strokeWidth="2" />
      <path d="M32 2v60M2 32h60M11 11c12 10 30 10 42 0M11 53c12-10 30-10 42 0" fill="none" stroke="#8f4414" strokeWidth="2.5" />
    </svg>
  )
}

function HoopSvg() {
  return (
    <svg viewBox="0 0 150 110" width={HOOP_W} height={HOOP_H}>
      <rect x="55" y="0" width="40" height="46" rx="4" fill="#f3f3ef" stroke="#1c2434" strokeWidth="3" />
      <rect x="66" y="12" width="18" height="18" fill="none" stroke="#1c2434" strokeWidth="2" />
      <ellipse cx="75" cy="48" rx="34" ry="9" fill="none" stroke="#d14b2a" strokeWidth="5" />
      <path d="M44 52 L52 98 M58 54 L62 100 M75 57 L75 102 M92 54 L88 100 M106 52 L98 98 M48 70 H102 M52 86 H98" fill="none" stroke="#9fb0cc" strokeWidth="2" />
    </svg>
  )
}
