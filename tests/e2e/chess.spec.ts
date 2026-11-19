import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';
import { createGame, DEFAULT_SETTINGS, serialize } from '../../src/game';

const board = (page: Page) => page.getByTestId('board');
const tool = (page: Page, english: string) => page.locator('.board-toolbar:visible').getByRole('button', { name: new RegExp(english) });
const square = (page: Page, s: string) => page.locator(`[data-square="${s}"]`);
const move = async (page: Page, from: string, to: string) => { await square(page, from).click(); await square(page, to).click(); };

async function newLocal(page: Page, time = 'none') {
  await page.getByRole('button', { name: '设置与新棋局 / Settings & new game' }).click();
  await page.getByRole('button', { name: /Two players/ }).click();
  await page.locator('#time').selectOption(time);
  await page.getByRole('button', { name: /Start game/ }).click();
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('offline assets, bilingual names and tablet layout', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Little Chess/ })).toBeVisible();
  await expect(square(page, 'e1')).toHaveAccessibleName(/王 King/);
  await expect(square(page, 'd1')).toHaveAccessibleName(/后 Queen/);
  await expect(page.getByTestId('player-b')).toContainText('First steps');
  expect(await page.locator('img').evaluateAll(imgs => imgs.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBe(true);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await expect(tool(page, 'Hint')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/tablet-landscape.png', fullPage: true });
});

test('real Stockfish supplies 3 virtual alternatives, focused arrow and clear', async ({ page }) => {
  const initial = await board(page).getAttribute('data-fen');
  await tool(page, 'Hint').click();
  await expect(page.getByTestId('candidate')).toHaveCount(3);
  await expect(page.getByTestId('hint-arrow')).toHaveCount(3);
  await expect(board(page)).toHaveAttribute('data-fen', initial!);
  for (const c of await page.getByTestId('candidate').allTextContents()) {
    const matches = c.match(/[a-h][1-8]/g)!;
    expect(() => new Chess().move(matches[0] + matches[1])).not.toThrow();
  }
  await page.getByTestId('candidate').nth(1).click();
  await expect(page.getByTestId('candidate').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'artifacts/tablet-hints.png', fullPage: true });
  await page.getByRole('button', { name: '清除提示 / Clear hints' }).click();
  await expect(page.getByTestId('hint-arrow')).toHaveCount(0);
});

test('default beginner computer replies, cannot be played by user, undo restores', async ({ page }) => {
  await square(page, 'e7').click();
  await expect(square(page, 'e7')).toHaveAttribute('aria-pressed', 'false');
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('move-history')).toContainText('e4');
  await expect(page.locator('.move-count')).toContainText('2');
  expect(new Chess((await board(page).getAttribute('data-fen'))!).turn()).toBe('w');
  await tool(page, 'Undo').click();
  await expect(board(page)).toHaveAttribute('data-fen', new Chess().fen());
});

test('local mode, invalid square, pause, resume, clock, flip and reload', async ({ page }) => {
  await newLocal(page, '5');
  await expect(page.getByTestId('clock-w')).toHaveText('05:00');
  await square(page, 'e2').click();
  await square(page, 'e5').click();
  await expect(board(page)).toHaveAttribute('data-fen', new Chess().fen());
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('clock-b')).not.toHaveText('05:00');
  await tool(page, 'Pause').click();
  const stopped = await page.getByTestId('clock-b').textContent();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId('clock-b')).toHaveText(stopped!);
  await page.getByRole('button', { name: /继续下棋/ }).click();
  await move(page, 'e7', 'e5');
  const fen = await board(page).getAttribute('data-fen');
  await tool(page, 'Flip').click();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-fen', fen!);
  await expect(page.getByRole('button', { name: /继续下棋/ })).toBeVisible();
});

test('settings cancel does not replace a game and all levels are selectable', async ({ page }) => {
  await newLocal(page);
  await move(page, 'e2', 'e4');
  const fen = await board(page).getAttribute('data-fen');
  await page.getByRole('button', { name: '设置与新棋局 / Settings & new game' }).click();
  await page.getByRole('button', { name: /Vs computer/ }).click();
  await expect(page.locator('#difficulty option')).toHaveCount(6);
  await page.locator('#difficulty').selectOption('5');
  await page.getByRole('button', { name: '关闭 / Close' }).click();
  await expect(board(page)).toHaveAttribute('data-fen', fen!);
});

