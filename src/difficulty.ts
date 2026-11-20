import type { Chess } from 'chess.js';

export const LEVELS = [
  { id: 'classic-3', zh: '慢慢进步（经典）', en: 'Learner (classic)', engineChance: .35, skill: 20, depth: 3, milliseconds: 900 },
  { id: 'bridge-45', zh: '稳步练习', en: 'Steady practice', engineChance: .45, skill: 20, depth: 4, milliseconds: 900 },
  { id: 'classic-4', zh: '认真思考（经典）', en: 'Thinker (classic)', engineChance: .6, skill: 20, depth: 5, milliseconds: 900 },
  { id: 'bridge-72', zh: '进阶练习', en: 'Growing skills', engineChance: .72, skill: 20, depth: 6, milliseconds: 900 },
  { id: 'native-0', zh: '引擎起步', en: 'Engine starter', engineChance: 1, skill: 0, depth: 1, milliseconds: 50 },
  { id: 'classic-5', zh: '小小挑战（经典）', en: 'Challenger (classic)', engineChance: .85, skill: 20, depth: 8, milliseconds: 900 },
  { id: 'native-3', zh: '引擎初阶', en: 'Engine beginner', engineChance: 1, skill: 3, depth: 3, milliseconds: 100 },
  { id: 'native-7', zh: '引擎中阶', en: 'Engine learner', engineChance: 1, skill: 7, depth: 5, milliseconds: 200 },
  { id: 'bridge-93', zh: '挑战进阶', en: 'Challenge plus', engineChance: .93, skill: 20, depth: 10, milliseconds: 900 },
  { id: 'native-11', zh: '引擎进阶', en: 'Engine thinker', engineChance: 1, skill: 11, depth: 7, milliseconds: 350 },
  { id: 'native-16', zh: '引擎高阶', en: 'Engine challenger', engineChance: 1, skill: 16, depth: 9, milliseconds: 600 },
  { id: 'expert', zh: '高手练习', en: 'Expert', engineChance: 1, skill: 20, depth: 12, milliseconds: 900 },
] as const;

export const THINKER_LEVEL = LEVELS.findIndex(level => level.id === 'classic-4');

export function migrateDifficulty(level: number): number {
  const ids = ['native-0', 'native-3', 'native-7', 'native-11', 'native-16', 'expert'];
  if (!Number.isInteger(level) || level < 0 || level >= ids.length) throw new Error('旧棋力无效 / Invalid previous level');
  return LEVELS.findIndex(candidate => candidate.id === ids[level]);
}

export function needsEngine(level: number, random = Math.random): boolean {
  return random() < LEVELS[level].engineChance;
}

export function randomMove(chess: Chess, random = Math.random): string {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) throw new Error('没有合法走法 / No legal moves');
  const move = moves[Math.floor(random() * moves.length)];
  return move.from + move.to + (move.promotion ?? '');
}
