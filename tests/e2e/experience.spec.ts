import { expect, test, type Page } from '@playwright/test';
import { createGame, DEFAULT_SETTINGS, play, serialize } from '../../src/game';
import { LEVELS } from '../../src/difficulty';

const openMenu = async (page: Page, name: string) => {
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name, exact: true }).click();
};

test('system language, explicit switch, persistence and reset without changing position', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '小小棋手' })).toBeVisible();
  await expect(page.locator('[data-square="e1"]')).toHaveAccessibleName('e1 白 王');
  const initial = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByTestId('language').click();
  await expect(page.getByRole('heading', { name: 'Little Chess' })).toBeVisible();
  await expect(page.locator('[data-square="e1"]')).toHaveAccessibleName('e1 White King');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await openMenu(page, 'Use system language');
  await expect(page.getByRole('button', { name: '语言跟随系统' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', initial!);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await page.screenshot({ path: 'artifacts/compact-chinese.png' });
  await context.close();
});

test('invalid board swipe never scrolls or moves pieces; taps still work', async ({ page, context }) => {
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Two players' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  const board = page.getByTestId('board');
  const before = await board.boundingBox();
  const fen = await board.getAttribute('data-fen');
  const square = (s: string) => page.locator(`[data-square="${s}"]`);
  const start = (await square('e2').boundingBox())!;
  const end = (await square('e5').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (end.y + end.height / 2 - y) * i / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(board).toHaveAttribute('data-fen', fen!);
  expect(await board.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => [scrollX, scrollY, document.documentElement.scrollTop, document.body.scrollTop])).toEqual([0, 0, 0, 0]);
  await square('e2').click(); await square('e4').click();
  await expect(square('e4')).toHaveAccessibleName(/White Pawn/);
  await square('e7').click(); await square('e5').click();
  expect(await board.boundingBox()).toEqual(before);
  await expect(page.getByTestId('move-history')).toHaveCount(0);
  await openMenu(page, 'Move history');
  await expect(page.getByTestId('move-history')).toContainText('e4');
  await expect(page.getByTestId('move-history')).toContainText('e5');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await board.boundingBox()).toEqual(before);
});

test('long history and help scroll inside dialogs, never the game screen', async ({ page }) => {
  let game = createGame({ ...DEFAULT_SETTINGS, mode: 'local' });
  for (const move of 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 c6b8 d2d4 b8d7 b1d2 c7c5 d4d5 d7b6 d2f1 f6d7'.split(' ')) game = play(game, move, 0);
  await page.addInitScript(raw => localStorage.setItem('little-chess.game', raw), serialize(game));
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await openMenu(page, 'Move history');
  const table = page.getByTestId('move-history');
  expect(await table.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await table.evaluate(el => { el.scrollTop = 0; });
  await expect(table).toContainText('Nbd7');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openMenu(page, 'Piece guide');
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByText('Hint arrows are alternatives, not three moves in a row.')).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.board-toolbar')).toBeInViewport({ ratio: 1 });
});

// Observe real Web Audio output, without adding test hooks to the application.
test('effects produce samples with no music; legacy preferences persist and pause silences', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('little-chess.audio')) localStorage.setItem('little-chess.audio', JSON.stringify({ effects: true, music: true }));
    const Original = window.AudioContext;
    const observed = { context: null as AudioContext | null, buses: [] as AnalyserNode[], notes: 0 };
    Object.assign(window, { observedAudio: observed });
    window.AudioContext = class extends Original {
      constructor() { super(); observed.context = this; }
      createOscillator() { observed.notes++; return super.createOscillator(); }
      createGain() {
        const gain = super.createGain();
        if (observed.buses.length < 1) {
          const analyser = this.createAnalyser();
          analyser.fftSize = 2048;
          gain.connect(analyser);
          observed.buses.push(analyser);
        }
        return gain;
      }
    };
  });
  await page.goto('/');
  const energy = (bus: number) => page.evaluate(index => {
    const observed = (window as unknown as { observedAudio: { buses: AnalyserNode[] } }).observedAudio;
    const values = new Float32Array(2048);
    observed.buses[index]?.getFloatTimeDomainData(values);
    return values.reduce((sum, n) => sum + n * n, 0);
  }, bus);
  await openMenu(page, 'Sound');
  await expect(page.getByRole('checkbox', { name: 'Background music' })).toHaveCount(0);
  await expect.poll(() => energy(0)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { observedAudio: { notes: number } }).observedAudio.notes)).toBe(0);
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect.poll(() => energy(0), { intervals: [10, 20, 30] }).toBeGreaterThan(0.001);
  await page.getByRole('checkbox', { name: 'Sound effects' }).uncheck();
  await expect(page.getByRole('button', { name: 'Test sound' })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedAudio: { context: AudioContext } }).observedAudio.context.state)).toBe('suspended');
  await page.reload();
  await openMenu(page, 'Sound');
  await expect(page.getByRole('checkbox', { name: 'Sound effects' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Sound effects' }).check();
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect.poll(() => energy(0), { intervals: [10, 20, 30] }).toBeGreaterThan(0.001);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedAudio: { context: AudioContext } }).observedAudio.context.state)).toBe('suspended');
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => energy(0)).toBe(0);
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Two players' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  const notes = () => page.evaluate(() => (window as unknown as { observedAudio: { notes: number } }).observedAudio.notes);
  const move = async (from: string, to: string, count: number) => {
    const before = await notes();
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
    await expect.poll(notes).toBe(before + count);
  };
  await move('e2', 'e4', 1);
  await move('d7', 'd5', 1);
  await move('e4', 'd5', 2);
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await move('f2', 'f3', 1);
  await move('e7', 'e5', 1);
  await move('g2', 'g4', 1);
  await move('d8', 'h4', 4);
});

