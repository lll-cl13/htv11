import { useEffect, useRef, useState } from 'react'
import { speak } from './speechService'

interface Alert {
  id: number
  time: string
  type: 'info' | 'warning' | 'emergency'
  message: string
}

interface MovementData {
  intensity: number
  avgIntensity: number
  movementCount: number
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevFrameRef = useRef<ImageData | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastIntensityRef = useRef(0)

  const [isMonitoring, setIsMonitoring] = useState(false)
  const [sensitivity, setSensitivity] = useState(12) // lower = more sensitive
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [movement, setMovement] = useState<MovementData>({ intensity: 0, avgIntensity: 0, movementCount: 0 })
  const [status, setStatus] = useState<'idle' | 'active' | 'alert'>('idle')
  const [lastAnalysis, setLastAnalysis] = useState('System ready. Start monitoring to begin AI analysis.')
  const [isSpeaking, setIsSpeaking] = useState(false)

  const intensityHistory = useRef<number[]>([])
  const lastAlertTime = useRef(0)
  const isMonitoringRef = useRef(false)

  const addAlert = (type: Alert['type'], message: string) => {
    const now = new Date()
    const alert: Alert = {
      id: Date.now(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
    }
    setAlerts(prev => [alert, ...prev].slice(0, 30))

    // Speak the alert
    setIsSpeaking(true)
    speak(message, () => setIsSpeaking(false))

    if (type === 'emergency') setStatus('alert')
    else if (type === 'warning' && status !== 'alert') setStatus('active')
  }

  const clearAlerts = () => {
    setAlerts([])
    setStatus('active')
  }

  // Simple motion detection (simulates OpenCV)
  const detectMotion = (video: HTMLVideoElement) => {
    const canvas = canvasRef.current
    if (!canvas || !video.videoWidth) return 0

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    canvas.width = Math.min(320, video.videoWidth)
    canvas.height = Math.floor(canvas.width * (video.videoHeight / video.videoWidth))

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const curr = ctx.getImageData(0, 0, canvas.width, canvas.height)

    let changedPixels = 0
    const prev = prevFrameRef.current

    if (prev && prev.data.length === curr.data.length) {
      const data = curr.data
      const pData = prev.data
      const len = data.length

      for (let i = 0; i < len; i += 4) {
        const rDiff = Math.abs(data[i] - pData[i])
        const gDiff = Math.abs(data[i + 1] - pData[i + 1])
        const bDiff = Math.abs(data[i + 2] - pData[i + 2])
        if (rDiff + gDiff + bDiff > 60) changedPixels++
      }
    } else {
      // first frame: seed small baseline so we don't stay at 0
      changedPixels = Math.floor((canvas.width * canvas.height) / 180)
    }

    prevFrameRef.current = curr

    const totalPixels = (canvas.width * canvas.height) / 4
    const percent = (changedPixels / totalPixels) * 100
    return Math.min(100, Math.round(percent * 1.6))
  }

  const analyzeWithAI = (currentIntensity: number, history: number[]) => {
    const avg = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0
    const spike = currentIntensity > avg * 2.2 && currentIntensity > 18

    let analysis = ''
    let shouldAlert: { type: Alert['type']; msg: string } | null = null

    if (currentIntensity < 1.5 && avg < 3 && history.length > 40) {
      analysis = 'Low activity detected. Possible prolonged stillness or person out of frame.'
      if (Date.now() - lastAlertTime.current > 18000) {
        shouldAlert = { type: 'warning', msg: 'Low movement detected for extended period.' }
      }
    } else if (spike) {
      analysis = 'Sudden high-intensity movement spike detected. Possible fall or struggle.'
      if (Date.now() - lastAlertTime.current > 6500) {
        shouldAlert = { type: 'emergency', msg: 'Emergency movement pattern detected. Please check immediately.' }
      }
    } else if (currentIntensity > 35 && avg > 22) {
      analysis = 'High sustained activity. Unusual agitation or multiple people detected.'
      if (Date.now() - lastAlertTime.current > 14000) {
        shouldAlert = { type: 'warning', msg: 'High activity levels sustained. Monitoring closely.' }
      }
    } else if (currentIntensity > 6) {
      analysis = 'Normal movement patterns. Activity level within expected range.'
    } else {
      analysis = 'Minor movement detected. System analyzing baseline.'
    }

    if (shouldAlert) {
      lastAlertTime.current = Date.now()
      addAlert(shouldAlert.type, shouldAlert.msg)
    }

    setLastAnalysis(analysis)
    return avg
  }

  const processFrame = () => {
    const video = videoRef.current
    if (!video || !isMonitoringRef.current) return

    const raw = detectMotion(video)
    // smooth it using ref (avoids stale closure)
    const prev = lastIntensityRef.current
    const intensity = Math.round(raw * 0.65 + prev * 0.35)
    lastIntensityRef.current = intensity

    intensityHistory.current.push(intensity)
    if (intensityHistory.current.length > 60) intensityHistory.current.shift()

    const avg = analyzeWithAI(intensity, intensityHistory.current)

    const count = intensityHistory.current.filter(v => v > sensitivity).length

    const newMovement: MovementData = {
      intensity,
      avgIntensity: Math.round(avg),
      movementCount: count,
    }
    setMovement(newMovement)

    // Update status
    if (intensity > 45) {
      setStatus('alert')
    } else if (intensity > 8 || avg > 5) {
      setStatus('active')
    }

    animationRef.current = requestAnimationFrame(processFrame)
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      return true
    } catch (err) {
      addAlert('warning', 'Camera access denied. Using demo mode.')
      // Fallback: simulate with a moving placeholder
      simulateDemo()
      return false
    }
  }

