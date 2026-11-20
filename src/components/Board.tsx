import { Chess, type Color, type Square } from 'chess.js';
import type { Candidate } from '../engine';
import { PIECES, pieceUrl } from '../pieces';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../language';

export const HINT_COLORS = ['#167950', '#246dc1', '#bc6026'];

interface Props {
  chess: Chess;
  orientation: Color;
  selected: Square | null;
  onSquare: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  hints: Candidate[];
  focusedHint: number | null;
  showNames: boolean;
  showLegalTargets: boolean;
  disabled: boolean;
}

export function Board({ chess, orientation, selected, onSquare, onMove, hints, focusedHint, showNames, showLegalTargets, disabled }: Props) {
  const gesture = useRef<{ id: number; x: number; y: number; from: Square | null; moved: boolean; fen: string } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; to: Square | null } | null>(null);
  const fen = chess.fen();
  const cancel = () => { gesture.current = null; setDrag(null); };
  useEffect(cancel, [disabled, fen, orientation]);
  const { t } = useLanguage();
  const files = (orientation === 'w' ? 'abcdefgh' : 'hgfedcba').split('');
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const source = drag?.from ?? selected;
  const targets = new Set(showLegalTargets && source ? chess.moves({ square: source, verbose: true }).map(m => m.to) : []);
  const draggedPiece = drag ? chess.get(drag.from) : null;
  const squareAt = (board: HTMLElement, x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
    return target && board.contains(target) ? target.dataset.square as Square : null;
  };
  const last = chess.history({ verbose: true }).at(-1);
  const point = (square: string) => ({ x: files.indexOf(square[0]) * 100 + 50, y: ranks.indexOf(Number(square[1])) * 100 + 50 });
  return <div className="board-wrap">
    <div className="rank-labels" aria-hidden="true">{ranks.map(rank => <span key={rank}>{rank}</span>)}</div>
    <div className="board" role="group" aria-label={t('棋盘', 'Chessboard')} data-testid="board" data-fen={fen}
      onPointerDown={e => {
        if (!e.isPrimary) { suppressClick.current = true; cancel(); return; }
        if (disabled || e.button !== 0) return;
        suppressClick.current = false;
        const from = squareAt(e.currentTarget, e.clientX, e.clientY);
        gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: from && chess.get(from)?.color === chess.turn() ? from : null, moved: false, fen };
      }}
      onPointerMove={e => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId || disabled) return;
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.moved = true;
        if (!g.moved) return;
        suppressClick.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (g.from) {
          const bounds = e.currentTarget.getBoundingClientRect();
          setDrag({ from: g.from, x: e.clientX - bounds.left - e.currentTarget.clientLeft, y: e.clientY - bounds.top - e.currentTarget.clientTop, to: squareAt(e.currentTarget, e.clientX, e.clientY) });
        }
      }}
      onPointerUp={e => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        const to = squareAt(e.currentTarget, e.clientX, e.clientY);
        cancel();
        if (g.moved && g.from && to && !disabled && g.fen === fen) onMove(g.from, to);
      }}
      onPointerCancel={() => { suppressClick.current = true; cancel(); }}
      onLostPointerCapture={e => { if (e.target === e.currentTarget) cancel(); }}
      onClickCapture={e => { if (e.detail !== 0 && suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}>
      {ranks.flatMap((rank, y) => files.map((file, x) => {
        const square = `${file}${rank}` as Square;
        const p = chess.get(square);
        const name = p ? PIECES[p.type] : null;
        const checked = p?.type === 'k' && p.color === chess.turn() && chess.isCheck();
        return <button key={square} type="button" data-square={square}
          aria-label={`${square} ${p ? `${p.color === 'w' ? t('白', 'White') : t('黑', 'Black')} ${t(name!.zh, name!.en)}` : t('空', 'Empty')}`}
          aria-pressed={selected === square} disabled={disabled}
          className={`square ${(x + y) % 2 ? 'dark' : 'light'} ${source === square ? 'selected' : ''} ${drag?.from === square ? 'drag-source' : ''} ${drag?.to === square && targets.has(square) ? 'drop-target' : ''} ${last?.from === square || last?.to === square ? 'last-move' : ''} ${checked ? 'in-check' : ''}`}
          onClick={() => onSquare(square)}>
          {p && <><img className="piece" src={pieceUrl(p.color, p.type)} alt="" draggable={false} />{showNames && <span className={`piece-name ${p.color === 'w' ? 'white-name' : 'black-name'}`}>{t(name!.zh, name!.en)}</span>}</>}
          {targets.has(square) && <span className={`legal-target ${p ? 'capture-target' : ''}`} />}
        </button>;
      }))}
      {drag && draggedPiece && <div className="drag-piece" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><img className="piece" src={pieceUrl(draggedPiece.color, draggedPiece.type)} alt="" draggable={false} />{showNames && <span className="piece-name">{t(PIECES[draggedPiece.type].zh, PIECES[draggedPiece.type].en)}</span>}</div>}
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
