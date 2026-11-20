import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const repetitions = 20;
const profiles = [
  { name: 'skill-0-depth-1', skill: 0, depth: 1, milliseconds: 50 },
  ...[0, 5, 10, 20].map(skill => ({ name: `skill-${skill}-depth-8`, skill, depth: 8, milliseconds: 200 })),
];
const scenarios = [
  { id: 'opening', moves: ['e4'] },
  { id: 'development', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'Nc3', 'Nf6'] },
  { id: 'free-queen', moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Nc6'], objective: 'capture-queen' },
  { id: 'mate-in-one', moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'], objective: 'mate' },
  { id: 'defend-mate', moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5'], objective: 'avoid-mate' },
  { id: 'recapture', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], objective: 'capture-bishop' },
  { id: 'opening-trap', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4'] },
].map(scenario => {
  const chess = new Chess();
  for (const move of scenario.moves) chess.move(move);
  return { ...scenario, fen: chess.fen() };
});

class Engine {
  constructor(filename) {
    this.child = spawn(process.execPath, [filename], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stderr = '';
    this.child.stderr.on('data', chunk => { this.stderr += chunk; });
    this.reader = createInterface({ input: this.child.stdout });
    this.reader.on('line', line => this.pending?.line(line.trim()));
    this.child.on('error', error => { this.error = error; this.pending?.reject(error); });
    this.child.on('exit', (code, signal) => {
      this.error = new Error(`Engine exited (${code ?? signal}): ${this.stderr}`);
      this.pending?.reject(this.error);
    });
  }

  exchange(commands, done) {
    if (this.error) return Promise.reject(this.error);
    if (this.pending) throw new Error('Overlapping UCI requests');
    return new Promise((resolve, reject) => {
      const lines = [];
      const finish = (error) => {
        clearTimeout(timer);
        this.pending = null;
        if (error) reject(error);
        else resolve(lines);
      };
      const timer = setTimeout(() => finish(new Error(`UCI timeout: ${commands.join('; ')}`)), 20000);
      this.pending = {
        reject: finish,
        line: line => { lines.push(line); if (done(line)) finish(); },
      };
      this.child.stdin.write(commands.join('\n') + '\n');
    });
  }

  async init() {
    const lines = await this.exchange(['uci'], line => line === 'uciok');
    for (const option of [
      'option name Skill Level type spin default 20 min 0 max 20',
      'option name UCI_LimitStrength type check default false',
    ]) {
      if (!lines.includes(option)) throw new Error(`Unexpected engine option: ${option}`);
    }
    await this.exchange(['setoption name Hash value 16', 'isready'], line => line === 'readyok');
    return lines.filter(line => line.startsWith('id ') || /option name (Skill Level|UCI_)/.test(line));
  }

  async search(fen, { skill, depth, milliseconds, count = 1 }) {
    await this.exchange([
      'ucinewgame',
      'setoption name UCI_LimitStrength value false',
      `setoption name Skill Level value ${skill}`,
      `setoption name MultiPV value ${count}`,
      'isready',
    ], line => line === 'readyok');
    const started = performance.now();
    const lines = await this.exchange([
      `position fen ${fen}`, `go depth ${depth} movetime ${milliseconds}`,
    ], line => line.startsWith('bestmove '));
    const elapsed = performance.now() - started;
    const move = lines.at(-1).split(/\s+/)[1];
    new Chess(fen).move(move);
    const iterations = new Map();
    let lastTop;
    for (const line of lines) {
      const d = line.match(/\bdepth (\d+)/);
      const score = line.match(/\bscore (cp|mate) (-?\d+)/);
      const pv = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/);
      if (!d || !score || !pv || /\b(upperbound|lowerbound)\b/.test(line)) continue;
      const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
      const candidate = { move: pv[1], rank, depth: Number(d[1]), type: score[1], score: Number(score[2]) };
      if (!iterations.has(candidate.depth)) iterations.set(candidate.depth, new Map());
      iterations.get(candidate.depth).set(rank, candidate);
      if (rank === 1 && (!lastTop || candidate.depth >= lastTop.depth)) lastTop = candidate;
    }
    if (!lastTop) throw new Error('No exact PV output');
    const complete = [...iterations.entries()].sort((a, b) => b[0] - a[0])
      .find(([, candidates]) => candidates.size === count && new Set([...candidates.values()].map(c => c.move)).size === count);
    return { move, elapsed, lastTop, complete: complete ? [...complete[1].values()] : [] };
  }

  async close() {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const exited = new Promise(resolve => this.child.once('exit', resolve));
      this.child.kill();
      await exited;
    }
    this.reader.close();
  }
}

function meetsObjective(scenario, uci) {
  if (!scenario.objective) return null;
  const chess = new Chess(scenario.fen);
  const move = chess.move(uci);
  if (scenario.objective === 'capture-queen') return move.captured === 'q';
  if (scenario.objective === 'capture-bishop') return move.captured === 'b';
  if (scenario.objective === 'mate') return chess.isCheckmate();
  return !chess.moves({ verbose: true }).some(reply => {
    const next = new Chess(chess.fen());
    next.move(reply);
    return next.isCheckmate();
  });
}

const temp = await mkdtemp(path.join(tmpdir(), 'chess-skill-'));
let engine;
try {
  // Keep the shipped bytes unchanged; .cjs lets Node run the browser bundle's CLI.
  const filename = path.join(temp, 'stockfish-19-lite-single.cjs');
  await copyFile(path.join(root, 'public/engine/stockfish-19-lite-single.js'), filename);
  await copyFile(path.join(root, 'public/engine/stockfish-19-lite-single.wasm'), path.join(temp, 'stockfish-19-lite-single.wasm'));
  engine = new Engine(filename);
  const started = performance.now();
  const options = await engine.init();
  const report = { date: new Date().toISOString(), node: process.version, options, repetitions, profiles, scenarios: [], summary: [] };
  console.log(options.join('\n'));
  for (const scenario of scenarios) {
    const legal = new Chess(scenario.fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
    const reference = await engine.search(scenario.fen, { skill: 20, depth: 10, milliseconds: 1500, count: legal.length });
    if (reference.complete.length !== legal.length) throw new Error(`Incomplete reference: ${scenario.id}`);
    const scores = new Map(reference.complete.map(c => [c.move, c]));
    const top = reference.complete.find(c => c.rank === 1);
    const randomSuccess = scenario.objective ? legal.filter(move => meetsObjective(scenario, move)).length / legal.length : null;
    const entry = { ...scenario, referenceDepth: top.depth, reference: reference.complete, randomSuccess, profiles: [] };
    for (const profile of profiles) {
      const samples = [];
      for (let i = 0; i < repetitions; i++) {
        const result = await engine.search(scenario.fen, profile);
        const score = scores.get(result.move);
        if (!score) throw new Error(`Missing reference score: ${scenario.id} ${result.move}`);
        samples.push({
          move: result.move, san: new Chess(scenario.fen).move(result.move).san,
          milliseconds: Math.round(result.elapsed), depth: result.lastTop.depth,
          pvMove: result.lastTop.move, objective: meetsObjective(scenario, result.move),
          cpLoss: top.type === 'cp' && score.type === 'cp' ? Math.max(0, top.score - score.score) : null,
        });
      }
      const counts = new Map();
      for (const sample of samples) counts.set(sample.san, (counts.get(sample.san) ?? 0) + 1);
      const cpSamples = samples.filter(s => s.cpLoss !== null);
      const summary = {
        scenario: scenario.id, profile: profile.name,
        objective: scenario.objective ? samples.filter(s => s.objective).length : null,
        randomSuccess, distinct: counts.size,
        moves: [...counts].sort((a, b) => b[1] - a[1]).map(([san, n]) => `${san}:${n}`).join(' '),
        pvMismatch: samples.filter(s => s.move !== s.pvMove).length,
        meanCpLoss: cpSamples.length ? Math.round(cpSamples.reduce((n, s) => n + s.cpLoss, 0) / cpSamples.length) : null,
        cpSamples: cpSamples.length,
        meanMs: Math.round(samples.reduce((n, s) => n + s.milliseconds, 0) / samples.length),
        maxMs: Math.max(...samples.map(s => s.milliseconds)),
      };
      entry.profiles.push({ ...profile, samples });
      report.summary.push(summary);
      console.log(JSON.stringify(summary));
    }
    report.scenarios.push(entry);
  }
  report.elapsedSeconds = Math.round((performance.now() - started) / 1000);
  const output = path.join(root, 'artifacts/engine-strength-validation.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output} (${report.elapsedSeconds}s)`);
} finally {
  await engine?.close();
  await rm(temp, { recursive: true, force: true });
}
