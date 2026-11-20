import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { LEVELS } from '../../src/difficulty';
import { changeTime, createGame, DEFAULT_SETTINGS, deserialize, formatTime, pause, play, position, result, resume, serialize, tick, undo, type Game } from '../../src/game';

function sequence(moves: string[], g: Game = createGame({ ...DEFAULT_SETTINGS, mode: 'local' })) {
  return moves.reduce((game, move, i) => play(game, move, i * 1000), g);
}

describe('rules through chess.js', () => {
  it('starts at the weakest level, white, untimed', () => {
    const g = createGame();
    expect(g.settings).toMatchObject({ difficulty: 0, player: 'w', time: 'none' });
    expect(position(g).moves()).toHaveLength(20);
  });
  it('rejects illegal moves without changing the original game', () => {
    const g = createGame();
    expect(() => play(g, 'e2e5', 0)).toThrow();
    expect(g.moves).toHaveLength(0);
  });
  it('supports castling and moves both pieces', () => {
    const g = sequence(['e1g1'], createGame(DEFAULT_SETTINGS, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    expect(position(g).get('g1')?.type).toBe('k');
    expect(position(g).get('f1')?.type).toBe('r');
  });
  it('forbids castling through check', () => {
    const g = createGame(DEFAULT_SETTINGS, '4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(() => play(g, 'e1g1', 0)).toThrow();
  });
  it('supports en passant', () => {
    const g = sequence(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(position(g).get('d6')?.type).toBe('p');
    expect(position(g).get('d5')).toBeUndefined();
  });
  it.each(['q', 'r', 'b', 'n'])('supports promotion to %s', piece => {
    const g = createGame(DEFAULT_SETTINGS, '7k/P7/8/8/8/8/8/7K w - - 0 1');
    expect(position(play(g, `a7a8${piece}`, 0)).get('a8')?.type).toBe(piece);
  });
  it('recognizes checkmate and blocks further moves', () => {
    const g = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(result(g)).toMatchObject({ winner: 'b' });
    expect(play(g, 'a2a3', 10000)).toBe(g);
  });
  it('recognizes stalemate', () => {
    expect(result(createGame(DEFAULT_SETTINGS, '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'))?.en).toContain('stalemate');
  });
  it('preserves repetition after save and restore', () => {
    const g = sequence(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(result(deserialize(serialize(g)))?.en).toContain('repetition');
  });
  it('recognizes insufficient material and fifty move rule', () => {
    expect(result(createGame(DEFAULT_SETTINGS, '7k/8/8/8/8/8/8/K7 w - - 0 1'))?.en).toContain('insufficient');
    expect(result(createGame(DEFAULT_SETTINGS, '7k/8/8/8/8/8/8/KR6 w - - 100 60'))?.en).toContain('fifty');
  });
});

describe('clock and undo', () => {
  const timed = () => createGame({ ...DEFAULT_SETTINGS, mode: 'local', time: '5' });
  it('starts counting only after the first move', () => {
    expect(tick(timed(), 999999).clocks.w).toBe(300000);
    const g = tick(play(timed(), 'e2e4', 1000), 3500);
    expect(g.clocks).toEqual({ w: 300000, b: 297500 });
  });
  it('charges actual elapsed time when an interval is delayed', () => {
    const g = tick(play(timed(), 'e2e4', 1000), 12345);
    expect(g.clocks.b).toBe(288655);
  });
  it('settles before switching players and adds increment', () => {
    let g = createGame({ ...DEFAULT_SETTINGS, mode: 'local', time: '10+5' });
    g = play(g, 'e2e4', 1000);
    g = play(g, 'e7e5', 4100);
    expect(g.clocks).toEqual({ w: 605000, b: 601900 });
    expect(tick(g, 5100).clocks.w).toBe(604000);
  });
  it('pauses without charging rest time and resumes correctly', () => {
    const g = pause(play(timed(), 'e2e4', 1000), 3000);
    expect(tick(g, 900000).clocks.b).toBe(298000);
    expect(tick(resume(g, 1000000), 1001000).clocks.b).toBe(297000);
  });
  it('blocks a move after flag fall', () => {
    const g = play(timed(), 'e2e4', 0);
    const late = play(g, 'e7e5', 300001);
    expect(late.moves).toHaveLength(1);
    expect(late.timeout).toBe('b');
    expect(result(late)?.winner).toBe('w');
  });
  it('draws on time when the opponent has only a king', () => {
    const g = createGame({ ...DEFAULT_SETTINGS, time: '5' }, '7k/8/8/8/8/8/8/KR6 b - - 0 1');
    expect(result({ ...g, timeout: 'w' })?.winner).toBeNull();
  });
  it('undoes one ply locally with clock restoration', () => {
    const g = sequence(['e2e4', 'e7e5'], timed());
    const back = undo(g, 5000);
    expect(back.moves).toEqual(['e2e4']);
    expect(back.clocks.b).toBe(299000);
    expect(position(back).turn()).toBe('b');
  });
  it('undoes a computer reply and the player move', () => {
    expect(undo(sequence(['e2e4', 'e7e5'], createGame()), 5000).moves).toHaveLength(0);
  });
  it('undoes a player move while the computer is thinking', () => {
    expect(undo(sequence(['e2e4'], createGame()), 5000).moves).toHaveLength(0);
  });
  it('returns to a black player decision without removing the initial computer move', () => {
    const g = sequence(['e2e4', 'e7e5', 'g1f3'], createGame({ ...DEFAULT_SETTINGS, player: 'b' }));
    expect(undo(g, 5000).moves).toEqual(['e2e4']);
  });
  it('untimed games never flag', () => {
    expect(tick(play(createGame(), 'e2e4', 0), 9999999).timeout).toBeNull();
  });
  it('does not move while paused', () => {
    const g = pause(createGame(), 0);
    expect(play(g, 'e2e4', 1000)).toBe(g);
  });
  it('formats time without a premature zero', () => {
    expect(formatTime(1)).toBe('00:01');
    expect(formatTime(60000)).toBe('01:00');
  });
});

describe('save boundary', () => {
  it('round-trips every new level with the new save version', () => {
    for (const [difficulty] of LEVELS.entries()) {
      const game = createGame({ ...DEFAULT_SETTINGS, difficulty });
      expect(JSON.parse(serialize(game)).version).toBe(2);
      expect(deserialize(serialize(game)).settings.difficulty).toBe(difficulty);
    }
  });
  it('rejects a new-format level outside the twelve profiles', () => {
    const game = createGame({ ...DEFAULT_SETTINGS, difficulty: LEVELS.length });
    expect(() => deserialize(serialize(game))).toThrow('Invalid saved game');
  });
  it('migrates the six previous levels without changing moves or clocks', () => {
    for (const [difficulty, id] of ['native-0', 'native-3', 'native-7', 'native-11', 'native-16', 'expert'].entries()) {
      const game = sequence(['e2e4', 'e7e5']);
      game.settings.difficulty = difficulty;
      const restored = deserialize(JSON.stringify({ version: 1, game }));
      expect(LEVELS[restored.settings.difficulty].id).toBe(id);
      expect(restored.moves).toEqual(game.moves);
      expect(restored.clocks).toEqual(game.clocks);
      expect(restored.snapshots).toEqual(game.snapshots);
    }
  });
  it('restores a valid game paused with no stale timestamp', () => {
    const g = sequence(['e2e4', 'e7e5']);
    const restored = deserialize(serialize(g));
    expect(restored.paused).toBe(true);
    expect(restored.clockAt).toBeNull();
    expect(position(restored).fen()).toBe(position(g).fen());
  });
  it.each(['{', '{}', '{"version":200}', '{"version":1,"game":null}'])('rejects invalid saves: %s', raw => {
    expect(() => deserialize(raw)).toThrow();
  });
  it('rejects invalid settings, clocks, snapshots and illegal move sequences', () => {
    for (const change of [
      { settings: { ...DEFAULT_SETTINGS, difficulty: 100 } },
      { clocks: { w: -1, b: 0 } },
      { moves: ['e2e5'], snapshots: [{ clocks: { w: 0, b: 0 }, started: false }] },
      { moves: ['e2e4'], snapshots: [] },
    ]) expect(() => deserialize(JSON.stringify({ version: 1, game: { ...createGame(), ...change } }))).toThrow();
  });
  it('a fresh game stays playable after restore', () => {
    expect(deserialize(serialize(createGame())).paused).toBe(false);
    expect(position(createGame()).fen()).toBe(new Chess().fen());
  });
});

describe('changing time controls during a game', () => {
  const started = () => sequence(['e2e4', 'e7e5']);
  it('keeps position and turn, resets both clocks, and charges the current player', () => {
    const game = started();
    const timed = changeTime(game, '5', 9000);
    expect(position(timed).fen()).toBe(position(game).fen());
    expect(timed.moves).toBe(game.moves);
    expect(timed.clocks).toEqual({ w: 300000, b: 300000 });
    expect(tick(timed, 10000).clocks).toEqual({ w: 299000, b: 300000 });
  });
  it('does not start the clock before the first move or while paused', () => {
    expect(changeTime(createGame(), '5', 9000).clockAt).toBeNull();
    const game = changeTime(pause(started(), 5000), '10', 9000);
    expect(tick(game, 999999).clocks).toEqual({ w: 600000, b: 600000 });
    expect(tick(resume(game, 1000000), 1001000).clocks.w).toBe(599000);
  });
  it('disabling the clock stops counting and reenabling resets both sides', () => {
    const timed = tick(changeTime(started(), '5', 2000), 7000);
    const untimed = changeTime(timed, 'none', 7000);
    expect(tick(untimed, 999999).timeout).toBeNull();
    expect(untimed.clockAt).toBeNull();
    expect(changeTime(untimed, '15', 999999).clocks).toEqual({ w: 900000, b: 900000 });
  });
  it('does not reset the clocks when applying the same control', () => {
    const timed = changeTime(started(), '5', 2000);
    expect(changeTime(timed, '5', 7000).clocks.w).toBe(295000);
  });
  it('rebases old snapshots and restores new-control snapshots on undo', () => {
    const timed = changeTime(started(), '10+5', 2000);
    const played = play(timed, 'g1f3', 4000);
    expect(played.clocks.w).toBe(603000);
    const back = undo(played, 5000);
    expect(back.clocks.w).toBe(598000);
    const earlier = undo(back, 6000);
    expect(earlier.settings.time).toBe('10+5');
    expect(earlier.clocks).toEqual({ w: 600000, b: 600000 });
    const restored = deserialize(serialize(earlier));
    expect(restored.settings.time).toBe('10+5');
    expect(restored.clocks).toEqual(earlier.clocks);
  });
  it('does not revive checkmate or an expired clock', () => {
    const ended = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(changeTime(ended, '5', 9999)).toBe(ended);
    const timed = changeTime(started(), '5', 2000);
    const expired = changeTime(timed, 'none', 302000);
    expect(expired.settings.time).toBe('5');
    expect(expired.timeout).toBe('w');
  });
});