  const simulateDemo = () => {
    // When no camera, generate plausible motion data
    const interval = setInterval(() => {
      if (!isMonitoringRef.current) {
        clearInterval(interval)
        return
      }
      const base = Math.random() * 9 + 1
      const spikeChance = Math.random()
      let intensity = Math.round(base)
      if (spikeChance < 0.08) intensity = Math.round(48 + Math.random() * 30)
      else if (spikeChance < 0.22) intensity = Math.round(22 + Math.random() * 18)

      intensityHistory.current.push(intensity)
      if (intensityHistory.current.length > 60) intensityHistory.current.shift()

      const avg = analyzeWithAI(intensity, intensityHistory.current)
      const count = intensityHistory.current.filter(v => v > sensitivity).length

      setMovement({ intensity, avgIntensity: Math.round(avg), movementCount: count })
      if (intensity > 42) setStatus('alert')
      else if (intensity > 7) setStatus('active')
    }, 420)
  }

  const startMonitoring = async () => {
    if (isMonitoring) return
    intensityHistory.current = []
    prevFrameRef.current = null
    lastIntensityRef.current = 0
    setMovement({ intensity: 0, avgIntensity: 0, movementCount: 0 })
    setStatus('active')
    setLastAnalysis('Collecting movement data... AI analysis active.')

    const cameraOk = await startCamera()
    isMonitoringRef.current = true
    setIsMonitoring(true)

    if (cameraOk) {
      // small delay for video to be ready
      setTimeout(() => {
        // kickstart with a small baseline so UI shows >0 quickly
        lastIntensityRef.current = 2
        animationRef.current = requestAnimationFrame(processFrame)
      }, 280)
    }
    // Demo mode already started inside startCamera if failed
    addAlert('info', 'Monitoring started. Camera and AI analysis active.')
  }

  const stopMonitoring = () => {
    isMonitoringRef.current = false
    setIsMonitoring(false)
    setStatus('idle')
    setLastAnalysis('Monitoring paused.')

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    prevFrameRef.current = null
    lastIntensityRef.current = 0
    intensityHistory.current = []
  }

  const triggerSimulatedEmergency = () => {
    addAlert('emergency', 'Manual emergency triggered. Alert broadcasted.')
    speak('Emergency override activated. All personnel please respond.')
    setStatus('alert')
    setMovement(prev => ({ ...prev, intensity: 82 }))
  }

