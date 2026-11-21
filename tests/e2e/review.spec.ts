import { expect, test, type Page } from '@playwright/test';
import { createGame, DEFAULT_SETTINGS, play, position, serialize, type Game } from '../../src/game';

const local = () => createGame({ ...DEFAULT_SETTINGS, mode: 'local' });
const sequence = (moves: string[], game = local()) => moves.reduce((g, move, i) => play(g, move, i * 1000), game);
const inject = async (page: Page, game: Game) => {
  await page.addInitScript(raw => { if (!localStorage.getItem('little-chess.game')) localStorage.setItem('little-chess.game', raw); }, serialize(game));
  await page.goto('/');
};
const move = async (page: Page, from: string, to: string) => {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
};
const review = async (page: Page) => {
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
};
const whiteMate = () => createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');

test('white victory animates a crowned king once, can reopen and repeats after undo', async ({ page }) => {
  await inject(page, whiteMate());
  await move(page, 'f7', 'g7');
  const result = page.getByTestId('game-over');
  await expect(result).toHaveAttribute('data-winner', 'w');
  await expect(result.getByRole('heading')).toHaveText('White wins!');
  await expect(result.locator('.victory-king img')).toHaveAttribute('src', '/pieces/wk.svg');
  await expect(result.locator('.victory-crown')).toBeVisible();
  await expect(result.locator('.victory-king')).toHaveCSS('animation-name', 'king-arrive');
  expect(await result.locator('.confetti i').first().evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('1');
  await page.waitForTimeout(750);
  await page.screenshot({ path: 'artifacts/white-victory.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(600);
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(result).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(result).toHaveCount(0);
  await move(page, 'f7', 'g7');
  await expect(result).toHaveAttribute('data-winner', 'w');
  await result.getByRole('button', { name: 'Play again' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(result).toHaveCount(0);
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', position(local()).fen());
});

test('black victory leads into a read-only replay and preserves the finished game', async ({ page }) => {
  const beforeMate = sequence(['f2f3', 'e7e5', 'g2g4']);
  await inject(page, beforeMate);
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume' }).click();
  await move(page, 'd8', 'h4');
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'b');
  await expect(page.locator('.victory-king img')).toHaveAttribute('src', '/pieces/bk.svg');
  const finalFen = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByTestId('review-step')).toContainText('0 / 4');
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.getByTestId('review-step')).toContainText('Qh4#');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', finalFen!);
  await page.getByRole('button', { name: 'Exit review' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', finalFen!);
  await expect(page.getByTestId('status')).toContainText('Black wins by checkmate');
  await expect(page.getByTestId('game-over')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'b');
});

for (const language of ['zh', 'en'] as const) test(`white checkmate updates the status after hints, dismissal and undo in ${language}`, async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('little-chess.language', value), language);
  const zh = language === 'zh';
  await inject(page, sequence(['f2f3', 'e7e5', 'g2g4']));
  await page.locator('.board-toolbar').getByRole('button', { name: zh ? '继续' : 'Resume', exact: true }).click();
  const status = page.getByTestId('status');
  await expect(status).toContainText(zh ? '黑方走棋' : 'Black to move');
  await page.locator('.board-toolbar').getByRole('button', { name: zh ? '提示' : 'Hint', exact: true }).click();
  await expect(page.getByTestId('candidate')).toHaveCount(3);
  await move(page, 'd8', 'h4');
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'b');
  await expect(status).toContainText(zh ? '黑方将死获胜' : 'Black wins by checkmate');
  await expect(page.getByTestId('candidate')).toHaveCount(0);
  await page.getByRole('button', { name: zh ? '关闭' : 'Close', exact: true }).click();
  await expect(status).toBeVisible();
  await expect(status).toContainText(zh ? '黑方将死获胜' : 'Black wins by checkmate');
  await page.locator('.board-toolbar').getByRole('button', { name: zh ? '悔棋' : 'Undo', exact: true }).click();
  await expect(status).toContainText(zh ? '黑方走棋' : 'Black to move');
  await move(page, 'd8', 'h4');
  await expect(status).toContainText(zh ? '黑方将死获胜' : 'Black wins by checkmate');
});

test('real computer checkmate replaces the thinking status with the result', async ({ page }) => {
  await inject(page, sequence(['f2f3', 'e7e5', 'g2g4'], createGame({ ...DEFAULT_SETTINGS, difficulty: 11 })));
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume', exact: true }).click();
  const status = page.getByTestId('status');
  await expect(status).toContainText('Computer is thinking');
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'b');
  await expect(status).toContainText('Black wins by checkmate');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(status).toContainText('Black wins by checkmate');
});

