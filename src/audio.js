export class Sound {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
    this.noiseBuffer = null
    this.ambientTimer = 5 + Math.random() * 8
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    try {
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.55
      this.master.connect(this.ctx.destination)
      const length = Math.floor(this.ctx.sampleRate * 1.2)
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    } catch {
      this.ctx = null
    }
  }

  setEnabled(value) {
    this.enabled = value
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0.55 : 0, this.ctx.currentTime, 0.05)
    }
  }

  noise(duration, frequency, gain, type = 'lowpass', q = 0.8) {
    if (!this.ctx || !this.enabled) return
    const now = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    src.connect(filter).connect(env).connect(this.master)
    src.start(now)
    src.stop(now + duration + 0.02)
  }

  tone(freq, duration, gain, type = 'sine', endFreq = null) {
    if (!this.ctx || !this.enabled) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration)
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(env).connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  step(kind = 'grass') {
    if (!this.ctx || !this.enabled) return
    const freq = kind === 'water' ? 950 : 380 + Math.random() * 220
    this.noise(0.07, freq, 0.035, 'lowpass')
  }

  breakBlock(id) {
    const hard = id === 3 || id === 10 || id === 12 || id === 21 ? 1 : 0
    this.noise(0.16, hard ? 520 : 900, 0.1, 'bandpass', 1.2)
    this.tone(hard ? 92 : 140, 0.09, 0.05, 'triangle', 58)
  }

  place() {
    this.noise(0.05, 1400, 0.04, 'bandpass', 1.4)
    this.tone(220, 0.06, 0.04, 'square', 150)
  }

  jump() {
    this.tone(210, 0.09, 0.025, 'sine', 320)
  }

  land(intensity) {
    this.noise(0.1, 300, Math.min(0.09, 0.02 + intensity * 0.006), 'lowpass')
  }

  splash() {
    this.noise(0.3, 1200, 0.06, 'lowpass')
  }

  toggleFly(on) {
    this.tone(on ? 420 : 300, 0.14, 0.03, 'sine', on ? 640 : 210)
  }

  update(dt, dayFactor) {
    if (!this.ctx || !this.enabled) return
    this.ambientTimer -= dt
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 7 + Math.random() * 13
      if (dayFactor > 0.45 && Math.random() < 0.7) {
        const base = 1700 + Math.random() * 900
        this.tone(base, 0.11, 0.012, 'sine', base * 1.5)
        window.setTimeout(() => this.tone(base * 1.18, 0.09, 0.009, 'sine', base * 1.45), 130)
      }
    }
  }
}
