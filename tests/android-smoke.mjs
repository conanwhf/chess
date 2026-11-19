import { _android, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to an emulator; this test replaces its current game.');
if (!process.env.ANDROID_HOME) throw new Error('Set ANDROID_HOME to the Android SDK.');
const adb = (...args) => execFileSync(join(process.env.ANDROID_HOME, 'platform-tools/adb'), ['-s', serial, ...args]);
const device = (await _android.devices()).find(d => d.serial() === serial);
if (!device) throw new Error(`Emulator not found: ${serial}`);
const pkg = 'com.conanwhf.littlechess';

try {
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  const page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(15000);
  const tool = name => page.locator('.board-toolbar:visible').getByRole('button', { name: new RegExp(name) });
  const board = page.getByTestId('board');
  const move = async (from, to) => {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  };
  const fresh = async (mode, time = 'none') => {
    await page.getByRole('button', { name: '设置与新棋局 / Settings & new game' }).click();
    await page.getByRole('button', { name: new RegExp(mode) }).click();
    await page.locator('#time').selectOption(time);
    await page.getByRole('button', { name: /Start game/ }).click();
  };
  const screenshot = async name => {
    await page.waitForTimeout(250);
    await writeFile(`artifacts/android-${name}.png`, adb('exec-out', 'screencap', '-p'));
  };
  await mkdir('artifacts', { recursive: true });
  await expect(page.getByRole('heading', { name: /Little Chess/ })).toBeVisible();
  console.log('PASS: APK renders bilingual game in Android WebView');
  console.log(await page.evaluate(() => navigator.userAgent));

  // This is an isolated emulator. Turn off its network before loading the engine.
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  await fresh('Vs computer');
  const before = await board.getAttribute('data-fen');
  await tool('Hint').click();
  await expect(page.getByTestId('candidate')).toHaveCount(3, { timeout: 20000 });
  await expect(page.getByTestId('hint-arrow')).toHaveCount(3);
  await expect(board).toHaveAttribute('data-fen', before);
  await screenshot('offline-hints');
  console.log('PASS: 3 real Stockfish alternatives without Wi-Fi or mobile data');
  await move('e2', 'e4');
  await expect(page.locator('.move-count')).toContainText('2');
  await tool('Undo').click();
  await expect(board).toHaveAttribute('data-fen', before);
  console.log('PASS: beginner AI reply and undo');

  await fresh('Two players', '5');
  await move('e2', 'e4');
  await expect(page.getByTestId('clock-b')).not.toHaveText('05:00');
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await page.waitForTimeout(1500);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await expect(page.getByRole('button', { name: /继续下棋/ })).toBeVisible();
  const paused = await page.getByTestId('clock-b').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('clock-b')).toHaveText(paused);
  await page.getByRole('button', { name: /继续下棋/ }).click();
  await move('e7', 'e5');
  console.log('PASS: local two-player clock, native background pause and resume');
  await screenshot('local-game');

  await page.getByRole('button', { name: '棋子帮助 / Piece guide' }).click();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  console.log('PASS: native back button closes help');

  await page.getByRole('button', { name: '开源声明 / Open source' }).click();
  await expect(page.locator('.legal-content pre')).toContainText('Emscripten 3.1.7');
  const source = await page.evaluate(async () => {
    const response = await fetch('/legal/stockfish-19.0.0-source.zip');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, prefix: Array.from(bytes.slice(0, 4)) };
  });
  expect(source).toEqual({ status: 200, prefix: [80, 75, 3, 4] });
  await page.getByRole('button', { name: '关闭 / Close' }).click();
  console.log('PASS: bundled source ZIP and offline build instructions are readable');

  await tool('Resume').click();
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot('rotated');
  console.log('PASS: rotation has no horizontal overflow');
  await tool('Pause').click();
} finally {
  await device.close();
}
