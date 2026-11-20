import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../../src/audio';
import { systemLanguage } from '../../src/language';

class FakeContext {
  static last: FakeContext;
  state = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { FakeContext.last = this; }
  createGain() {
    return { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect() { return this; }, disconnect: vi.fn() };
  }
  createOscillator() {
    const oscillator = { type: '', frequency: { value: 0 }, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('offline audio', () => {
  it.each([['move', 1], ['capture', 2], ['check', 3], ['end', 4]] as const)('plays distinct %s cue', async (sound, count) => {
    vi.stubGlobal('AudioContext', FakeContext);
    const player = new GameAudio(vi.fn());
    player.configure({ effects: true, music: false }, true);
    player.unlock();
    await Promise.resolve();
    player.play(sound);
    expect(FakeContext.last.oscillators).toHaveLength(count);
    expect(FakeContext.last.oscillators.every(o => o.start.mock.calls.length === 1)).toBe(true);
    player.dispose();
  });
  it('does not create a context when disabled and stops timers on pause/disposal', async () => {
    vi.useFakeTimers();
    const constructor = vi.fn(function () { return new FakeContext(); });
    vi.stubGlobal('AudioContext', constructor);
    const player = new GameAudio(vi.fn());
    player.configure({ effects: false, music: false }, true);
    player.unlock();
    expect(constructor).not.toHaveBeenCalled();
    player.configure({ effects: true, music: true }, true);
    player.unlock(); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    const count = FakeContext.last.oscillators.length;
    player.configure({ effects: true, music: true }, false);
    player.play('end');
    expect(FakeContext.last.oscillators).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
    expect(FakeContext.last.suspend).toHaveBeenCalledOnce();
    player.dispose();
    expect(FakeContext.last.close).toHaveBeenCalledOnce();
  });
  it('reports audio initialization failure', () => {
    vi.stubGlobal('AudioContext', vi.fn(function () { throw new Error('Audio device unavailable'); }));
    const report = vi.fn();
    new GameAudio(report).unlock();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Audio device unavailable' }));
  });
});

it.each([['zh-CN', 'zh'], ['zh-TW', 'zh'], ['en-US', 'en'], ['fr-FR', 'en']])('maps system locale %s to %s', (locale, expected) => {
  expect(systemLanguage(locale)).toBe(expected);
});
