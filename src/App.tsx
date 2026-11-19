import { useEffect, useMemo, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ArrowLeftRight, BookOpen, Check, ChevronDown, CircleHelp, Lightbulb, LoaderCircle, Pause, Play, Plus, RotateCcw, Settings2, ShieldCheck, Trophy, Users, X } from 'lucide-react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { Bi } from './components/Bi';
import { Board, HINT_COLORS } from './components/Board';
import { Modal } from './components/Modal';
import { analyze, type Candidate } from './engine';
import { LEVELS, needsEngine, randomMove } from './difficulty';
import { createGame, deserialize, formatTime, pause, play, position, result, resume, serialize, tick, TIME_CONTROLS, undo, type Game, type Settings } from './game';
import { PIECES, pieceUrl } from './pieces';
import { version } from '../package.json';

const STORAGE_KEY = 'little-chess.game';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { game: raw ? deserialize(raw) : createGame(), error: '', failed: false };
  } catch (error) {
    return { game: createGame(), error: `存档未能读取，开始新棋局可重新保存 / Save could not be read; start a new game to save again. ${message(error)}`, failed: true };
  }
}

export function App() {
  const [boot] = useState(load);
  const [game, setGame] = useState<Game>(boot.game);
  const [error, setError] = useState(boot.error);
  const [modal, setModal] = useState<'settings' | 'help' | 'legal' | null>(null);
  const [draft, setDraft] = useState<Settings>(boot.game.settings);
  const [orientation, setOrientation] = useState<Color>(boot.game.settings.mode === 'computer' ? boot.game.settings.player : 'w');
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [hints, setHints] = useState<Candidate[]>([]);
  const [focusedHint, setFocusedHint] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [computerBusy, setComputerBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [legalText, setLegalText] = useState('');
  const currentGame = useRef(game);
  currentGame.current = game;
  const canSave = useRef(!boot.failed);
  const hintController = useRef<AbortController | null>(null);
  const moveEnd = useRef<HTMLDivElement>(null);
  const chess = useMemo(() => position(game), [game.initialFen, game.moves]);
  const fen = chess.fen();
  const ended = result(game, chess);
  const computerTurn = game.settings.mode === 'computer' && chess.turn() !== game.settings.player && !ended;
  const blocked = game.paused || !!ended || !!computerTurn || !!modal;
  const history = useMemo(() => chess.history({ verbose: true }), [chess]);

  const clearHints = () => {
    hintController.current?.abort();
    hintController.current = null;
    setHintBusy(false); setHints([]); setFocusedHint(null);
  };
  const pauseNow = () => { clearHints(); setSelected(null); setGame(g => pause(g, performance.now())); };
  const save = (g: Game) => {
    if (!canSave.current) return;
    try { localStorage.setItem(STORAGE_KEY, serialize(g)); }
    catch (e) { setError(`棋局未保存 / Game not saved: ${message(e)}`); }
  };

  useEffect(() => {
    const id = setInterval(() => setGame(g => tick(g, performance.now())), 200);
    const saving = setInterval(() => save(currentGame.current), 1000);
    return () => { clearInterval(id); clearInterval(saving); hintController.current?.abort(); };
  }, []);
  useEffect(() => { save(game); }, [game.moves, game.paused, game.settings, game.timeout]);
  useEffect(() => { if (game.timeout) clearHints(); }, [game.timeout]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        clearHints();
        const paused = pause(currentGame.current, performance.now());
        save(paused); setGame(paused);
      }
    };
    document.addEventListener('visibilitychange', hide);
    if (!Capacitor.isNativePlatform()) return () => document.removeEventListener('visibilitychange', hide);
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        clearHints();
        const paused = pause(currentGame.current, performance.now());
        save(paused); setGame(paused);
      }
    });
    listener.catch(e => setError(`后台暂停监听失败 / Lifecycle listener failed: ${message(e)}`));
    return () => {
      document.removeEventListener('visibilitychange', hide);
      listener.then(handle => handle.remove()).catch(e => setError(message(e)));
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (promotion) setPromotion(null);
      else if (modal) setModal(null);
      else pauseNow();
    });
    listener.catch(e => setError(message(e)));
    return () => { listener.then(handle => handle.remove()).catch(e => setError(message(e))); };
  }, [modal, promotion]);

  useEffect(() => {
    moveEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [game.moves]);

  useEffect(() => {
    if (!computerTurn || game.paused || modal) { setComputerBusy(false); return; }
    const controller = new AbortController();
    setComputerBusy(true);
    const work = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (controller.signal.aborted) return;
      let move: string;
      if (needsEngine(game.settings.difficulty)) {
        const candidates = await analyze(fen, { count: 1, depth: LEVELS[game.settings.difficulty].depth, milliseconds: 900, signal: controller.signal });
        move = candidates[0].uci;
      } else move = randomMove(new Chess(fen));
      if (controller.signal.aborted) return;
      setGame(g => !g.paused && position(g).fen() === fen ? play(g, move, performance.now()) : g);
    };
    work().catch(e => { if (!aborted(e)) { setError(message(e)); setGame(g => pause(g, performance.now())); } })
      .finally(() => { if (!controller.signal.aborted) setComputerBusy(false); });
    return () => controller.abort();
  }, [fen, computerTurn, game.paused, game.settings.difficulty, modal, retry]);

  useEffect(() => {
    if (modal !== 'legal' || legalText) return;
    const controller = new AbortController();
    fetch('/legal/dependencies.txt', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error(`许可证读取失败 / License read failed: ${r.status}`);
      return r.text();
    }).then(setLegalText).catch(e => { if (!aborted(e)) setError(message(e)); });
    return () => controller.abort();
  }, [modal, legalText]);

  const move = (uci: string) => {
    clearHints(); setSelected(null); setPromotion(null);
    setGame(g => play(g, uci, performance.now()));
  };
  const onSquare = (square: Square) => {
    if (blocked) return;
    const p = chess.get(square);
    if (p?.color === chess.turn()) { setSelected(s => s === square ? null : square); return; }
    if (!selected) return;
    const moves = chess.moves({ square: selected, verbose: true }).filter(m => m.to === square);
    if (!moves.length) { setSelected(null); return; }
    if (moves.some(m => m.promotion)) setPromotion({ from: selected, to: square });
    else move(selected + square);
  };
  const requestHint = async () => {
    if (blocked) return;
    clearHints(); setSelected(null); setError('');
    const controller = new AbortController();
    hintController.current = controller;
    setHintBusy(true);
    try {
      const candidates = await analyze(fen, { signal: controller.signal });
      if (!controller.signal.aborted && position(currentGame.current).fen() === fen && !currentGame.current.paused && !result(currentGame.current)) setHints(candidates);
    } catch (e) { if (!aborted(e)) setError(message(e)); }
    finally { if (hintController.current === controller) { hintController.current = null; setHintBusy(false); } }
  };
  const openSettings = () => { pauseNow(); setDraft({ ...game.settings }); setModal('settings'); };
  const start = () => {
    clearHints(); setError(''); setSelected(null); setPromotion(null); canSave.current = true;
    const fresh = createGame(draft);
    setGame(fresh); save(fresh); setOrientation(draft.mode === 'computer' ? draft.player : 'w'); setModal(null);
  };
  const handleUndo = () => { clearHints(); setSelected(null); setGame(g => undo(g, performance.now())); };
  const turnZh = chess.turn() === 'w' ? '白方' : '黑方';
  const turnEn = chess.turn() === 'w' ? 'White' : 'Black';
  const status = ended ?? (game.paused ? { zh: '休息一下', en: 'Game paused' }
    : computerBusy ? { zh: '电脑正在思考', en: 'Computer is thinking' }
    : chess.isCheck() ? { zh: `${turnZh}被将军`, en: `${turnEn} is in check` }
    : { zh: `${turnZh}走棋`, en: `${turnEn} to move` });

  const playerBar = (side: Color) => {
    const computer = game.settings.mode === 'computer' && side !== game.settings.player;
    const active = chess.turn() === side && !ended;
    return <div className={`player-bar ${active ? 'active-player' : ''}`} data-testid={`player-${side}`}>
      <div className={`player-avatar ${side === 'w' ? 'white-avatar' : 'black-avatar'}`}><img src={pieceUrl(side, 'k')} alt="" /></div>
      <div className="player-info"><Bi zh={computer ? '电脑棋友' : game.settings.mode === 'local' ? side === 'w' ? '白方棋手' : '黑方棋手' : '小小棋手'}
        en={computer ? 'Computer' : game.settings.mode === 'local' ? side === 'w' ? 'White player' : 'Black player' : 'You'} />
        <span className="player-detail">{computer ? `${game.settings.difficulty + 1} · ${LEVELS[game.settings.difficulty].zh} / ${LEVELS[game.settings.difficulty].en}` : `${side === 'w' ? '白方 / White' : '黑方 / Black'}`}</span>
      </div>
      {active && <span className="turn-dot" aria-label="当前走棋方 / Side to move" />}
      <div className={`clock ${active && !game.paused ? 'clock-active' : ''} ${game.settings.time !== 'none' && game.clocks[side] < 30000 ? 'clock-low' : ''}`} data-testid={`clock-${side}`}>
        {game.settings.time === 'none' ? <Bi zh="不限时" en="Untimed" /> : formatTime(game.clocks[side])}
      </div>
    </div>;
  };

  const toolbar = <div className="board-toolbar">
    <button className="hint-tool" onClick={requestHint} disabled={blocked || hintBusy} title="推荐走法 / Best moves">
      {hintBusy ? <LoaderCircle className="spin" /> : <Lightbulb />}<Bi zh={hintBusy ? '思考中' : '提示'} en={hintBusy ? 'Thinking' : 'Hint'} />
    </button>
    <button onClick={handleUndo} disabled={!game.moves.length || !!modal} title="悔棋 / Undo"><RotateCcw /><Bi zh="悔棋" en="Undo" /></button>
    <button onClick={() => setOrientation(o => o === 'w' ? 'b' : 'w')} title="翻转棋盘 / Flip board"><ArrowLeftRight /><Bi zh="翻转" en="Flip" /></button>
    <button onClick={() => game.paused ? setGame(g => resume(g, performance.now())) : pauseNow()} disabled={!!ended || !!modal} title={game.paused ? '继续 / Resume' : '暂停 / Pause'}>
      {game.paused ? <Play /> : <Pause />}<Bi zh={game.paused ? '继续' : '暂停'} en={game.paused ? 'Resume' : 'Pause'} />
    </button>
  </div>;

  return <div className="app-shell" data-screen-label="Chess game">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><img src={pieceUrl('w', 'n')} alt="" /></div><h1><Bi zh="小小棋手" en="Little Chess" /></h1></div>
      <div className="header-actions"><span className="offline-label"><ShieldCheck size={15} /><Bi zh="安心离线" en="Offline" /></span>
        <button className="icon-button" title="棋子帮助 / Piece guide" aria-label="棋子帮助 / Piece guide" onClick={() => { pauseNow(); setModal('help'); }}><CircleHelp /></button>
        <button className="icon-button" title="设置与新棋局 / Settings & new game" aria-label="设置与新棋局 / Settings & new game" onClick={openSettings}><Settings2 /></button>
      </div>
    </header>

    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误 / Dismiss error" onClick={() => setError('')}><X size={18} /></button></div>}

    <main className="game-layout">
      <section className="play-area" aria-label="对弈 / Play">
        <div className="game-meta"><span><Users size={15} />{game.settings.mode === 'computer' ? '人机对战 / Vs computer' : '双人对战 / Two players'}</span><span>{TIME_CONTROLS.find(t => t.id === game.settings.time)!.zh} / {TIME_CONTROLS.find(t => t.id === game.settings.time)!.en}</span></div>
        {playerBar(orientation === 'w' ? 'b' : 'w')}
        <div className="board-stage">
          <Board chess={chess} orientation={orientation} selected={selected} onSquare={onSquare} hints={hints} focusedHint={focusedHint} showNames={game.settings.names} disabled={blocked} />
          {game.paused && !modal && !ended && <div className="pause-overlay"><Pause size={30} /><Bi zh="休息一下" en="Game paused" /><button className="primary-button" onClick={() => { setError(''); setRetry(n => n + 1); setGame(g => resume(g, performance.now())); }}><Play size={20} /><Bi zh="继续下棋" en="Resume" /></button></div>}
        </div>
        {playerBar(orientation)}
        <div className={`turn-status ${ended ? 'ended-status' : chess.isCheck() ? 'check-status' : ''}`} role="status" data-testid="status">
          {ended ? <Trophy size={20} /> : computerBusy ? <LoaderCircle size={19} className="spin" /> : <span className={`status-disc ${chess.turn()}`} />}
          <Bi zh={status.zh} en={status.en} />
          {ended && <button className="text-button" onClick={openSettings}><Plus size={16} /><Bi zh="再来一局" en="Play again" /></button>}
        </div>
        <div className="mobile-toolbar">{toolbar}</div>
      </section>

      <aside className="side-area">
        <div className="desktop-toolbar">{toolbar}</div>
        <section className="hint-section" aria-label="好棋推荐 / Best moves">
          <div className="section-heading"><h2><Lightbulb size={18} /><Bi zh="好棋推荐" en="Best moves" /></h2>{hints.length > 0 && <button className="icon-button" aria-label="清除提示 / Clear hints" title="清除提示 / Clear hints" onClick={clearHints}><X size={17} /></button>}</div>
          {hintBusy ? <div className="hint-empty"><LoaderCircle className="spin" size={28} /><Bi zh="正在寻找好棋…" en="Finding good moves…" /></div>
            : hints.length > 0 ? <div className="candidate-list">{hints.map((hint, i) => {
              const piece = chess.get(hint.uci.slice(0, 2) as Square)!;
              return <button key={hint.uci} data-testid="candidate" aria-pressed={focusedHint === i} style={{ '--hint-color': HINT_COLORS[i] } as React.CSSProperties}
                onClick={() => setFocusedHint(f => f === i ? null : i)} className={`candidate ${focusedHint === i ? 'focused' : ''}`}>
                <span className="candidate-number">{i + 1}</span><img src={pieceUrl(piece.color, piece.type)} alt="" /><span className="candidate-move"><span>{hint.uci.slice(0, 2)} <span aria-hidden="true">→</span> {hint.uci.slice(2, 4)}{hint.uci[4] ? ` = ${PIECES[hint.uci[4] as PieceSymbol].zh} / ${PIECES[hint.uci[4] as PieceSymbol].en}` : ''}</span><span>{PIECES[piece.type].zh} / {PIECES[piece.type].en}</span></span>{focusedHint === i && <Check size={16} />}
              </button>;
            })}</div>
              : <div className="hint-empty"><div className="hint-symbol"><Lightbulb size={29} /></div><Bi zh="下一步，想一想" en="Your next good move" /><button className="text-button" disabled={blocked} onClick={requestHint}><Lightbulb size={16} /><Bi zh="看看推荐" en="Get a hint" /></button></div>}
        </section>

        <section className="moves-section" aria-label="棋谱 / Moves">
          <div className="section-heading"><h2><BookOpen size={18} /><Bi zh="棋谱" en="Moves" /></h2><span className="move-count">{history.length} {history.length === 1 ? '手 / ply' : '手 / plies'}</span></div>
          {!history.length ? <div className="moves-empty"><span>1.</span><Bi zh="从第一步开始" en="A fresh start" /></div> : <div className="move-table" data-testid="move-history"><div className="move-table-head"><span>#</span><span>白方 / White</span><span>黑方 / Black</span></div>{Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><span>{history[i * 2]?.san}</span><span className={i * 2 + 1 === history.length - 1 ? 'latest-san' : ''}>{history[i * 2 + 1]?.san ?? '—'}</span></div>)}<div ref={moveEnd} /></div>}
        </section>
        <div className="side-footer"><label className="names-toggle"><Bi zh="棋子名称" en="Piece names" /><input type="checkbox" checked={game.settings.names} onChange={e => setGame(g => ({ ...g, settings: { ...g.settings, names: e.target.checked } }))} /></label>
          <button className="new-game-button" onClick={openSettings}><Plus size={19} /><Bi zh="新棋局" en="New game" /><ChevronDown size={15} /></button>
        </div>
      </aside>
    </main>
    <footer className="app-footer"><span>慢慢来，每一步都算数。 / One move at a time.</span><button onClick={() => { pauseNow(); setModal('legal'); }}>开源声明 / Open source</button></footer>

    {modal === 'settings' && <Modal zh="开始一局" en="Set up a game" onClose={() => setModal(null)}>
      <div className="settings-form">
        <fieldset><legend><Bi zh="对战模式" en="Play mode" /></legend><div className="segmented">{(['computer', 'local'] as const).map(mode => <button key={mode} className={draft.mode === mode ? 'chosen' : ''} aria-pressed={draft.mode === mode} onClick={() => setDraft(d => ({ ...d, mode }))}><Users size={17} /><Bi zh={mode === 'computer' ? '人机对战' : '双人对战'} en={mode === 'computer' ? 'Vs computer' : 'Two players'} /></button>)}</div></fieldset>
        {draft.mode === 'computer' && <><label className="field-label" htmlFor="difficulty"><Bi zh="电脑棋力" en="Computer level" /><span>{draft.difficulty + 1} / 6</span></label><select id="difficulty" value={draft.difficulty} onChange={e => setDraft(d => ({ ...d, difficulty: Number(e.target.value) }))}>{LEVELS.map((level, i) => <option key={level.en} value={i}>{i + 1} · {level.zh} / {level.en}</option>)}</select>
          <fieldset><legend><Bi zh="我的棋子" en="Play as" /></legend><div className="segmented">{(['w', 'b'] as const).map(color => <button key={color} className={draft.player === color ? 'chosen' : ''} aria-pressed={draft.player === color} onClick={() => setDraft(d => ({ ...d, player: color }))}><img src={pieceUrl(color, 'k')} alt="" /><Bi zh={color === 'w' ? '白方先走' : '黑方后走'} en={color === 'w' ? 'White · first' : 'Black · second'} /></button>)}</div></fieldset></>}
        <label className="field-label" htmlFor="time"><Bi zh="每方用时" en="Time per side" /></label><select id="time" value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value as Settings['time'] }))}>{TIME_CONTROLS.map(t => <option key={t.id} value={t.id}>{t.zh} / {t.en}</option>)}</select>
        {game.moves.length > 0 && <p className="replace-note">开始后将替换当前棋局。 / Starting replaces your current game.</p>}
        <button className="primary-button full-width" onClick={start}><Play size={20} /><Bi zh="开始下棋" en="Start game" /></button>
        <button className="text-button full-width" onClick={() => setModal(null)}><Bi zh="返回当前棋局" en="Back to current game" /></button>
      </div>
    </Modal>}

    {promotion && <Modal zh="兵的升变" en="Choose promotion" onClose={() => setPromotion(null)}><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map(type => <button key={type} onClick={() => move(promotion.from + promotion.to + type)}><img src={pieceUrl(chess.turn(), type)} alt="" /><Bi zh={PIECES[type].zh} en={PIECES[type].en} /></button>)}</div></Modal>}

    {modal === 'help' && <Modal zh="认识棋子" en="Meet the pieces" onClose={() => setModal(null)}><div className="piece-guide">{(['k', 'q', 'r', 'b', 'n', 'p'] as const).map(type => <div className="guide-row" key={type}><div className="guide-images"><img src={pieceUrl('w', type)} alt="" /><img src={pieceUrl('b', type)} alt="" /></div><div><h3>{PIECES[type].zh} / {PIECES[type].en}</h3><p>{PIECES[type].ruleZh}</p><p lang="en">{PIECES[type].ruleEn}</p></div></div>)}<div className="rules-note"><p>王被攻击是「将军」，必须解除；无路可逃就是「将死」。</p><p lang="en">Check means your king is attacked. You must escape. No escape means checkmate.</p><p>王车易位：王和车均未移动、路径无子，且王未被将军、不穿过或进入被攻击的格。点王的目标格即可。</p><p lang="en">Castling: neither piece has moved, the path is clear, and the king is not in, passing through, or entering check. Tap the king's destination.</p><p>吃过路兵：对方兵刚走两格时，可立即用相邻的兵斜吃它经过的格。</p><p lang="en">En passant: immediately after an adjacent enemy pawn advances two squares, capture it on the square it passed.</p><p>提示箭头是不同候选，不是连续三步。 / Hint arrows are alternatives, not three moves in a row.</p></div></div></Modal>}

    {modal === 'legal' && <Modal zh="开源与隐私" en="Open source & privacy" onClose={() => setModal(null)}><div className="legal-content"><h3>小小棋手 / Little Chess {version}</h3><p>GPL-3.0-only · 无广告 · 无账户 · 无遥测</p><p lang="en">No ads. No accounts. No telemetry. Games stay on this device.</p><p>棋局保存在设备内。对战与提示不需要网络。</p><p>难度档位未标定 Elo；推荐走法是限时分析结果。</p><p lang="en">Levels are not calibrated Elo ratings. Hints use time-limited analysis.</p><p>引擎源码随 APK 提供 / Engine source inside APK:<br /><code>assets/public/legal/stockfish-19.0.0-source.zip</code></p><pre>{legalText || '读取中… / Loading…'}</pre></div></Modal>}
  </div>;
}
