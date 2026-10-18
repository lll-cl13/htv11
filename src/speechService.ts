// speechService.ts
// Uses Web Speech API to deliver spoken alerts and warnings

export function speak(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported')
    onEnd?.()
    return
  }

  // Cancel any ongoing speech to avoid overlap
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.0
  utterance.pitch = 1.05
  utterance.volume = 0.95

  utterance.onend = () => {
    onEnd?.()
  }

  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
