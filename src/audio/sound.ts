import { getAudioSettings, subscribeAudioSettings } from "./settings";

/**
 * Procedural soundtrack and effects (Web Audio): no audio files to host or license.
 * Browsers only allow audio after a user gesture, so nothing plays until unlock() runs
 * inside a click/keypress handler.
 */

export type MusicMode = "off" | "explore" | "combat" | "boss";

/** A-minor pentatonic "glass" notes for the exploration pings. */
const PINGS = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const DRONE_CUTOFF: Record<MusicMode, number> = { off: 300, explore: 320, combat: 750, boss: 1100 };
const BPM: Record<MusicMode, number> = { off: 0, explore: 0, combat: 96, boss: 118 };

type Wave = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private exploreLayer!: GainNode;
  private combatLayer!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private mode: MusicMode = "off";
  private beat = 0;
  private beatTimer: ReturnType<typeof setInterval> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  private ducked = false;

  constructor() {
    subscribeAudioSettings(() => this.applyLevels());
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        void (document.hidden ? this.ctx.suspend() : this.ctx.resume());
      });
    }
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build();
      this.setMode(this.mode, true);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  // ── Music ──────────────────────────────────────────────────────────────────

  setMode(mode: MusicMode, force = false) {
    if (mode === this.mode && !force) return;
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fighting = mode === "combat" || mode === "boss";
    this.exploreLayer.gain.setTargetAtTime(mode === "explore" ? 1 : fighting ? 0.3 : 0, t, 1.2);
    this.combatLayer.gain.setTargetAtTime(fighting ? 1 : 0, t, 0.6);
    this.droneFilter.frequency.setTargetAtTime(DRONE_CUTOFF[mode], t, 1.5);
    clearInterval(this.beatTimer);
    if (fighting) this.beatTimer = setInterval(() => this.pulse(), 60_000 / BPM[mode] / 2);
    this.applyLevels();
  }

  /** Lower the music while the narrator speaks. */
  duck(on: boolean) {
    this.ducked = on;
    this.applyLevels();
  }

  private applyLevels() {
    if (!this.ctx) return;
    const s = getAudioSettings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.volume, t, 0.05);
    const music = s.music && this.mode !== "off" ? (this.ducked ? 0.3 : 1) * 0.7 : 0;
    this.musicBus.gain.setTargetAtTime(music, t, 0.4);
    this.sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.05);
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = this.gain(0, this.master);
    this.sfxBus = this.gain(0, this.master);
    this.exploreLayer = this.gain(0, this.musicBus);
    this.combatLayer = this.gain(0, this.musicBus);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Shimmering echo for the glass pings.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.38;
    const feedback = this.gain(0.35, this.echo);
    this.echo.connect(feedback);
    this.echo.connect(this.exploreLayer);

    // Drone: two detuned saws through a slowly breathing low-pass filter.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.Q.value = 5;
    this.droneFilter.connect(this.gain(0.08, this.musicBus));
    for (const f of [55, 55.35, 110.2]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(this.droneFilter);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    lfo.connect(this.gain(140, this.droneFilter.frequency));
    lfo.start();

    // Soft pad (A minor) on the exploration layer.
    for (const f of [110, 164.81, 261.63]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(this.gain(0.018, this.exploreLayer));
      o.start();
    }
    this.schedulePing();
  }

  private schedulePing() {
    this.pingTimer = setTimeout(() => {
      if (this.ctx && this.mode !== "off" && !document.hidden) {
        const note = PINGS[Math.floor(Math.random() * PINGS.length)] * (Math.random() < 0.2 ? 2 : 1);
        const t = this.ctx.currentTime;
        const g = this.envelope(t, 0.05, 0.01, 2.6);
        this.osc("sine", note, t, 2.8, g);
        g.connect(this.exploreLayer);
        g.connect(this.echo);
      }
      this.schedulePing();
    }, 2500 + Math.random() * 4000);
  }

  private pulse() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    this.beat++;
    if (this.beat % 2 === 0) {
      // Kick
      const g = this.envelope(t, 0.35, 0.005, 0.22, this.combatLayer);
      this.osc("sine", 110, t, 0.25, g, 42);
      if (this.beat % 8 === 0) {
        const bass = this.envelope(t, 0.06, 0.02, 0.5, this.lowpass(420, this.combatLayer));
        this.osc("sawtooth", this.beat % 16 === 0 ? 55 : 43.65, t, 0.55, bass);
      }
    } else {
      // Off-beat hat
      this.noiseBurst(t, 0.05, "highpass", 6500, 0.05, this.combatLayer);
    }
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  private get sfxOn(): boolean {
    return this.ctx !== null && getAudioSettings().sfx;
  }

  dice() {
    if (!this.sfxOn) return;
    const t = this.ctx!.currentTime;
    [0, 0.05, 0.11, 0.18, 0.27, 0.38].forEach((d) => this.noiseBurst(t + d, 0.025, "bandpass", 2500 + Math.random() * 1200, 0.22, this.sfxBus, 6));
    this.noiseBurst(t + 0.52, 0.04, "bandpass", 1700, 0.3, this.sfxBus, 4);
  }

  hit(critical = false) {
    if (!this.sfxOn) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 150, t, 0.2, this.envelope(t, 0.5, 0.003, 0.18, this.sfxBus), 50);
    this.noiseBurst(t, 0.08, "lowpass", 1400, 0.3, this.sfxBus);
    if (critical) {
      for (const f of [1318.5, 1975.5]) this.osc("sine", f, t + 0.03, 0.8, this.envelope(t + 0.03, 0.1, 0.005, 0.7, this.sfxBus));
    }
  }

  miss() {
    if (!this.sfxOn) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
    src.connect(filter).connect(this.envelope(t, 0.16, 0.03, 0.25, this.sfxBus));
    src.start(t);
    src.stop(t + 0.3);
  }

  hurt() {
    if (!this.sfxOn) return;
    const t = this.ctx!.currentTime;
    this.osc("sawtooth", 220, t, 0.28, this.envelope(t, 0.16, 0.005, 0.25, this.lowpass(900, this.sfxBus)), 80);
    this.noiseBurst(t, 0.12, "lowpass", 600, 0.28, this.sfxBus);
  }

  success() {
    this.notes([523.25, 659.25, 783.99], 0.08, "triangle", 0.13, 0.45);
  }

  failure() {
    this.notes([329.63, 311.13], 0.12, "triangle", 0.13, 0.5);
  }

  reward() {
    this.notes([659.25, 987.77], 0.1, "sine", 0.11, 0.7);
  }

  levelUp() {
    this.notes([440, 554.37, 659.25, 880, 1108.73], 0.08, "triangle", 0.13, 0.6);
  }

  victory() {
    this.notes([392, 493.88, 587.33, 783.99, 987.77, 1174.66], 0.12, "triangle", 0.13, 1.2);
  }

  encounter() {
    if (!this.sfxOn) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(150, t);
    filter.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    filter.connect(this.envelope(t, 0.25, 0.02, 0.9, this.sfxBus));
    for (const f of [55, 82.41, 116.54]) this.osc("sawtooth", f, t, 1, filter);
    this.osc("sine", 932.33, t + 0.05, 1.3, this.envelope(t + 0.05, 0.06, 0.01, 1.2, this.sfxBus));
  }

  death() {
    if (!this.sfxOn) return;
    const t = this.ctx!.currentTime;
    this.osc("sawtooth", 220, t, 1.6, this.envelope(t, 0.2, 0.02, 1.5, this.lowpass(700, this.sfxBus)), 50);
  }

  // ── Building blocks ────────────────────────────────────────────────────────

  private gain(value: number, dest: AudioNode | AudioParam): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    if (dest instanceof AudioParam) g.connect(dest);
    else g.connect(dest);
    return g;
  }

  private lowpass(freq: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    f.connect(dest);
    return f;
  }

  /** Gain node shaped as a percussive envelope (quick attack, exponential decay). */
  private envelope(t: number, peak: number, attack: number, decay: number, dest?: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    if (dest) g.connect(dest);
    return g;
  }

  private osc(type: Wave, freq: number, t: number, dur: number, dest: AudioNode, freqEnd?: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, freq: number, peak: number, dest: AudioNode, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter).connect(this.envelope(t, peak, 0.002, dur, dest));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private notes(freqs: number[], step: number, type: Wave, peak: number, decay: number) {
    if (!this.sfxOn) return;
    const t = this.ctx!.currentTime;
    freqs.forEach((f, i) => this.osc(type, f, t + i * step, decay + 0.1, this.envelope(t + i * step, peak, 0.01, decay, this.sfxBus)));
  }
}

export const sound = new SoundEngine();