  // Auto-clear alert status after some time
  useEffect(() => {
    if (status === 'alert') {
      const t = setTimeout(() => {
        if (isMonitoring) setStatus('active')
      }, 6500)
      return () => clearTimeout(t)
    }
  }, [status, isMonitoring])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's') {
        if (isMonitoring) stopMonitoring()
        else startMonitoring()
      }
      if (e.key.toLowerCase() === 'e' && isMonitoring) triggerSimulatedEmergency()
      if (e.key.toLowerCase() === 'c') clearAlerts()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMonitoring])

  const getStatusColor = () => {
    if (status === 'alert') return 'bg-red-500'
    if (status === 'active') return 'bg-emerald-500'
    return 'bg-zinc-600'
  }

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-[#c5c9d1]">
      <header className="border-b border-[#242a33] bg-[#111318]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-black font-bold text-xl">S</div>
            <div>
              <div className="font-semibold text-2xl tracking-tight">AI Sentinel</div>
              <div className="text-[10px] text-[#8a909c] -mt-1">MOVEMENT MONITORING SYSTEM</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#161a20] border border-[#242a33]">
              <div className={`status-dot ${getStatusColor()} ${status !== 'idle' ? 'animate-pulse' : ''}`} />
              <span className="text-xs uppercase tracking-[1px] text-[#8a909c]">
                {status === 'alert' ? 'EMERGENCY' : status === 'active' ? 'ANALYZING' : 'STANDBY'}
              </span>
            </div>
            <div className="text-xs text-[#8a909c]">Press S to start/stop • E for emergency</div>
          </div>

          <div className="text-xs px-3 py-1 rounded bg-[#161a20] border border-[#242a33] text-[#8a909c]">
            Frontend Demo • React + TS
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CAMERA */}
          <div className="lg:col-span-7">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Live Camera</div>
                  <div className="text-xs text-[#8a909c]">Real-time movement data collection</div>
                </div>
                <div className="text-[10px] uppercase tracking-widest px-2 py-px rounded bg-[#161a20] border border-[#242a33]">
                  {isMonitoring ? 'CAPTURING' : 'OFFLINE'}
                </div>
              </div>

              <div className="video-container aspect-video relative bg-black">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />
                {/* Motion overlay canvas */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full opacity-30 mix-blend-screen pointer-events-none"
                />
                {!isMonitoring && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <div className="text-center">
                      <div className="text-6xl mb-2 opacity-30">📹</div>
                      <p className="text-sm text-[#8a909c]">Camera feed inactive</p>
                    </div>
                  </div>
                )}
                {isMonitoring && status === 'alert' && (
                  <div className="absolute top-3 right-3 px-3 py-1 bg-red-500/90 text-white text-xs font-medium rounded-full flex items-center gap-2">
                    ⚠ HIGH MOVEMENT
                  </div>
                )}
              </div>

              <div className="mt-3 text-[10px] text-[#8a909c] flex items-center gap-2">
                <div>AI processes frames locally • Simulates OpenCV motion detection</div>
              </div>
            </div>
          </div>

          {/* METRICS + CONTROLS */}
          <div className="lg:col-span-5 space-y-6">
            <div className="card p-5">
              <div className="font-semibold mb-4">Real-time Metrics</div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#161a20] border border-[#242a33] rounded-xl p-4">
                  <div className="text-[10px] text-[#8a909c] tracking-widest">CURRENT INTENSITY</div>
                  <div className="metric text-5xl font-semibold tabular-nums mt-1 text-white">{movement.intensity}</div>
                  <div className="text-emerald-400 text-xs">/ 100</div>
                </div>
                <div className="bg-[#161a20] border border-[#242a33] rounded-xl p-4">
                  <div className="text-[10px] text-[#8a909c] tracking-widest">AVERAGE</div>
                  <div className="metric text-5xl font-semibold tabular-nums mt-1 text-white">{movement.avgIntensity}</div>
                  <div className="text-emerald-400 text-xs">last 60 frames</div>
                </div>
                <div className="bg-[#161a20] border border-[#242a33] rounded-xl p-4">
                  <div className="text-[10px] text-[#8a909c] tracking-widest">MOVEMENT EVENTS</div>
                  <div className="metric text-5xl font-semibold tabular-nums mt-1 text-white">{movement.movementCount}</div>
                  <div className="text-emerald-400 text-xs">above threshold</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <div>Sensitivity</div>
                  <div className="text-[#8a909c]">{sensitivity} / 30</div>
                </div>
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={sensitivity}
                  onChange={e => setSensitivity(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="text-[10px] text-[#8a909c] mt-0.5">Lower = more sensitive to small movements</div>
              </div>
            </div>

            <div className="card p-5">
              <div className="font-semibold mb-3">Controls</div>
              <div className="flex flex-wrap gap-3">
                {!isMonitoring ? (
                  <button
                    onClick={startMonitoring}
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition text-black font-semibold"
                  >
                    ▶ Start Monitoring
                  </button>
                ) : (
                  <button
                    onClick={stopMonitoring}
                    className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-[#242a33] transition font-medium"
                  >
                    ■ Stop Monitoring
                  </button>
                )}

                <button
                  onClick={triggerSimulatedEmergency}
                  disabled={!isMonitoring}
                  className="px-5 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-600 disabled:opacity-40 transition text-white font-medium"
                >
                  🚨 Simulate Emergency
                </button>

                <button
                  onClick={clearAlerts}
                  className="px-5 py-2.5 rounded-xl bg-[#161a20] hover:bg-[#1f242e] border border-[#242a33] transition"
                >
                  Clear Notes
                </button>
              </div>
              <div className="text-[10px] text-[#8a909c] mt-3">Camera access required. Falls back to simulated data.</div>
            </div>
          </div>

          {/* AI ANALYSIS */}
          <div className="lg:col-span-5">
            <div className="card p-5 h-full">
              <div className="font-semibold mb-1 flex items-center gap-2">
                AI Analysis
                {isSpeaking && <span className="text-xs px-2 py-px bg-amber-500/20 text-amber-400 rounded">SPEAKING...</span>}
              </div>
              <div className="text-xs text-[#8a909c] mb-3">Python + OpenCV simulation • Pattern extraction in real time</div>

              <div className="bg-[#0a0b0f] border border-[#242a33] rounded-xl p-4 text-sm min-h-[104px]">
                {lastAnalysis}
              </div>

              <div className="mt-4 text-xs text-[#8a909c]">
                Workflow: Camera → Motion Data → AI Insights → Warning Detection → Speaker Output
              </div>
            </div>
          </div>

          {/* ALERTS / ORGANIZED NOTES */}
          <div className="lg:col-span-7">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Organized Notes — Alert Log</div>
                  <div className="text-xs text-[#8a909c]">Detected events, warnings, and spoken alerts</div>
                </div>
                <div className="text-xs px-2.5 py-px rounded bg-[#161a20] border border-[#242a33]">{alerts.length} entries</div>
              </div>

              <div className="alert-log border border-[#242a33] rounded-xl bg-[#0a0b0f] p-1 text-sm">
                {alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[#8a909c]">No alerts yet. Start monitoring to generate movement notes.</div>
                ) : (
                  <div className="divide-y divide-[#242a33]">
                    {alerts.map((a) => (
                      <div key={a.id} className="flex items-start gap-4 px-4 py-3">
                        <div className="font-mono text-xs text-[#8a909c] pt-0.5 w-[68px] shrink-0">{a.time}</div>
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.type === 'emergency' ? 'bg-red-500' : a.type === 'warning' ? 'bg-yellow-500' : 'bg-sky-500'}`} />
                        <div className="flex-1 leading-snug">{a.message}</div>
                        <div className="text-[10px] uppercase tracking-wider text-[#8a909c] pt-0.5">
                          {a.type}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[10px] mt-2 text-[#8a909c]">Speaker delivers alerts using Web Speech API. Notes are stored locally for this session.</div>
            </div>
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-8 text-center text-xs text-[#8a909c]">
          AI Sentinel • Frontend prototype. Camera + JS motion detection + speech synthesis. No backend required.
        </div>
      </main>
    </div>
  )
}