test('highest level as white makes a real engine move when child plays black', async ({ page }) => {
  await page.getByRole('button', { name: '设置与新棋局 / Settings & new game' }).click();
  await page.locator('#difficulty').selectOption('5');
  await page.getByRole('button', { name: /Black · second/ }).click();
  await page.getByRole('button', { name: /Start game/ }).click();
  await expect(page.locator('.move-count')).toContainText('1');
  expect(new Chess((await board(page).getAttribute('data-fen'))!).turn()).toBe('b');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
});

test('guide, piece-name toggle, bundled license text', async ({ page }) => {
  await page.getByRole('checkbox', { name: /Piece names/ }).uncheck();
  await expect(page.locator('.piece-name')).toHaveCount(0);
  await page.getByRole('button', { name: '棋子帮助 / Piece guide' }).click();
  await expect(page.locator('.guide-row')).toHaveCount(6);
  await expect(page.locator('.piece-guide')).toContainText('En passant');
  await page.getByRole('button', { name: '关闭 / Close' }).click();
  await page.getByRole('button', { name: '开源声明 / Open source' }).click();
  await expect(page.locator('.legal-content pre')).toContainText('GNU GENERAL PUBLIC LICENSE');
  await expect(page.locator('.legal-content pre')).toContainText('BSD');
});

test('promotion offers all four pieces and never silently queens', async ({ page }) => {
  const g = createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, '7k/P7/8/8/8/8/8/7K w - - 0 1');
  await page.addInitScript(raw => localStorage.setItem('little-chess.game', raw), serialize(g));
  await page.reload();
  await move(page, 'a7', 'a8');
  await expect(page.getByRole('dialog', { name: /Choose promotion/ })).toBeVisible();
  await expect(page.locator('.promotion-options button')).toHaveCount(4);
  await page.getByRole('button', { name: /马 Knight/ }).click();
  await expect(square(page, 'a8')).toHaveAccessibleName(/Knight/);
});

test('cancels stale hints on a move and engine failure is visible', async ({ page }) => {
  await newLocal(page);
  await tool(page, 'Hint').click();
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('candidate')).toHaveCount(0);
  await page.route('**/engine/*.js', route => route.abort());
  await tool(page, 'Hint').click();
  await expect(page.getByRole('alert')).toContainText(/Engine failed/);
  await expect(page.getByTestId('candidate')).toHaveCount(0);
});

test('no external requests with internet destinations blocked', async ({ page, context }) => {
  const externals: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) externals.push(request.url()); });
  // Block internet destinations, but allow the local asset origin served inside the APK.
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.reload();
  await page.getByRole('button', { name: /继续下棋/ }).click();
  await tool(page, 'Hint').click();
  await expect(page.getByTestId('candidate')).toHaveCount(3);
  await move(page, 'e2', 'e4');
  await expect(page.locator('.move-count')).toContainText('2');
  expect(externals).toEqual([]);
});

test('hint returns only one alternative when only one legal move exists', async ({ page }) => {
  const g = createGame({ ...DEFAULT_SETTINGS, mode: 'local' }, '8/8/8/8/8/5kr1/8/7K w - - 0 1');
  await page.addInitScript(raw => localStorage.setItem('little-chess.game', raw), serialize(g));
  await page.reload();
  await tool(page, 'Hint').click();
  await expect(page.getByTestId('candidate')).toHaveCount(1);
  await expect(page.getByTestId('candidate')).toContainText('h1');
  await expect(page.getByTestId('hint-arrow')).toHaveCount(1);
});

for (const viewport of [{ width: 360, height: 800 }, { width: 800, height: 1280 }, { width: 1440, height: 1000 }]) {
  test(`responsive layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const sizes = await page.locator('.square').evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
    expect(Math.min(...sizes)).toBeGreaterThan(35);
    await expect(tool(page, 'Hint')).toBeVisible();
    await page.getByRole('button', { name: '设置与新棋局 / Settings & new game' }).click();
    await expect(page.getByRole('button', { name: /Start game/ })).toBeVisible();
    await page.getByRole('button', { name: '关闭 / Close' }).click();
    await tool(page, 'Resume').click();
    await page.screenshot({ path: `artifacts/layout-${viewport.width}.png`, fullPage: true });
    const overflow = await page.locator('button, .bi, .piece-name').evaluateAll(els => els.filter(el => {
      const e = el as HTMLElement;
      return e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 2;
    }).map(e => e.textContent));
    expect(overflow).toEqual([]);
  });
}
