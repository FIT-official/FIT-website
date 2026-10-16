import { describe, expect, it, vi } from 'vitest'
import { createSoundPlayer } from '../lib/sims/sound'

describe('Synthesised optional sound', () => {
  it('does not construct an audio context until playback is explicitly invoked', async () => {
    const AudioContext = vi.fn(function () {
      return { state: 'running', currentTime: 0, destination: {}, close: vi.fn().mockResolvedValue(), createOscillator: () => ({ type: '', frequency: {}, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }), createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }) }
    })
    const player = createSoundPlayer({ AudioContext })
    expect(AudioContext).not.toHaveBeenCalled()
    expect(await player.play()).toBe(true)
    expect(await player.play(false)).toBe(true)
    expect(AudioContext).toHaveBeenCalledOnce()
    player.close()
    expect(await player.play()).toBe(false)
  })
  it('allows the activity to continue if sound is unsupported or unavailable', async () => {
    expect(await createSoundPlayer({}).play()).toBe(false)
    const AudioContext = function () { throw new Error('unavailable') }
    expect(await createSoundPlayer({ AudioContext }).play()).toBe(false)
  })
})