test('draw has two kings and no winner crown; zero-move replay is bounded', async ({ page }) => {
  await inject(page, createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, '7k/8/8/8/8/8/8/7K w - - 0 1'));
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'draw');
  await expect(page.locator('.draw-art img')).toHaveCount(2);
  await expect(page.locator('.victory-crown')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  for (const name of ['First position', 'Previous move', 'Auto play', 'Next move', 'Last position']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByTestId('review-step')).toContainText('0 / 0');
});

test('timeout shows the correct crowned winner', async ({ page }) => {
  const game = play(createGame({ ...DEFAULT_SETTINGS, mode: 'local', time: '5' }), 'e2e4', 0);
  game.clocks.b = 20;
  await inject(page, game);
  await page.locator('.board-toolbar').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('game-over')).toHaveAttribute('data-winner', 'w');
  await expect(page.getByTestId('game-over')).toContainText('White wins on time');
});

test('review steps, slider and auto play never alter the saved game or its clocks', async ({ page }) => {
  const game = sequence(['e2e4', 'e7e5', 'g1f3', 'b8c6'], createGame({ ...DEFAULT_SETTINGS, time: '5' }));
  await inject(page, game);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const saved = await page.evaluate(() => localStorage.getItem('little-chess.game'));
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous move' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', position({ ...game, moves: game.moves.slice(0, 1) }).fen());
  await expect(page.locator('[data-square="e4"]')).toBeDisabled();
  await expect(page.locator('.legal-target')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous move' }).click();
  await page.getByRole('button', { name: 'Auto play', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.getByTestId('review-step')).toContainText('1 / 4');
  await page.getByRole('button', { name: 'Pause replay' }).click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('review-step')).toContainText('1 / 4');
  await page.getByRole('button', { name: 'Auto play', exact: true }).click();
  await page.getByRole('slider', { name: 'Review position' }).fill('3');
  await expect(page.getByRole('button', { name: 'Auto play', exact: true })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByTestId('review-step')).toContainText('3 / 4');
  await page.getByRole('button', { name: 'Auto play', exact: true }).click();
  await page.clock.runFor(1100);
  await expect(page.getByTestId('review-step')).toContainText('4 / 4');
  await expect(page.getByRole('button', { name: 'Next move' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Auto play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Auto play', exact: true }).click();
  await expect(page.getByTestId('review-step')).toContainText('0 / 4');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('review-step')).toContainText('1 / 4');
  expect(await page.evaluate(() => localStorage.getItem('little-chess.game'))).toBe(saved);
  await page.getByRole('button', { name: 'Exit review' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', position(game).fen());
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => localStorage.getItem('little-chess.game'))).toBe(saved);
  await review(page);
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.reload();
  await expect(page.getByTestId('review')).toHaveCount(0);
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', position(game).fen());
  await expect(page.locator('.pause-overlay')).toBeVisible();
});

test('entering review cancels a pending computer move and exit stays paused', async ({ page }) => {
  await page.goto('/');
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await move(page, 'e2', 'e4');
  const fen = await page.getByTestId('board').getAttribute('data-fen');
  await review(page);
  const saved = await page.evaluate(() => localStorage.getItem('little-chess.game'));
  await page.getByRole('button', { name: 'Auto play', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(page.getByTestId('review-step')).toContainText('1 / 1');
  expect(await page.evaluate(() => localStorage.getItem('little-chess.game'))).toBe(saved);
  await page.getByRole('button', { name: 'Exit review' }).click();
  await page.clock.runFor(5000);
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen!);
  await expect(page.locator('.pause-overlay')).toBeVisible();
});

for (const scene of [
  { name: 'castling', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', moves: ['e1g1'] },
  { name: 'en passant', fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 2', moves: ['e5d6'] },
  { name: 'promotion', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', moves: ['a7a8q'] },
]) test(`replay restores ${scene.name} forward and backward`, async ({ page }) => {
  const game = sequence(scene.moves, createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, scene.fen));
  await inject(page, game);
  await review(page);
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', scene.fen);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', position(game).fen());
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', scene.fen);
});

for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 720 }]) test(`result and replay fit ${viewport.width}x${viewport.height} in both languages`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inject(page, sequence(['f7g7'], whiteMate()));
  await expect(page.locator('.victory-king')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: 'Review game', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  for (const zh of [false, true]) {
    if (zh) await page.getByTestId('language').click();
    await expect(page.getByTestId('board')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.review-controls')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.review-progress')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => [scrollX, scrollY, document.documentElement.scrollHeight <= innerHeight])).toEqual([0, 0, true]);
    await page.screenshot({ path: `artifacts/review-${viewport.width}-${zh ? 'zh' : 'en'}.png` });
  }
  await page.getByRole('button', { name: '退出复盘' }).click();
  await page.getByRole('button', { name: '结果', exact: true }).click();
  await expect(page.getByRole('heading', { name: '白方获胜！' })).toBeVisible();
  await expect(page.getByRole('button', { name: '复盘', exact: true })).toBeInViewport({ ratio: 1 });
});
