import { useMemo } from 'react';
import type { Color } from 'chess.js';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { position, type Game } from '../game';
import { useLanguage } from '../language';
import { Board } from './Board';
import { Bi } from './Bi';

interface Props {
  game: Game;
  orientation: Color;
  index: number;
  playing: boolean;
  onIndex: (index: number) => void;
  onPlaying: (playing: boolean) => void;
  onClose: () => void;
}

export function Replay({ game, orientation, index, playing, onIndex, onPlaying, onClose }: Props) {
  const { t } = useLanguage();
  const chess = useMemo(() => position({ initialFen: game.initialFen, moves: game.moves.slice(0, index) }), [game.initialFen, game.moves, index]);
  const total = game.moves.length;
  const seek = (next: number) => { onPlaying(false); onIndex(next); };
  const toggle = () => { if (!playing && index === total) onIndex(0); onPlaying(!playing); };
  return <main className="review-layout" data-testid="review">
    <div className="review-heading"><h2><Bi zh="棋局复盘" en="Game review" /></h2><button className="icon-button" onClick={onClose} title={t('退出复盘', 'Exit review')} aria-label={t('退出复盘', 'Exit review')}><X /></button></div>
    <div className="board-slot"><div className="board-stage"><Board chess={chess} orientation={orientation} selected={null} onSquare={() => {}} onMove={() => {}} hints={[]} focusedHint={null} showNames={game.settings.names} showLegalTargets={false} disabled /></div></div>
    <div className="review-progress"><span data-testid="review-step" aria-live={playing ? 'off' : 'polite'}>{index} / {total}<strong>{index ? chess.history().at(-1) : t('起始局面', 'Start position')}</strong></span><input type="range" aria-label={t('复盘进度', 'Review position')} min={0} max={total} value={index} disabled={!total} onChange={e => seek(Number(e.target.value))} /></div>
    <div className="review-controls">
      <button className="icon-button" title={t('回到开局', 'First position')} aria-label={t('回到开局', 'First position')} disabled={index === 0} onClick={() => seek(0)}><SkipBack /></button>
      <button className="icon-button" title={t('上一步', 'Previous move')} aria-label={t('上一步', 'Previous move')} disabled={index === 0} onClick={() => seek(index - 1)}><ChevronLeft /></button>
      <button className="icon-button review-play" title={playing ? t('暂停播放', 'Pause replay') : t('自动播放', 'Auto play')} aria-label={playing ? t('暂停播放', 'Pause replay') : t('自动播放', 'Auto play')} disabled={!total} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
      <button className="icon-button" title={t('下一步', 'Next move')} aria-label={t('下一步', 'Next move')} disabled={index === total} onClick={() => seek(index + 1)}><ChevronRight /></button>
      <button className="icon-button" title={t('跳到最后', 'Last position')} aria-label={t('跳到最后', 'Last position')} disabled={index === total} onClick={() => seek(total)}><SkipForward /></button>
    </div>
  </main>;
}
