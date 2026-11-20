import { BookOpen, Crown, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Result } from '../game';
import { pieceUrl } from '../pieces';
import { useLanguage } from '../language';
import { Bi } from './Bi';
import { Modal } from './Modal';

export function GameOver({ outcome, onClose, onReview, onNewGame }: { outcome: Result; onClose: () => void; onReview: () => void; onNewGame: () => void }) {
  const { t } = useLanguage();
  return <Modal zh="棋局结束" en="Game over" onClose={onClose}>
    <div className="game-over" data-testid="game-over" data-winner={outcome.winner ?? 'draw'}>
      <div className={`result-art ${outcome.winner ? 'victory-art' : 'draw-art'}`} aria-hidden="true">
        {outcome.winner ? <>
          <div className="victory-king"><img src={pieceUrl(outcome.winner, 'k')} alt="" /><Crown className="victory-crown" /></div>
          <div className="confetti">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--x': `${5 + (i * 37) % 90}%`, '--delay': `${i % 6 * .08}s`, '--color': ['#d5a82d', '#238365', '#4685bd', '#d47b90'][i % 4], '--rotation': `${i * 47}deg` } as CSSProperties} />)}</div>
        </> : <><img src={pieceUrl('w', 'k')} alt="" /><span>=</span><img src={pieceUrl('b', 'k')} alt="" /></>}
      </div>
      <h3>{outcome.winner === 'w' ? t('白方获胜！', 'White wins!') : outcome.winner === 'b' ? t('黑方获胜！', 'Black wins!') : t('和棋', 'Draw')}</h3>
      <p>{t(outcome.zh, outcome.en)}</p>
      <div className="result-actions">
        <button className="primary-button" onClick={onReview}><BookOpen size={20} /><Bi zh="复盘" en="Review game" /></button>
        <button className="text-button" onClick={onNewGame}><Plus size={20} /><Bi zh="再来一局" en="Play again" /></button>
      </div>
    </div>
  </Modal>;
}
