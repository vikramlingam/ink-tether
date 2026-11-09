/**
 * Pure programmatic Web Audio API synthesizer for INK-TETHER.
 * 100% procedural, 0 external assets, 0 bytes download.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.7;

  // Continuous pen scratch generator
  private scratchSource: AudioBufferSourceNode | null = null;
  private scratchGain: GainNode | null = null;
  private scratchFilter: BiquadFilterNode | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // Mechanical ratchet timing
  private lastRatchetTime: number = 0;

  constructor() {
    // Lazily initialized on first user interaction
  }

  public init(): void {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.initPinkNoiseBuffer();
      this.startPenScratchNode();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  public resume(): void {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.isMuted && this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Generates a 2-second looped pink noise buffer for authentic nib friction
   */
  private initPinkNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.pinkNoiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  /**
   * Initializes persistent fountain pen scratch sound node
   */
  private startPenScratchNode(): void {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.masterGain) return;
    try {
      this.scratchSource = this.ctx.createBufferSource();
      this.scratchSource.buffer = this.pinkNoiseBuffer;
      this.scratchSource.loop = true;

      // Bandpass filter centered on crisp fountain pen paper tooth (~2800 Hz)
      this.scratchFilter = this.ctx.createBiquadFilter();
      this.scratchFilter.type = 'bandpass';
      this.scratchFilter.frequency.value = 2800;
      this.scratchFilter.Q.value = 1.6;

      this.scratchGain = this.ctx.createGain();
      this.scratchGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.scratchSource.connect(this.scratchFilter);
      this.scratchFilter.connect(this.scratchGain);
      this.scratchGain.connect(this.masterGain);

      this.scratchSource.start(0);
    } catch {
      // safe fallback
    }
  }

  /**
   * Modulates fountain pen scratch intensity based on needle velocity
   */
  public updatePenScratch(speed: number, isDrawing: boolean): void {
    if (!this.ctx || !this.scratchGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (!isDrawing || speed < 20) {
      this.scratchGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    // Scale gain with velocity: gentle whisper at slow speed, audible tooth at high speed
    const normalizedSpeed = Math.min(speed / 900, 1);
    const targetGain = 0.04 + normalizedSpeed * 0.12;
    this.scratchGain.gain.setTargetAtTime(targetGain, now, 0.05);

    if (this.scratchFilter) {
      // Frequency slightly rises with friction speed
      const targetFreq = 2200 + normalizedSpeed * 1400;
      this.scratchFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);
    }
  }

  /**
   * Mechanical ratchet click when orbiting an anchor
   */
  public playTetherRatchet(angularSpeed: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = performance.now();
    // Throttle clicks based on rotational speed (higher speed = faster clicks)
    const intervalMs = Math.max(35, 140 - Math.min(angularSpeed * 15, 105));
    if (now - this.lastRatchetTime < intervalMs) return;
    this.lastRatchetTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // High mechanical click
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400 + Math.random() * 400, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.015);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, t);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.025);
  }

  /**
   * Slingshot Snap: crisp acoustic whip-release sound
   */
  public playSlingshotSnap(speedRatio: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;

    // 1. Transient whip snap (pitch dive)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 850 + Math.min(speedRatio * 450, 900);
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.09);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.11);

    // 2. High frequency noise crackle
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1800, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.07);
  }

  /**
   * Loop Closure Chord: warm resonant pentatonic acoustic chime
   * Scales pitch higher with larger captured territory!
   */
  public playClosureChord(areaRatio: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Pentatonic scale frequencies (C major / A minor pentatonic: C, D, E, G, A)
    const pentatonicScales = [
      [261.63, 329.63, 392.00, 523.25], // C4, E4, G4, C5 (Subtle loop)
      [329.63, 392.00, 523.25, 659.25], // E4, G4, C5, E5 (Medium loop)
      [392.00, 523.25, 659.25, 783.99], // G4, C5, E5, G5 (Large loop)
      [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6 (Epic massive snare)
    ];

    const tier = Math.min(Math.floor(areaRatio * 5), pentatonicScales.length - 1);
    const notes = pentatonicScales[tier];

    notes.forEach((freq, index) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = t + index * 0.055; // Arpeggiated chime entrance

      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      // Sine fundamental + slight triangle warmth for music box/bell chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, noteTime); // 1st harmonic

      noteGain.gain.setValueAtTime(0, noteTime);
      noteGain.gain.linearRampToValueAtTime(0.18 / (index + 1), noteTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0008, noteTime + 1.2 + index * 0.2);

      osc.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc.start(noteTime);
      osc2.start(noteTime);
      osc.stop(noteTime + 1.4 + index * 0.2);
      osc2.stop(noteTime + 1.4 + index * 0.2);
    });
  }

  /**
   * Thread Snap: snappy twang string break on cutting an opponent's wet line
   */
  public playThreadCut(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Dual detuned saw waves snapping and pitching downwards rapidly
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(640, t);
    osc1.frequency.exponentialRampToValueAtTime(70, t + 0.16);

    osc2.frequency.setValueAtTime(655, t); // Detuned for discordant snapped string twang
    osc2.frequency.exponentialRampToValueAtTime(60, t + 0.16);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.16);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.19);
    osc2.stop(t + 0.19);
  }

  /**
   * Delicate tap when bouncing off arena boundary
   */
  public playBoundaryTap(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /**
   * Match countdown warning tick
   */
  public playClockTick(isUrgent: boolean = false): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isUrgent ? 880 : 440, t);

    gain.gain.setValueAtTime(isUrgent ? 0.12 : 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * Final Match Victory / Architectural Fanfare
   */
  public playVictoryFanfare(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = t + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);
      g.gain.setValueAtTime(0.2, noteTime);
      g.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.9);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(noteTime);
      osc.stop(noteTime + 1.0);
    });
  }
}

export const sound = new SoundEngine();

