import type { Chess } from 'chess.js';

export const LEVELS = [
  { id: 'classic-3', zh: '勇气先锋', en: 'Brave Vanguard', engineChance: .35, skill: 20, depth: 3, milliseconds: 900 },
  { id: 'classic-4', zh: '认真思考（经典）', en: 'Thinker (classic)', engineChance: .6, skill: 20, depth: 5, milliseconds: 900 },
  { id: 'bridge-72', zh: '疾风剑士', en: 'Windblade', engineChance: .72, skill: 20, depth: 6, milliseconds: 900 },
  { id: 'native-0', zh: '闪电骑士', en: 'Lightning Knight', engineChance: 1, skill: 0, depth: 1, milliseconds: 50 },
  { id: 'bridge-80', zh: '烈焰战将', en: 'Flame General', engineChance: .8, skill: 20, depth: 7, milliseconds: 900 },
  { id: 'classic-5', zh: '破阵统帅', en: 'Siege Marshal', engineChance: .85, skill: 20, depth: 8, milliseconds: 900 },
  { id: 'native-3', zh: '雷霆领主', en: 'Thunder Lord', engineChance: 1, skill: 3, depth: 3, milliseconds: 100 },
  { id: 'native-7', zh: '星耀王者', en: 'Starlight King', engineChance: 1, skill: 7, depth: 5, milliseconds: 200 },
  { id: 'bridge-93', zh: '无双棋王', en: 'Peerless King', engineChance: .93, skill: 20, depth: 10, milliseconds: 900 },
  { id: 'native-11', zh: '传奇霸主', en: 'Legendary Overlord', engineChance: 1, skill: 11, depth: 7, milliseconds: 350 },
  { id: 'native-16', zh: '至尊棋皇', en: 'Supreme Emperor', engineChance: 1, skill: 16, depth: 9, milliseconds: 600 },
  { id: 'expert', zh: '巅峰棋圣', en: 'Ultimate Grandmaster', engineChance: 1, skill: 20, depth: 12, milliseconds: 900 },
] as const;

export const THINKER_LEVEL = LEVELS.findIndex(level => level.id === 'classic-4');

export function migrateDifficulty(level: number, version: 1 | 2 = 1): number {
  const ids = version === 1
    ? ['native-0', 'native-3', 'native-7', 'native-11', 'native-16', 'expert']
    : ['classic-3', 'classic-3', 'classic-4', 'bridge-72', 'native-0', 'classic-5', 'native-3', 'native-7', 'bridge-93', 'native-11', 'native-16', 'expert'];
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
