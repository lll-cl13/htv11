# AI Sentinel

AI-powered movement monitoring system (frontend prototype).

## Project Idea

Develop an AI-powered monitoring system that uses a camera and speaker to:
- Collect movement data from people or the environment.
- Analyze the collected data using AI.
- Detect emergency situations or unusual movement patterns.
- Determine when warnings or alerts are needed.
- Deliver alerts through a speaker using sounds, notifications, or spoken messages.

## Stack
- Frontend: React + TypeScript + Tailwind CSS
- speechService: Web Speech API (speech.js equivalent)
- AI: Simulated in-browser (replicates Python + OpenCV motion detection via canvas frame differencing)
- Backend / DB: Not required — fully self-contained frontend demo. (In real deployment: Express + Supabase + Python OpenCV service)

## Workflow
1. Data Collection — Live camera feed captures frames
2. Data Analysis — JS motion detection + heuristics simulate AI
3. Warning Detection — Rules detect spikes, low activity, high sustained movement
4. Warning Delivery — Auto spoken alerts via speechSynthesis + visual alert log ("Organized Notes")

## Languages & Techniques Used
### Languages
- **TypeScript** — strong typing with interfaces (`Alert`, `MovementData`)
- **JavaScript (ES2022)** — core logic, browser APIs
- **CSS** — Tailwind CSS v4 (utility-first + Vite plugin)

### Core Web Technologies
- React 18 + Hooks (`useState`, `useRef`, `useEffect`)
- Vite (dev server + bundler) + `@vitejs/plugin-react`
- HTML5 `<video>` + `<canvas>` + `ImageData`
- WebRTC: `navigator.mediaDevices.getUserMedia()`
- Web Speech API: `speechSynthesis` + `SpeechSynthesisUtterance`

### Techniques
| Area                    | Technique                                      | Why it matters |
|-------------------------|------------------------------------------------|----------------|
| **Computer Vision**     | Frame differencing (pixel RGB comparison)     | Simulates OpenCV motion detection in browser |
| **Real-time Systems**   | `requestAnimationFrame` loop (~60 fps)        | Smooth, efficient continuous data collection |
| **Signal Processing**   | Exponential smoothing (0.65 new + 0.35 old)   | Reduces noise in raw intensity values |
| **AI / Decision Making**| Rule-based heuristics + thresholds            | Detects spikes, low activity, high sustained movement without ML |
| **Performance**         | `useRef` for mutable state in hot loops       | Avoids stale closures and excessive re-renders |
| **Resilience**          | Graceful fallback to simulated data           | Works even when camera access is denied |
| **Architecture**        | Separation of concerns (`speechService.ts`)   | Clean decoupling of alert delivery |
| **State Management**    | Refs + selective state updates                | High-frequency data vs infrequent UI updates |

## How to run
```bash
npm install
npm run dev
```

- Click **Start Monitoring** to activate camera + AI.
- Move in front of camera to trigger movement detection.
- Use **Simulate Emergency** to test alerts.
- Alerts are spoken out loud and logged as organized notes.
- Adjust sensitivity slider to tune detection.

Keyboard: `S` = start/stop, `E` = emergency, `C` = clear notes.

This is a working, fully frontend implementation that demonstrates the entire flow without external services.
