import { useEffect, useMemo, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ArrowLeftRight, BookOpen, Check, CircleHelp, Clock3, Globe, Lightbulb, LoaderCircle, Pause, Play, Plus, RotateCcw, Settings as SettingsIcon, ShieldCheck, Trophy, Users, Volume2, X } from 'lucide-react';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { Bi } from './components/Bi';
import { Board, HINT_COLORS } from './components/Board';
import { Modal } from './components/Modal';
import { analyze, chooseMove, type Candidate } from './engine';
import { LEVELS, THINKER_LEVEL, migrateDifficulty, needsEngine, randomMove } from './difficulty';
import { changeTime, createGame, DEFAULT_SETTINGS, deserialize, formatTime, pause, play, position, result, resume, serialize, tick, TIME_CONTROLS, undo, type Game, type Settings } from './game';
import { PIECES, pieceUrl } from './pieces';
import { version } from '../package.json';
import { useAudio } from './useAudio';
import { useLanguage } from './language';

const STORAGE_KEY = 'little-chess.game';
const DEFAULT_LEVEL_KEY = 'little-chess.default-level';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

// Capacitor resets plugin listeners when the native page starts loading.
function afterPageLoad(start: () => () => void) {
  let cleanup: (() => void) | undefined;
  const ready = () => { cleanup = start(); };
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, { once: true });
  return () => { window.removeEventListener('load', ready); cleanup?.(); };
}

function loadDefaultLevel() {
  try {
    const raw = localStorage.getItem(DEFAULT_LEVEL_KEY);
    const saved: unknown = raw === null ? { version: 2, difficulty: 0 } : JSON.parse(raw);
    const level: unknown = typeof saved === 'number' ? migrateDifficulty(saved)
      : saved && typeof saved === 'object' && 'version' in saved && saved.version === 2 && 'difficulty' in saved ? saved.difficulty : undefined;
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level >= LEVELS.length) throw new Error('默认棋力无效 / Invalid default level');
    return { level, error: '' };
  } catch (error) { return { level: 0, error: `默认棋力未能读取 / Default level could not be read: ${message(error)}` }; }
}

function load(difficulty: number) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { game: raw ? deserialize(raw) : createGame({ ...DEFAULT_SETTINGS, difficulty }), error: '', failed: false };
  } catch (error) {
    return { game: createGame({ ...DEFAULT_SETTINGS, difficulty }), error: `存档未能读取，开始新棋局可重新保存 / Save could not be read; start a new game to save again. ${message(error)}`, failed: true };
  }
}