test('gear changes only the default level; new-game overrides never change the default', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('language')).toHaveText('中/En');
  await expect(page.getByTestId('menu')).toHaveAccessibleName('Settings');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', / w .* 2$/);
  const fen = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByTestId('menu').click();
  await page.locator('#default-difficulty').selectOption('5');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('player-b')).toContainText('Learner (classic)');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await page.reload();
  await expect(page.getByTestId('player-b')).toContainText('Learner (classic)');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await page.getByTestId('new-game').click();
  await expect(page.locator('#difficulty')).toHaveValue('5');
  await page.locator('#difficulty').selectOption('2');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByTestId('player-b')).toContainText('Thinker (classic)');
  await page.getByTestId('menu').click();
  await expect(page.locator('#default-difficulty')).toHaveValue('5');
  await page.screenshot({ path: 'artifacts/settings-default-level.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('new-game').click();
  await expect(page.locator('#difficulty')).toHaveValue('5');
});

test('six-level saves and numeric defaults migrate by profile without losing the position', async ({ page }) => {
  const game = play(play(createGame(), 'e2e4', 0), 'e7e5', 1000);
  const oldSave = JSON.stringify({ version: 1, game: { ...game, settings: { ...game.settings, difficulty: 0 } } });
  await page.addInitScript(raw => {
    if (!sessionStorage.getItem('imported-old-levels')) {
      localStorage.setItem('little-chess.game', raw);
      localStorage.setItem('little-chess.default-level', '3');
      sessionStorage.setItem('imported-old-levels', 'yes');
    }
  }, oldSave);
  const defaultIndex = LEVELS.findIndex(level => level.id === 'native-11');
  const currentIndex = LEVELS.findIndex(level => level.id === 'native-0');
  await page.goto('/');
  const fen = await page.getByTestId('board').getAttribute('data-fen');
  await expect(page.getByTestId('player-b')).toContainText('Engine starter');
  await page.getByTestId('menu').click();
  await expect(page.locator('#default-difficulty')).toHaveValue(String(defaultIndex));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await expect(page.getByTestId('player-b')).toContainText('Engine starter');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-chess.game')!))).toMatchObject({ version: 2, game: { settings: { difficulty: currentIndex }, moves: ['e2e4', 'e7e5'] } });
  await page.getByTestId('new-game').click();
  await expect(page.locator('#difficulty')).toHaveValue(String(defaultIndex));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('menu').click();
  await page.locator('#default-difficulty').selectOption('0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-chess.default-level')!))).toEqual({ version: 2, difficulty: 0 });
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
});

test('clock and settings switch timed/untimed in place; cancelling never resets time', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Two players' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  const fen = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByTestId('clock-b').click();
  await page.locator('#live-time').selectOption('5');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('clock-w')).toHaveText('05:00');
  await expect(page.getByTestId('clock-b')).toHaveText('05:00');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('clock-b')).not.toHaveText('05:00');
  await page.getByTestId('clock-w').click();
  const remaining = await page.getByTestId('clock-b').textContent();
  await page.locator('#live-time').selectOption('15');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('clock-b')).toHaveText(remaining!);
  await openMenu(page, 'Time control');
  await expect(page.locator('#live-time')).toHaveValue('5');
  await page.locator('#live-time').selectOption('10+5');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('clock-w')).toHaveText('10:00');
  await expect(page.getByTestId('clock-b')).toHaveText('10:00');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await page.getByTestId('clock-b').click();
  await page.locator('#live-time').selectOption('none');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('clock-w')).toHaveText('Untimed');
  await expect(page.getByTestId('clock-b')).toHaveText('Untimed');
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume' }).click();
  await page.locator('[data-square="e7"]').click();
  await page.locator('[data-square="e5"]').click();
  await page.locator('.board-toolbar').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await page.reload();
  await expect(page.getByTestId('clock-b')).toHaveText('Untimed');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
});

test('invalid default preference reports an error without discarding the saved game', async ({ page }) => {
  const game = play(createGame({ ...DEFAULT_SETTINGS, mode: 'local' }), 'e2e4', 0);
  await page.addInitScript(raw => {
    localStorage.setItem('little-chess.game', raw);
    localStorage.setItem('little-chess.default-level', '99');
  }, serialize(game));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Default level could not be read');
  await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
});
