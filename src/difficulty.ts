import type { Chess } from 'chess.js';

export const LEVELS = [
  { zh: '第一步', en: 'First steps', bestChance: 0, depth: 1 },
  { zh: '小小新手', en: 'Beginner', bestChance: 0.15, depth: 2 },
  { zh: '慢慢进步', en: 'Learner', bestChance: 0.35, depth: 3 },
  { zh: '认真思考', en: 'Thinker', bestChance: 0.6, depth: 5 },
  { zh: '小小挑战', en: 'Challenger', bestChance: 0.85, depth: 8 },
  { zh: '高手练习', en: 'Expert', bestChance: 1, depth: 12 },
] as const;

export function randomMove(chess: Chess, random = Math.random): string {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) throw new Error('没有合法走法 / No legal moves');
  const m = moves[Math.floor(random() * moves.length)];
  return m.from + m.to + (m.promotion ?? '');
}

export function needsEngine(level: number, random = Math.random): boolean {
  return random() < LEVELS[level].bestChance;
}
