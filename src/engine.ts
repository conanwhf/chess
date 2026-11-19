import { Chess } from 'chess.js';

export interface Candidate { uci: string; rank: number; depth: number; score: number; mate: boolean }

export function parseInfo(line: string): Candidate | null {
  const depth = line.match(/\bdepth (\d+)/);
  const rank = line.match(/\bmultipv (\d+)/);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/);
  if (!depth || !score || !pv || /\b(upperbound|lowerbound)\b/.test(line)) return null;
  return { uci: pv[1], rank: rank ? Number(rank[1]) : 1, depth: Number(depth[1]), score: Number(score[2]), mate: score[1] === 'mate' };
}

export function legalCandidates(fen: string, candidates: Candidate[]): Candidate[] {
  const chess = new Chess(fen);
  const legal = new Set(chess.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? '')));
  const seen = new Set<string>();
  return candidates.sort((a, b) => a.rank - b.rank).filter(c => {
    if (!legal.has(c.uci) || seen.has(c.uci)) return false;
    seen.add(c.uci);
    return true;
  });
}

export interface SearchOptions { count?: number; depth?: number; milliseconds?: number; signal: AbortSignal }

export function analyze(fen: string, options: SearchOptions): Promise<Candidate[]> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker('/engine/stockfish-19-lite-single.js');
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const lines = new Map<number, Map<number, Candidate>>();
    const cleanup = () => { clearTimeout(timer); options.signal.removeEventListener('abort', abort); worker.terminate(); };
    const fail = (error: Error) => { if (finished) return; finished = true; cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Cancelled', 'AbortError'));
    options.signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => fail(new Error('引擎响应超时，请重试 / Engine timed out. Please retry.')), 20000);
    worker.onerror = () => fail(new Error('引擎无法加载，请更新 Android System WebView / Engine failed. Update Android System WebView.'));
    worker.onmessageerror = () => fail(new Error('引擎消息无效 / Invalid engine message'));
    worker.onmessage = ({ data }) => {
      const line = String(data).trim();
      if (line === 'uciok') {
        worker.postMessage('setoption name Hash value 16');
        worker.postMessage(`setoption name MultiPV value ${options.count ?? 3}`);
        worker.postMessage('isready');
      } else if (line === 'readyok') {
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${options.depth ?? 16} movetime ${options.milliseconds ?? 1600}`);
      } else if (line.startsWith('info ')) {
        const candidate = parseInfo(line);
        if (candidate) {
          if (!lines.has(candidate.depth)) lines.set(candidate.depth, new Map());
          lines.get(candidate.depth)!.set(candidate.rank, candidate);
        }
      } else if (line.startsWith('bestmove ')) {
        const expected = Math.min(options.count ?? 3, new Chess(fen).moves().length);
        const depths = [...lines.keys()].sort((a, b) => b - a);
        const depth = depths.find(d => legalCandidates(fen, [...lines.get(d)!.values()]).length >= expected);
        const candidates = depth === undefined ? [] : legalCandidates(fen, [...lines.get(depth)!.values()]).slice(0, expected);
        if (!candidates.length) { fail(new Error('引擎未返回合法候选，请重试 / No legal analysis. Please retry.')); return; }
        finished = true;
        cleanup();
        resolve(candidates);
      }
    };
    worker.postMessage('uci');
  });
}
