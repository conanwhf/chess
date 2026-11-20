import { Chess, type Color, type Square } from 'chess.js';
import type { Candidate } from '../engine';
import { PIECES, pieceUrl } from '../pieces';
import { useRef } from 'react';
import { useLanguage } from '../language';

export const HINT_COLORS = ['#167950', '#246dc1', '#bc6026'];

interface Props {
  chess: Chess;
  orientation: Color;
  selected: Square | null;
  onSquare: (square: Square) => void;
  hints: Candidate[];
  focusedHint: number | null;
  showNames: boolean;
  disabled: boolean;
}

export function Board({ chess, orientation, selected, onSquare, hints, focusedHint, showNames, disabled }: Props) {
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const { t } = useLanguage();
  const files = (orientation === 'w' ? 'abcdefgh' : 'hgfedcba').split('');
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const targets = new Set(selected ? chess.moves({ square: selected, verbose: true }).map(m => m.to) : []);
  const last = chess.history({ verbose: true }).at(-1);
  const point = (square: string) => ({ x: files.indexOf(square[0]) * 100 + 50, y: ranks.indexOf(Number(square[1])) * 100 + 50 });
  return <div className="board-wrap">
    <div className="rank-labels" aria-hidden="true">{ranks.map(rank => <span key={rank}>{rank}</span>)}</div>
    <div className="board" role="group" aria-label={t('棋盘', 'Chessboard')} data-testid="board" data-fen={chess.fen()}
      onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, moved: false }; }}
      onPointerMove={e => { if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 8) gesture.current.moved = true; }}
      onClickCapture={e => { if (e.detail !== 0 && gesture.current.moved) { e.preventDefault(); e.stopPropagation(); } }}>
      {ranks.flatMap((rank, y) => files.map((file, x) => {
        const square = `${file}${rank}` as Square;
        const p = chess.get(square);
        const name = p ? PIECES[p.type] : null;
        const checked = p?.type === 'k' && p.color === chess.turn() && chess.isCheck();
        return <button key={square} type="button" data-square={square}
          aria-label={`${square} ${p ? `${p.color === 'w' ? t('白', 'White') : t('黑', 'Black')} ${t(name!.zh, name!.en)}` : t('空', 'Empty')}`}
          aria-pressed={selected === square} disabled={disabled}
          className={`square ${(x + y) % 2 ? 'dark' : 'light'} ${selected === square ? 'selected' : ''} ${last?.from === square || last?.to === square ? 'last-move' : ''} ${checked ? 'in-check' : ''}`}
          onClick={() => onSquare(square)}>
          {p && <><img className="piece" src={pieceUrl(p.color, p.type)} alt="" draggable={false} />{showNames && <span className={`piece-name ${p.color === 'w' ? 'white-name' : 'black-name'}`}>{t(name!.zh, name!.en)}</span>}</>}
          {targets.has(square) && <span className={`legal-target ${p ? 'capture-target' : ''}`} />}
        </button>;
      }))}
      {hints.length > 0 && <svg className="hint-arrows" viewBox="0 0 800 800" aria-hidden="true" data-testid="hint-arrows">
        <defs>{HINT_COLORS.map((color, i) => <marker key={color} id={`arrow-${i}`} markerWidth="3" markerHeight="3" refX="2" refY="1.5" orient="auto"><path d="M0 0L2.5 1.5L0 3Z" fill={color} /></marker>)}</defs>
        {hints.map((hint, i) => {
          const a = point(hint.uci.slice(0, 2));
          const b = point(hint.uci.slice(2, 4));
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          return <g key={hint.uci} opacity={focusedHint === null || focusedHint === i ? 0.9 : 0.12}>
            <line x1={a.x} y1={a.y} x2={b.x - (b.x - a.x) / d * 16} y2={b.y - (b.y - a.y) / d * 16} stroke="white" strokeWidth="18" opacity=".8" strokeLinecap="round" />
            <line data-testid="hint-arrow" x1={a.x} y1={a.y} x2={b.x - (b.x - a.x) / d * 16} y2={b.y - (b.y - a.y) / d * 16} stroke={HINT_COLORS[i]} strokeWidth="10" strokeLinecap="round" markerEnd={`url(#arrow-${i})`} />
            <circle cx={a.x} cy={a.y} r="16" fill={HINT_COLORS[i]} stroke="white" strokeWidth="3" />
            <text x={a.x} y={a.y + 6} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{i + 1}</text>
          </g>;
        })}
      </svg>}
    </div>
    <div className="file-labels" aria-hidden="true">{files.map(file => <span key={file}>{file}</span>)}</div>
  </div>;
}
