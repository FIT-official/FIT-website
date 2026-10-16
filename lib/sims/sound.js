// Created only after the learner switches sound on. No files, autoplay or network.
export function createSoundPlayer(scope = globalThis) {
  let context
  let disposed = false
  return {
    async play(success = true) {
      if (disposed) return false
      try {
        const AudioContext = scope.AudioContext || scope.webkitAudioContext
        if (!AudioContext) return false
        context ||= new AudioContext()
        if (context.state === 'suspended') await context.resume()
        if (disposed) return false
        const now = context.currentTime
        for (const [index, frequency] of (success ? [523.25, 659.25, 783.99] : [261.63]).entries()) {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          gain.gain.setValueAtTime(0, now + index * 0.075)
          gain.gain.linearRampToValueAtTime(0.055, now + index * 0.075 + 0.012)
          gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.075 + 0.2)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start(now + index * 0.075)
          oscillator.stop(now + index * 0.075 + 0.21)
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        }
        return true
      } catch { return false }
    },
    close() {
      disposed = true
      if (context && context.state !== 'closed') context.close().catch(() => {})
    },
  }
}
