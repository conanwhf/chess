export type Sound = 'move' | 'capture' | 'check' | 'end';
export interface AudioSettings { effects: boolean }
export const AUDIO_KEY = 'little-chess.audio';

const CUES: Record<Sound, number[]> = {
  move: [72], capture: [67, 76], check: [79, 74, 79], end: [60, 64, 67, 72],
};

export class GameAudio {
  private context: AudioContext | null = null;
  private effectsBus: GainNode | null = null;
  private settings: AudioSettings = { effects: true };
  private active = true;

  constructor(private readonly onError: (error: unknown) => void) {}

  unlock() {
    if (!this.active || !this.settings.effects) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.effectsBus = this.context.createGain();
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
    this.effectsBus!.gain.value = this.active && this.settings.effects ? 1 : 0;
    if ((!this.active || !this.settings.effects) && ctx.state === 'running') {
      ctx.suspend().catch(this.onError);
    }
  }

  play(sound: Sound) {
    if (!this.active || !this.settings.effects || this.context?.state !== 'running') return;
    CUES[sound].forEach((note, i) => this.tone(note, this.context!.currentTime + i * 0.12, 0.22, 0.13, this.effectsBus!));
  }

  dispose() {
    if (this.context) { void this.context.close().catch(this.onError); this.context = null; }
  }
}
