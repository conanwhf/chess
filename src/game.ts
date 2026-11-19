import { Chess, DEFAULT_POSITION, type Color } from 'chess.js';

export const TIME_CONTROLS = [
  { id: 'none', zh: '不限时', en: 'Untimed', seconds: 0, increment: 0 },
  { id: '5', zh: '5 分钟', en: '5 min', seconds: 300, increment: 0 },
  { id: '10', zh: '10 分钟', en: '10 min', seconds: 600, increment: 0 },
  { id: '15', zh: '15 分钟', en: '15 min', seconds: 900, increment: 0 },
  { id: '10+5', zh: '10 分钟 + 5 秒', en: '10 min + 5 sec', seconds: 600, increment: 5 },
] as const;

export interface Settings {
  mode: 'computer' | 'local';
  player: Color;
  difficulty: number;
  time: typeof TIME_CONTROLS[number]['id'];
  names: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'computer', player: 'w', difficulty: 0, time: 'none', names: true,
};

export interface ClockSnapshot {
  clocks: Record<Color, number>;
  started: boolean;
}

export interface Game {
  settings: Settings;
  initialFen: string;
  moves: string[];
  snapshots: ClockSnapshot[];
  clocks: Record<Color, number>;
  started: boolean;
  paused: boolean;
  clockAt: number | null;
  timeout: Color | null;
}

export interface Result { zh: string; en: string; winner: Color | null }

export function createGame(settings: Settings = DEFAULT_SETTINGS, initialFen = DEFAULT_POSITION): Game {
  const control = TIME_CONTROLS.find(t => t.id === settings.time)!;
  return {
    settings: { ...settings }, initialFen, moves: [], snapshots: [],
    clocks: { w: control.seconds * 1000, b: control.seconds * 1000 },
    started: false, paused: false, clockAt: null, timeout: null,
  };
}

export function position(game: Pick<Game, 'initialFen' | 'moves'>): Chess {
  const chess = new Chess(game.initialFen);
  for (const move of game.moves) chess.move(move);
  return chess;
}

export function result(game: Game, chess = position(game)): Result | null {
  if (game.timeout) {
    const winner = game.timeout === 'w' ? 'b' : 'w';
    const pieces = chess.board().flat().filter(p => p?.color === winner);
    if (pieces.length === 1 || chess.isInsufficientMaterial()) {
      return { zh: '超时和棋', en: 'Draw on time', winner: null };
    }
    return { zh: `${winner === 'w' ? '白' : '黑'}方获胜（对手超时）`, en: `${winner === 'w' ? 'White' : 'Black'} wins on time`, winner };
  }
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    return { zh: `${winner === 'w' ? '白' : '黑'}方将死获胜`, en: `${winner === 'w' ? 'White' : 'Black'} wins by checkmate`, winner };
  }
  if (chess.isStalemate()) return { zh: '无子可走，和棋', en: 'Draw by stalemate', winner: null };
  if (chess.isThreefoldRepetition()) return { zh: '三次重复，和棋', en: 'Draw by repetition', winner: null };
  if (chess.isInsufficientMaterial()) return { zh: '子力不足，和棋', en: 'Draw: insufficient material', winner: null };
  if (chess.isDrawByFiftyMoves()) return { zh: '五十回合，和棋', en: 'Draw: fifty-move rule', winner: null };
  return null;
}

export function tick(game: Game, now: number): Game {
  if (game.paused || game.clockAt === null || game.timeout) return game;
  const side = position(game).turn();
  const remaining = Math.max(0, game.clocks[side] - Math.max(0, now - game.clockAt));
  return { ...game, clocks: { ...game.clocks, [side]: remaining }, clockAt: now, timeout: remaining === 0 ? side : null };
}

export function play(game: Game, uci: string, now: number): Game {
  const current = tick(game, now);
  const chess = position(current);
  if (current.paused || result(current, chess)) return current;
  const side = chess.turn();
  const move = chess.move(uci);
  const control = TIME_CONTROLS.find(t => t.id === current.settings.time)!;
  const clocks = { ...current.clocks, [side]: current.clocks[side] + control.increment * 1000 };
  return {
    ...current, moves: [...current.moves, move.from + move.to + (move.promotion ?? '')],
    snapshots: [...current.snapshots, { clocks: { ...current.clocks }, started: current.started }],
    clocks, started: true, clockAt: control.seconds && !chess.isGameOver() ? now : null,
  };
}

export function pause(game: Game, now: number): Game {
  return { ...tick(game, now), paused: true, clockAt: null };
}

export function resume(game: Game, now: number): Game {
  return { ...game, paused: false, clockAt: game.started && game.settings.time !== 'none' && !result(game) ? now : null };
}

export function undo(game: Game, now: number): Game {
  if (!game.moves.length) return game;
  let count = game.moves.length - 1;
  if (game.settings.mode === 'computer') {
    while (count > 0 && position({ ...game, moves: game.moves.slice(0, count) }).turn() !== game.settings.player) count--;
  }
  const snapshot = game.snapshots[count];
  return {
    ...game, moves: game.moves.slice(0, count), snapshots: game.snapshots.slice(0, count),
    clocks: { ...snapshot.clocks }, started: snapshot.started, timeout: null,
    clockAt: snapshot.started && !game.paused && game.settings.time !== 'none' ? now : null,
  };
}

export function serialize(game: Game): string {
  return JSON.stringify({ version: 1, game: { ...game, paused: game.started || game.paused, clockAt: null } });
}

function isClocks(value: unknown): value is Record<Color, number> {
  return typeof value === 'object' && value !== null && ['w', 'b'].every(key => {
    const n = (value as Record<string, unknown>)[key];
    return typeof n === 'number' && Number.isFinite(n) && n >= 0;
  });
}

export function deserialize(raw: string): Game {
  const data = JSON.parse(raw);
  const g = data?.game;
  const s = g?.settings;
  if (data?.version !== 1 || !s || !['computer', 'local'].includes(s.mode) || !['w', 'b'].includes(s.player)
    || !Number.isInteger(s.difficulty) || s.difficulty < 0 || s.difficulty > 5
    || !TIME_CONTROLS.some(t => t.id === s.time) || typeof s.names !== 'boolean'
    || typeof g.initialFen !== 'string' || !Array.isArray(g.moves) || g.moves.length > 10000
    || !g.moves.every((m: unknown) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
    || !isClocks(g.clocks) || typeof g.started !== 'boolean' || typeof g.paused !== 'boolean'
    || ![null, 'w', 'b'].includes(g.timeout) || !Array.isArray(g.snapshots) || g.snapshots.length !== g.moves.length
    || !g.snapshots.every((f: ClockSnapshot) => f && isClocks(f.clocks) && typeof f.started === 'boolean')) {
    throw new Error('棋局存档格式无效 / Invalid saved game');
  }
  position(g);
  return { ...g, paused: g.started || g.paused, clockAt: null };
}

export function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
