import { describe, expect, it, vi, afterEach } from 'vitest';
import { Chess } from 'chess.js';
import { analyze, chooseMove, legalCandidates, parseInfo, type Candidate } from '../../src/engine';
import { LEVELS } from '../../src/difficulty';

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
  it('has six increasing native skill and search budgets, not fake Elo', () => {
    expect(LEVELS).toHaveLength(6);
    expect(LEVELS[0]).toMatchObject({ skill: 0, depth: 1, milliseconds: 50 });
    expect(LEVELS.at(-1)?.skill).toBe(20);
    for (const [index, level] of LEVELS.entries()) {
      expect(Number.isInteger(level.skill)).toBe(true);
      expect(level.skill).toBeGreaterThanOrEqual(0);
      expect(level.skill).toBeLessThanOrEqual(20);
      if (index) for (const key of ['skill', 'depth', 'milliseconds'] as const) expect(level[key]).toBeGreaterThan(LEVELS[index - 1][key]);
    }
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
    expect(w.postMessage).toHaveBeenCalledWith('setoption name UCI_LimitStrength value false');
    expect(w.postMessage).toHaveBeenCalledWith('setoption name Skill Level value 20');
    expect(w.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3');
    expect(w.postMessage).toHaveBeenCalledWith('go depth 16 movetime 1600');
    for (const [i, uci] of ['e2e4', 'd2d4', 'g1f3'].entries()) w.line(`info depth 5 multipv ${i + 1} score cp ${20 - i} pv ${uci}`);
    w.line('info depth 6 multipv 1 score cp 25 pv b1c3');
    w.line('bestmove b1c3');
    expect((await promise).map(c => c.uci)).toEqual(['e2e4', 'd2d4', 'g1f3']);
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it.each(LEVELS)('uses native skill $skill and the final bestmove instead of PV rank one', async level => {
    vi.stubGlobal('Worker', FakeWorker);
    const promise = chooseMove(new Chess().fen(), { ...level, signal: new AbortController().signal });
    const w = FakeWorker.last;
    w.line('uciok'); w.line('readyok');
    expect(w.postMessage).toHaveBeenCalledWith('setoption name UCI_LimitStrength value false');
    expect(w.postMessage).toHaveBeenCalledWith(`setoption name Skill Level value ${level.skill}`);
    expect(w.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 1');
    expect(w.postMessage).toHaveBeenCalledWith(`go depth ${level.depth} movetime ${level.milliseconds}`);
    w.line('info depth 5 multipv 1 score cp 30 pv e2e4');
    w.line('bestmove d2d4 ponder d7d5');
    await expect(promise).resolves.toBe('d2d4');
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it('accepts a legal underpromotion without requiring analysis info', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const promise = chooseMove('7k/P7/8/8/8/8/8/7K w - - 0 1', { ...LEVELS[0], signal: new AbortController().signal });
    FakeWorker.last.line('bestmove a7a8n');
    await expect(promise).resolves.toBe('a7a8n');
  });
  it.each(['(none)', '0000', 'a1a8', 'e2e4q', 'invalid'])('rejects bestmove %s without falling back to a PV or random move', async move => {
    vi.stubGlobal('Worker', FakeWorker);
    const promise = chooseMove(new Chess().fen(), { ...LEVELS[0], signal: new AbortController().signal });
    FakeWorker.last.line('info depth 1 score cp 20 pv e2e4');
    FakeWorker.last.line(`bestmove ${move}`);
    await expect(promise).rejects.toThrow('No legal engine move');
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it('rejects an already cancelled move without starting a worker', async () => {
    vi.stubGlobal('Worker', vi.fn());
    const controller = new AbortController();
    controller.abort();
    await expect(chooseMove(new Chess().fen(), { ...LEVELS[0], signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(Worker).not.toHaveBeenCalled();
  });
  it('cancels an in-flight native move and terminates its worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const promise = chooseMove(new Chess().fen(), { ...LEVELS[0], signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it.each(['load', 'timeout', 'message'])('reports native move %s failures', async kind => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const promise = chooseMove(new Chess().fen(), { ...LEVELS[0], signal: new AbortController().signal });
    const assertion = expect(promise).rejects.toThrow(kind === 'load' ? 'Engine failed' : kind === 'timeout' ? 'Engine timed out' : 'Invalid engine message');
    if (kind === 'load') FakeWorker.last.onerror?.();
    else if (kind === 'message') FakeWorker.last.onmessageerror?.();
    else await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
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