export function App() {
  const language = useLanguage();
  const { t } = language;
  const [levelPreference] = useState(loadDefaultLevel);
  const [defaultDifficulty, setDefaultDifficulty] = useState(levelPreference.level);
  const [boot] = useState(() => load(levelPreference.level));
  const [game, setGame] = useState<Game>(boot.game);
  const [error, setError] = useState(boot.error || levelPreference.error);
  const [modal, setModal] = useState<'settings' | 'help' | 'legal' | 'audio' | 'menu' | 'history' | 'time' | null>(null);
  const [draft, setDraft] = useState<Settings>(boot.game.settings);
  const [draftTime, setDraftTime] = useState<Settings['time']>(boot.game.settings.time);
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
  const moveTable = useRef<HTMLDivElement>(null);
  const chess = useMemo(() => position(game), [game.initialFen, game.moves]);
  const fen = chess.fen();
  const ended = result(game, chess);
  const computerTurn = game.settings.mode === 'computer' && chess.turn() !== game.settings.player && !ended;
  const blocked = game.paused || !!ended || !!computerTurn || !!modal || !!promotion;
  const history = useMemo(() => chess.history({ verbose: true }), [chess]);
  const audio = useAudio(modal === 'audio' || (!game.paused && !modal), setError);
  const previousMoves = useRef(game.moves);
  const previousTimeout = useRef(game.timeout);
  useEffect(() => {
    if (game.moves.length > previousMoves.current.length || (game.timeout && !previousTimeout.current)) {
      audio.play(ended ? 'end' : chess.isCheck() ? 'check' : history.at(-1)?.captured ? 'capture' : 'move');
    }
    previousMoves.current = game.moves;
    previousTimeout.current = game.timeout;
  }, [game.moves, game.timeout]);

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
        audio.silence();
        clearHints();
        const paused = pause(currentGame.current, performance.now());
        save(paused); setGame(paused);
      }
    };
    document.addEventListener('visibilitychange', hide);
    if (!Capacitor.isNativePlatform()) return () => document.removeEventListener('visibilitychange', hide);
    const release = afterPageLoad(() => {
      const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          audio.silence();
          clearHints();
          const paused = pause(currentGame.current, performance.now());
          save(paused); setGame(paused);
        }
      });
      listener.catch(e => setError(`后台暂停监听失败 / Lifecycle listener failed: ${message(e)}`));
      return () => { listener.then(handle => handle.remove()).catch(e => setError(message(e))); };
    });
    return () => {
      document.removeEventListener('visibilitychange', hide);
      release();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    return afterPageLoad(() => {
      const listener = NativeApp.addListener('backButton', () => {
        if (promotion) setPromotion(null);
        else if (modal) setModal(null);
        else pauseNow();
      });
      listener.catch(e => setError(message(e)));
      return () => { listener.then(handle => handle.remove()).catch(e => setError(message(e))); };
    });
  }, [modal, promotion]);

  useEffect(() => {
    if (moveTable.current) moveTable.current.scrollTop = moveTable.current.scrollHeight;
  }, [game.moves, modal]);

  useEffect(() => {
    if (!computerTurn || game.paused || modal) { setComputerBusy(false); return; }
    const controller = new AbortController();
    setComputerBusy(true);
    const work = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (controller.signal.aborted) return;
      const move = needsEngine(game.settings.difficulty)
        ? await chooseMove(fen, { ...LEVELS[game.settings.difficulty], signal: controller.signal })
        : randomMove(chess);
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
  const tryMove = (from: Square, to: Square) => {
    if (blocked) return;
    const moves = chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!moves.length) { setSelected(null); return; }
    if (moves.some(m => m.promotion)) setPromotion({ from, to });
    else move(from + to);
  };
  const onSquare = (square: Square) => {
    if (blocked) return;
    const p = chess.get(square);
    if (p?.color === chess.turn()) { setSelected(s => s === square ? null : square); return; }
    if (!selected) return;
    tryMove(selected, square);
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
  const openSettings = () => { pauseNow(); setDraft({ ...game.settings, difficulty: defaultDifficulty }); setModal('settings'); };
  const changeDefaultLevel = (level: number) => {
    setDefaultDifficulty(level);
    try { localStorage.setItem(DEFAULT_LEVEL_KEY, JSON.stringify({ version: 2, difficulty: level })); }
    catch (error) { setError(`默认棋力未保存 / Default level not saved: ${message(error)}`); }
  };
  const openTime = () => { pauseNow(); setDraftTime(game.settings.time); setModal('time'); };
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
        <span className="player-detail">{computer ? `${game.settings.difficulty + 1} · ${t(LEVELS[game.settings.difficulty].zh, LEVELS[game.settings.difficulty].en)}` : side === 'w' ? t('白方', 'White') : t('黑方', 'Black')}</span>
      </div>
      {active && <span className="turn-dot" aria-label={t('当前走棋方', 'Side to move')} />}
      <button className={`clock ${active && !game.paused ? 'clock-active' : ''} ${game.settings.time !== 'none' && game.clocks[side] < 30000 ? 'clock-low' : ''}`} data-testid={`clock-${side}`} onClick={openTime} disabled={!!ended} title={t('调整计时', 'Change time control')}>
        {game.settings.time === 'none' ? <Bi zh="不限时" en="Untimed" /> : formatTime(game.clocks[side])}
      </button>
    </div>;
  };

  const toolbar = <div className="board-toolbar">
    <button className="hint-tool" onClick={requestHint} disabled={blocked || hintBusy} title={t('推荐走法', 'Best moves')}>
      {hintBusy ? <LoaderCircle className="spin" /> : <Lightbulb />}<Bi zh={hintBusy ? '思考中' : '提示'} en={hintBusy ? 'Thinking' : 'Hint'} />
    </button>
    <button onClick={handleUndo} disabled={!game.moves.length || !!modal} title={t('悔棋', 'Undo')}><RotateCcw /><Bi zh="悔棋" en="Undo" /></button>
    <button onClick={() => game.paused ? setGame(g => resume(g, performance.now())) : pauseNow()} disabled={!!ended || !!modal} title={game.paused ? t('继续', 'Resume') : t('暂停', 'Pause')}>
      {game.paused ? <Play /> : <Pause />}<Bi zh={game.paused ? '继续' : '暂停'} en={game.paused ? 'Resume' : 'Pause'} />
    </button>
    <button onClick={openSettings} data-testid="new-game" title={t('新棋局', 'New game')}><Plus /><Bi zh="新棋局" en="New game" /></button>
  </div>;

  return <div className="app-shell" data-screen-label="Chess game">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><img src={pieceUrl('w', 'n')} alt="" /></div><h1><Bi zh="小小棋手" en="Little Chess" /></h1></div>
      <div className="header-actions">
        <button className="language-button" data-testid="language" title={t('Switch to English', '切换为中文')} aria-label={t('Switch to English', '切换为中文')} onClick={() => language.change(language.language === 'zh' ? 'en' : 'zh')}><span className={language.language === 'zh' ? 'current-language' : ''}>中</span><span aria-hidden="true">/</span><span className={language.language === 'en' ? 'current-language' : ''}>En</span></button>
        <button className="icon-button" data-testid="menu" title={t('设置', 'Settings')} aria-label={t('设置', 'Settings')} onClick={() => { pauseNow(); setModal('menu'); }}><SettingsIcon /></button>
      </div>
    </header>

    {(error || language.error) && <div className="error-banner" role="alert"><span>{error || `${t('语言设置未保存', 'Language setting unavailable')}: ${language.error}`}</span><button className="icon-button" aria-label={t('关闭错误', 'Dismiss error')} onClick={() => { setError(''); language.clearError(); }}><X size={18} /></button></div>}

    <main className="game-layout">
      <section className="play-area" aria-label={t('对弈', 'Play')}>
        {playerBar(orientation === 'w' ? 'b' : 'w')}
        <div className="board-slot"><div className="board-stage">
          <Board chess={chess} orientation={orientation} selected={selected} onSquare={onSquare} onMove={tryMove} hints={hints} focusedHint={focusedHint} showNames={game.settings.names} showLegalTargets={game.settings.mode === 'local' || game.settings.difficulty < THINKER_LEVEL} disabled={blocked} />
          {game.paused && !modal && !ended && <div className="pause-overlay"><Pause size={30} /><Bi zh="休息一下" en="Game paused" /><button className="primary-button" onClick={() => { setError(''); setRetry(n => n + 1); setGame(g => resume(g, performance.now())); }}><Play size={20} /><Bi zh="继续下棋" en="Resume" /></button></div>}
        </div></div>
        {playerBar(orientation)}
        <div className={`turn-status ${ended ? 'ended-status' : chess.isCheck() ? 'check-status' : ''}`} role="status" data-testid="status">
          {hints.length > 0 ? <div className="candidate-list">{hints.map((hint, i) => <button key={hint.uci} data-testid="candidate" aria-pressed={focusedHint === i} style={{ '--hint-color': HINT_COLORS[i] } as React.CSSProperties}
            onClick={() => setFocusedHint(f => f === i ? null : i)} className={`candidate ${focusedHint === i ? 'focused' : ''}`}>
            <span className="candidate-number">{i + 1}</span><span>{hint.uci.slice(0, 2)} → {hint.uci.slice(2, 4)}{hint.uci[4] ? `=${t(PIECES[hint.uci[4] as PieceSymbol].zh, PIECES[hint.uci[4] as PieceSymbol].en)}` : ''}</span>
          </button>)}<button className="icon-button" aria-label={t('清除提示', 'Clear hints')} title={t('清除提示', 'Clear hints')} onClick={clearHints}><X size={17} /></button></div> : <>
            {ended ? <Trophy size={20} /> : computerBusy ? <LoaderCircle size={19} className="spin" /> : <span className={`status-disc ${chess.turn()}`} />}
            <Bi zh={status.zh} en={status.en} />
          </>}
          {ended && <button className="text-button" onClick={openSettings}><Plus size={16} /><Bi zh="再来一局" en="Play again" /></button>}
        </div>
        {toolbar}
      </section>

    </main>

    {modal === 'menu' && <Modal zh="设置" en="Settings" onClose={() => setModal(null)}><div className="menu-items">
      <div className="default-settings"><label className="field-label" htmlFor="default-difficulty"><Bi zh="默认电脑棋力" en="Default computer level" /><span>{defaultDifficulty + 1} / {LEVELS.length}</span></label><select id="default-difficulty" value={defaultDifficulty} onChange={e => changeDefaultLevel(Number(e.target.value))}>{LEVELS.map((level, i) => <option key={level.en} value={i}>{i + 1} · {t(level.zh, level.en)}</option>)}</select></div>
      <button onClick={openTime} disabled={!!ended}><Clock3 /><Bi zh="计时设置" en="Time control" /></button>
      <button onClick={() => setModal('history')} aria-label={t('棋谱', 'Move history')}><BookOpen /><Bi zh="棋谱" en="Move history" /><span className="move-count" aria-hidden="true">{history.length}</span></button>
      <button onClick={() => setModal('help')}><CircleHelp /><Bi zh="棋子帮助" en="Piece guide" /></button>
      <button onClick={() => setModal('audio')}><Volume2 /><Bi zh="声音" en="Sound" /></button>
      <button onClick={() => { setOrientation(o => o === 'w' ? 'b' : 'w'); setModal(null); }}><ArrowLeftRight /><Bi zh="翻转棋盘" en="Flip board" /></button>
      <label className="names-toggle"><Bi zh="棋子名称" en="Piece names" /><input type="checkbox" checked={game.settings.names} onChange={e => setGame(g => ({ ...g, settings: { ...g.settings, names: e.target.checked } }))} /></label>
      <button onClick={() => language.change(null)} disabled={language.automatic}><Globe /><Bi zh="语言跟随系统" en="Use system language" /></button>
      <button onClick={() => setModal('legal')}><ShieldCheck /><Bi zh="开源与隐私" en="Open source & privacy" /></button>
    </div></Modal>}

    {modal === 'history' && <Modal zh="棋谱" en="Move history" onClose={() => setModal(null)}><div className="history-content">
      {!history.length ? <div className="moves-empty"><Bi zh="尚未走棋" en="No moves yet" /></div> : <div className="move-table" ref={moveTable} data-testid="move-history"><div className="move-table-head"><span>#</span><Bi zh="白方" en="White" /><Bi zh="黑方" en="Black" /></div>{Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><span>{history[i * 2]?.san}</span><span>{history[i * 2 + 1]?.san ?? '—'}</span></div>)}</div>}
    </div></Modal>}

    {modal === 'audio' && <Modal zh="声音" en="Sound" onClose={() => setModal(null)}><div className="audio-settings">
      <label className="names-toggle"><Bi zh="音效" en="Sound effects" /><input type="checkbox" checked={audio.settings.effects} onChange={e => audio.change({ ...audio.settings, effects: e.target.checked })} /></label>
      <button className="text-button" disabled={!audio.settings.effects} onClick={() => audio.play('capture')}><Volume2 size={18} /><Bi zh="试听音效" en="Test sound" /></button>
    </div></Modal>}

    {modal === 'time' && <Modal zh="计时设置" en="Time control" onClose={() => setModal(null)}><div className="settings-form">
      <label className="field-label" htmlFor="live-time"><Bi zh="每方用时" en="Time per side" /></label><select id="live-time" value={draftTime} onChange={e => setDraftTime(e.target.value as Settings['time'])}>{TIME_CONTROLS.map(control => <option key={control.id} value={control.id}>{t(control.zh, control.en)}</option>)}</select>
      <p className="replace-note"><Bi zh="更改后重设双方时间，保留当前棋局。" en="Changing the control resets both clocks and keeps this game." /></p>
      <button className="primary-button full-width" disabled={!!ended} onClick={() => { setGame(g => changeTime(g, draftTime, performance.now())); setModal(null); }}><Check size={20} /><Bi zh="应用" en="Apply" /></button>
      <button className="text-button full-width" onClick={() => setModal(null)}><Bi zh="取消" en="Cancel" /></button>
    </div></Modal>}

    {modal === 'settings' && <Modal zh="开始一局" en="Set up a game" onClose={() => setModal(null)}>
      <div className="settings-form">
        <fieldset><legend><Bi zh="对战模式" en="Play mode" /></legend><div className="segmented">{(['computer', 'local'] as const).map(mode => <button key={mode} className={draft.mode === mode ? 'chosen' : ''} aria-pressed={draft.mode === mode} onClick={() => setDraft(d => ({ ...d, mode }))}><Users size={17} /><Bi zh={mode === 'computer' ? '人机对战' : '双人对战'} en={mode === 'computer' ? 'Vs computer' : 'Two players'} /></button>)}</div></fieldset>
        {draft.mode === 'computer' && <><label className="field-label" htmlFor="difficulty"><Bi zh="电脑棋力" en="Computer level" /><span>{draft.difficulty + 1} / {LEVELS.length}</span></label><select id="difficulty" value={draft.difficulty} onChange={e => setDraft(d => ({ ...d, difficulty: Number(e.target.value) }))}>{LEVELS.map((level, i) => <option key={level.en} value={i}>{i + 1} · {t(level.zh, level.en)}</option>)}</select>
          <fieldset><legend><Bi zh="我的棋子" en="Play as" /></legend><div className="segmented">{(['w', 'b'] as const).map(color => <button key={color} className={draft.player === color ? 'chosen' : ''} aria-pressed={draft.player === color} onClick={() => setDraft(d => ({ ...d, player: color }))}><img src={pieceUrl(color, 'k')} alt="" /><Bi zh={color === 'w' ? '白方先走' : '黑方后走'} en={color === 'w' ? 'White · first' : 'Black · second'} /></button>)}</div></fieldset></>}
        <label className="field-label" htmlFor="time"><Bi zh="每方用时" en="Time per side" /></label><select id="time" value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value as Settings['time'] }))}>{TIME_CONTROLS.map(control => <option key={control.id} value={control.id}>{t(control.zh, control.en)}</option>)}</select>
        {game.moves.length > 0 && <p className="replace-note"><Bi zh="开始后将替换当前棋局。" en="Starting replaces your current game." /></p>}
        <button className="primary-button full-width" onClick={start}><Play size={20} /><Bi zh="开始下棋" en="Start game" /></button>
        <button className="text-button full-width" onClick={() => setModal(null)}><Bi zh="返回当前棋局" en="Back to current game" /></button>
      </div>
    </Modal>}

    {promotion && <Modal zh="兵的升变" en="Choose promotion" onClose={() => setPromotion(null)}><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map(type => <button key={type} onClick={() => move(promotion.from + promotion.to + type)}><img src={pieceUrl(chess.turn(), type)} alt="" /><Bi zh={PIECES[type].zh} en={PIECES[type].en} /></button>)}</div></Modal>}

    {modal === 'help' && <Modal zh="认识棋子" en="Meet the pieces" onClose={() => setModal(null)}><div className="piece-guide">{(['k', 'q', 'r', 'b', 'n', 'p'] as const).map(type => <div className="guide-row" key={type}><div className="guide-images"><img src={pieceUrl('w', type)} alt="" /><img src={pieceUrl('b', type)} alt="" /></div><div><h3>{t(PIECES[type].zh, PIECES[type].en)}</h3><p>{t(PIECES[type].ruleZh, PIECES[type].ruleEn)}</p></div></div>)}<div className="rules-note">
      <p><Bi zh="王被攻击是「将军」，必须解除；无路可逃就是「将死」。" en="Check means your king is attacked. You must escape. No escape means checkmate." /></p>
      <p><Bi zh="王车易位：王和车均未移动、路径无子，且王未被将军、不穿过或进入被攻击的格。点王的目标格即可。" en="Castling: neither piece has moved, the path is clear, and the king is not in, passing through, or entering check. Tap the king's destination." /></p>
      <p><Bi zh="吃过路兵：对方兵刚走两格时，可立即用相邻的兵斜吃它经过的格。" en="En passant: immediately after an adjacent enemy pawn advances two squares, capture it on the square it passed." /></p>
      <p><Bi zh="提示箭头是不同候选，不是连续三步。" en="Hint arrows are alternatives, not three moves in a row." /></p>
    </div></div></Modal>}

    {modal === 'legal' && <Modal zh="开源与隐私" en="Open source & privacy" onClose={() => setModal(null)}><div className="legal-content"><h3><Bi zh="小小棋手" en="Little Chess" /> {version}</h3><p>GPL-3.0-only</p>
      <p><Bi zh="无广告、无账户、无遥测。棋局保存在设备内，对战与提示不需要网络。" en="No ads, accounts or telemetry. Games stay on this device. Play and hints work offline." /></p>
      <p><Bi zh="难度档位未标定 Elo；推荐走法是限时分析结果。" en="Levels are not calibrated Elo ratings. Hints use time-limited analysis." /></p>
      <p><Bi zh="引擎源码随 APK 提供：" en="Engine source inside APK:" /><br /><code>assets/public/legal/stockfish-19.0.0-source.zip</code></p><pre>{legalText || t('读取中…', 'Loading…')}</pre></div></Modal>}
  </div>;
}
