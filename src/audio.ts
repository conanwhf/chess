export type Sound = 'move' | 'capture' | 'check' | 'end';
export interface AudioSettings { effects: boolean; music: boolean }
export const AUDIO_KEY = 'little-chess.audio';

// Original, quiet pentatonic melody; no downloaded recordings or network assets.
const MELODY = [60, 64, 67, 69, 67, 64, 62, 64, 60, 62, 64, 67, 64, 62, 60, 55];
const CUES: Record<Sound, number[]> = {
  move: [72], capture: [67, 76], check: [79, 74, 79], end: [60, 64, 67, 72],
};

export class GameAudio {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private note = 0;
  private nextNote = 0;
  private settings: AudioSettings = { effects: true, music: true };
  private active = true;

  constructor(private readonly onError: (error: unknown) => void) {}

  unlock() {
    if (!this.active || (!this.settings.effects && !this.settings.music)) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.connect(this.context.destination);
        this.effectsBus.connect(this.context.destination);
      }
      this.context.resume().then(() => this.sync()).catch(this.onError);
    } catch (error) { this.onError(error); }
  }

  configure(settings: AudioSettings, active: boolean) {
    this.settings = settings;
    this.active = active;
    this.sync();
  }

  private tone(midi: number, at: number, duration: number, volume: number, bus: GainNode) {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private sync() {
    const ctx = this.context;
    if (!ctx) return;
    this.musicBus!.gain.value = this.active && this.settings.music ? 1 : 0;
    this.effectsBus!.gain.value = this.active && this.settings.effects ? 1 : 0;
    const music = this.active && this.settings.music && ctx.state === 'running';
    if (!music && this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (music && this.timer === null) {
      this.nextNote = ctx.currentTime + 0.03;
      const schedule = () => {
        while (this.nextNote < ctx.currentTime + 0.3) {
          this.tone(MELODY[this.note++ % MELODY.length], this.nextNote, 1.4, 0.045, this.musicBus!);
          this.nextNote += 0.75;
        }
      };
      schedule();
      this.timer = setInterval(schedule, 100);
    }
    if ((!this.active || (!this.settings.effects && !this.settings.music)) && ctx.state === 'running') {
      ctx.suspend().catch(this.onError);
    }
  }

  play(sound: Sound) {
    if (!this.active || !this.settings.effects || this.context?.state !== 'running') return;
    CUES[sound].forEach((note, i) => this.tone(note, this.context!.currentTime + i * 0.12, 0.22, 0.13, this.effectsBus!));
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.context) { void this.context.close().catch(this.onError); this.context = null; }
  }
}
