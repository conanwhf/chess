import type { Color, PieceSymbol } from 'chess.js';

export const PIECES: Record<PieceSymbol, { zh: string; en: string; ruleZh: string; ruleEn: string }> = {
  k: { zh: '王', en: 'King', ruleZh: '向任意方向走一格，不能走进将军。', ruleEn: 'One square in any direction, never into check.' },
  q: { zh: '后', en: 'Queen', ruleZh: '横、竖或斜走任意格，不能跳子。', ruleEn: 'Any distance straight or diagonally. Cannot jump.' },
  r: { zh: '车', en: 'Rook', ruleZh: '横走或竖走任意格，不能跳子。', ruleEn: 'Any distance along a rank or file. Cannot jump.' },
  b: { zh: '象', en: 'Bishop', ruleZh: '沿斜线走任意格，不能跳子。', ruleEn: 'Any distance diagonally. Cannot jump.' },
  n: { zh: '马', en: 'Knight', ruleZh: '走 L 形：两格再拐一格，可以跳子。', ruleEn: 'An L: two squares then one sideways. Can jump.' },
  p: { zh: '兵', en: 'Pawn', ruleZh: '向前一格，第一次可两格；斜前方吃子。到达底线可升变。', ruleEn: 'Forward one; optionally two on its first move. Captures diagonally. Promotes on the last rank.' },
};

export function pieceUrl(color: Color, type: PieceSymbol): string { return `/pieces/${color}${type}.svg`; }
