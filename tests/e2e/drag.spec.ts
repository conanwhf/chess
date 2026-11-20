import { expect, test, type Page } from '@playwright/test';
import { createGame, DEFAULT_SETTINGS, serialize } from '../../src/game';

const square = (page: Page, name: string) => page.locator(`[data-square="${name}"]`);
const center = async (page: Page, name: string) => {
  const box = (await square(page, name).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const drag = async (page: Page, from: string, to: string) => {
  const a = await center(page, from), b = await center(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
};
const localGame = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Two players' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
};

test('mouse drag follows the piece, moves once, mixes with clicks and works flipped', async ({ page }) => {
  await localGame(page);
  const a = await center(page, 'e2'), b = await center(page, 'e4');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.locator('.drag-piece img')).toHaveAttribute('src', /wp/);
  await expect(square(page, 'e4')).toHaveClass(/drop-target/);
  await expect(square(page, 'e3').locator('.legal-target')).toBeVisible();
  await page.screenshot({ path: 'artifacts/dragging-piece.png' });
  await page.mouse.up();
  await expect(square(page, 'e4')).toHaveAccessibleName('e4 White Pawn');
  await expect(square(page, 'e4')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.drag-piece')).toHaveCount(0);
  await square(page, 'e7').click(); await square(page, 'e5').click();
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume' }).click();
  await drag(page, 'g1', 'f3');
  await expect(square(page, 'f3')).toHaveAccessibleName('f3 White Knight');
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await expect(page.getByTestId('move-history')).toContainText('Nf3');
  await expect(page.locator('.move-row')).toHaveCount(2);
});

test('invalid drops, outside board, opponent and empty-square drags do not move; keyboard clicks remain usable', async ({ page }) => {
  await localGame(page);
  const board = page.getByTestId('board'), fen = await board.getAttribute('data-fen');
  for (const [from, to] of [['e2', 'e5'], ['e2', 'd2'], ['e7', 'e5'], ['e3', 'e4']]) {
    await drag(page, from, to);
    await expect(board).toHaveAttribute('data-fen', fen!);
  }
  const a = await center(page, 'e2');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(2, 2, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.drag-piece')).toHaveCount(0);
  await expect(board).toHaveAttribute('data-fen', fen!);
  await square(page, 'e2').focus(); await page.keyboard.press('Enter');
  await square(page, 'e4').focus(); await page.keyboard.press('Space');
  await expect(square(page, 'e4')).toHaveAccessibleName('e4 White Pawn');
});

test('real touch drag moves without scrolling; cancelled and multi-touch gestures never move', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await localGame(page);
  const board = page.getByTestId('board'), bounds = await board.boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const a = await center(page, 'e2'), b = await center(page, 'e4');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
  await expect(page.locator('.drag-piece')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(square(page, 'e4')).toHaveAccessibleName('e4 White Pawn');
  const fen = await board.getAttribute('data-fen');
  const c = await center(page, 'e7'), d = await center(page, 'e5');
  for (const multiple of [false, true]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...c, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...d, id: 1 }] });
    await expect(page.locator('.drag-piece')).toBeVisible();
    if (multiple) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...d, id: 1 }, { ...await center(page, 'a4'), id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: multiple ? 'touchEnd' : 'touchCancel', touchPoints: [] });
    await expect(page.locator('.drag-piece')).toHaveCount(0);
    await expect(board).toHaveAttribute('data-fen', fen!);
  }
  expect(await board.boundingBox()).toEqual(bounds);
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await square(page, 'e7').click(); await square(page, 'e5').click();
  await expect(square(page, 'e5')).toHaveAccessibleName('e5 Black Pawn');
});

for (const scenario of [
  { name: 'promotion', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', from: 'a7', to: 'a8', piece: 'White Knight' },
  { name: 'castling', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', from: 'e1', to: 'g1', piece: 'White King' },
  { name: 'en passant', fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 2', from: 'e5', to: 'd6', piece: 'White Pawn' },
]) test(`drag uses legal ${scenario.name} rules`, async ({ page }) => {
  const game = createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, scenario.fen);
  await page.addInitScript(raw => localStorage.setItem('little-chess.game', raw), serialize(game));
  await page.goto('/');
  await drag(page, scenario.from, scenario.to);
  if (scenario.name === 'promotion') {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(square(page, 'a7')).toHaveAccessibleName('a7 White Pawn');
    await page.getByRole('button', { name: 'Knight', exact: true }).click();
  }
  await expect(square(page, scenario.to)).toHaveAccessibleName(`${scenario.to} ${scenario.piece}`);
  if (scenario.name === 'castling') await expect(square(page, 'f1')).toHaveAccessibleName('f1 White Rook');
  if (scenario.name === 'en passant') await expect(square(page, 'd5')).toHaveAccessibleName('d5 Empty');
});

test('pausing during a drag cancels it; computer turn cannot be dragged', async ({ page }) => {
  await localGame(page);
  const board = page.getByTestId('board'), fen = await board.getAttribute('data-fen');
  const a = await center(page, 'e2'), b = await center(page, 'e4');
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.locator('.board-toolbar').getByRole('button', { name: 'Pause' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.drag-piece')).toHaveCount(0);
  await page.mouse.up();
  await expect(board).toHaveAttribute('data-fen', fen!);
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: 'Vs computer' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.clock.install();
  await drag(page, 'e2', 'e4');
  const thinking = await board.getAttribute('data-fen');
  await drag(page, 'e7', 'e5');
  await expect(board).toHaveAttribute('data-fen', thinking!);
  await expect(page.locator('.drag-piece')).toHaveCount(0);
});
