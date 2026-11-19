import { describe, expect, it, vi, afterEach } from 'vitest';
import { Chess } from 'chess.js';
import { analyze, legalCandidates, parseInfo, type Candidate } from '../../src/engine';
import { LEVELS, needsEngine, randomMove } from '../../src/difficulty';

describe('UCI parser', () => {
  it('reads centipawns, MultiPV, and promotion', () => {
    expect(parseInfo('info depth 12 seldepth 15 multipv 2 score cp -48 nodes 100 pv a7a8n h8g7'))
      .toEqual({ rank: 2, depth: 12, score: -48, mate: false, uci: 'a7a8n' });
  });
  it('reads mate scores and default rank', () => {
    expect(parseInfo('info depth 9 score mate 2 pv e2e4')).toMatchObject({ rank: 1, mate: true, score: 2 });
  });
  it.each(['bestmove e2e4', 'info depth 4 nodes 10', 'info depth 5 score cp 10 lowerbound pv e2e4', 'info depth 1 score cp 0 pv (none)'])('rejects incomplete lines: %s', line => {
    expect(parseInfo(line)).toBeNull();
  });
  it('sorts ranks and removes duplicate or illegal candidates', () => {
    const c = (uci: string, rank: number): Candidate => ({ uci, rank, score: 0, depth: 4, mate: false });
    expect(legalCandidates(new Chess().fen(), [c('d2d4', 2), c('e2e4', 1), c('e2e4', 3), c('a1a8', 3)]).map(c => c.uci)).toEqual(['e2e4', 'd2d4']);
  });
});

describe('difficulty', () => {
  it('has six increasing chances to play the best move, not fake Elo', () => {
    expect(LEVELS).toHaveLength(6);
    expect(LEVELS.map(l => l.bestChance)).toEqual([0, .15, .35, .6, .85, 1]);
  });
  it('the weakest level never needs the engine, the highest always does', () => {
    expect(needsEngine(0, () => 0)).toBe(false);
    expect(needsEngine(5, () => .9999)).toBe(true);
  });
  it.each(LEVELS.map((_, i) => i))('returns legal moves at level %s', () => {
    const chess = new Chess();
    for (const random of [0, .2, .99]) expect(() => new Chess().move(randomMove(chess, () => random))).not.toThrow();
  });
  it('fails clearly on positions without legal moves', () => {
    expect(() => randomMove(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'))).toThrow('No legal moves');
  });
});

describe('worker lifecycle', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  class FakeWorker {
    static last: FakeWorker;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() { FakeWorker.last = this; }
    line(data: string) { this.onmessage?.({ data }); }
  }
  it('waits for UCI readiness and uses the deepest complete MultiPV iteration', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const promise = analyze(new Chess().fen(), { signal: new AbortController().signal });
    const w = FakeWorker.last;
    w.line('uciok'); w.line('readyok');
    expect(w.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3');
    for (const [i, uci] of ['e2e4', 'd2d4', 'g1f3'].entries()) w.line(`info depth 5 multipv ${i + 1} score cp ${20 - i} pv ${uci}`);
    w.line('info depth 6 multipv 1 score cp 25 pv b1c3');
    w.line('bestmove b1c3');
    expect((await promise).map(c => c.uci)).toEqual(['e2e4', 'd2d4', 'g1f3']);
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it('terminates the worker on cancellation', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const promise = analyze(new Chess().fen(), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it('reports a loading error instead of supplying fabricated hints', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const promise = analyze(new Chess().fen(), { signal: new AbortController().signal });
    FakeWorker.last.onerror?.();
    await expect(promise).rejects.toThrow('Engine failed');
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it('reports an engine timeout', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker);
    const promise = analyze(new Chess().fen(), { signal: new AbortController().signal });
    const assertion = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
});
