import { _android, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to an emulator; this test replaces its current game.');
if (!process.env.ANDROID_HOME) throw new Error('Set ANDROID_HOME to the Android SDK.');
const adb = (...args) => execFileSync(join(process.env.ANDROID_HOME, 'platform-tools/adb'), ['-s', serial, ...args]);
const pkg = 'com.conanwhf.littlechess';
// Connect only after cold launch so Playwright cannot reuse an old WebView socket.
adb('shell', 'am', 'force-stop', pkg);
adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
const device = (await _android.devices()).find(d => d.serial() === serial);
if (!device) throw new Error(`Emulator not found: ${serial}`);

try {
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  const page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(15000);
  await page.getByTestId('menu').waitFor();
  await page.evaluate(() => {
    const Original = window.AudioContext;
    window.observedAudio = { context: null, buses: [] };
    window.AudioContext = class extends Original {
      constructor() { super(); window.observedAudio.context = this; }
      createGain() {
        const gain = super.createGain();
        if (window.observedAudio.buses.length < 2) {
          const analyser = this.createAnalyser();
          gain.connect(analyser);
          window.observedAudio.buses.push(analyser);
        }
        return gain;
      }
    };
  });
  if (await page.locator('html').getAttribute('lang') !== 'en') await page.getByTestId('language').click();
  const tool = name => page.locator('.board-toolbar:visible').getByRole('button', { name: new RegExp(name) });
  const board = page.getByTestId('board');
  const menu = async name => {
    await page.getByTestId('menu').click();
    await page.getByRole('button', { name, exact: true }).click();
  };
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const item of [board, page.locator('.board-toolbar'), page.getByTestId('clock-w'), page.getByTestId('clock-b'), page.getByTestId('menu')]) await expect(item).toBeInViewport({ ratio: 1 });
  };
  const move = async (from, to) => {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  };
  const fresh = async (mode, time = 'none') => {
    await page.getByTestId('new-game').click();
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
  await fits();
  await page.getByTestId('language').click();
  await expect(page.getByRole('heading', { name: '小小棋手' })).toBeVisible();
  await page.getByTestId('language').click();
  console.log('PASS: APK fits viewport and switches languages in Android WebView');
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
  await expect(board).toHaveAttribute('data-fen', / w .* 2$/);
  await tool('Undo').click();
  await expect(board).toHaveAttribute('data-fen', before);
  console.log('PASS: beginner AI reply and undo');

  await fresh('Two players', '5');
  await move('e2', 'e4');
  await expect(page.getByTestId('clock-b')).not.toHaveText('05:00');
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await page.waitForTimeout(1500);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await expect(page.locator('.pause-overlay').getByRole('button', { name: 'Resume' })).toBeVisible();
  const paused = await page.getByTestId('clock-b').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('clock-b')).toHaveText(paused);
  await page.locator('.pause-overlay').getByRole('button', { name: 'Resume' }).click();
  await move('e7', 'e5');
  console.log('PASS: local two-player clock, native background pause and resume');
  await screenshot('local-game');

  await menu('Piece guide');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  console.log('PASS: native back button closes help');

  await menu('Open source & privacy');
  await expect(page.locator('.legal-content pre')).toContainText('Emscripten 3.1.7');
  const source = await page.evaluate(async () => {
    const response = await fetch('/legal/stockfish-19.0.0-source.zip');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, prefix: Array.from(bytes.slice(0, 4)) };
  });
  expect(source).toEqual({ status: 200, prefix: [80, 75, 3, 4] });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('PASS: bundled source ZIP and offline build instructions are readable');

  await tool('Resume').click();
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
  await page.waitForTimeout(1500);
  await fits();
  await screenshot('rotated');
  console.log('PASS: rotated APK keeps board, clocks and toolbar completely in viewport');

  const original = await board.boundingBox();
  const originalFen = await board.getAttribute('data-fen');
  const size = adb('shell', 'wm', 'size').toString().match(/Physical size: (\d+)x(\d+)/);
  const width = Math.min(Number(size[1]), Number(size[2]));
  const height = Math.max(Number(size[1]), Number(size[2]));
  adb('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * .55)), String(Math.round(width / 2)), String(Math.round(height * .3)), '600');
  expect(await board.boundingBox()).toEqual(original);
  await expect(board).toHaveAttribute('data-fen', originalFen);
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  console.log('PASS: native touch swipe does not scroll or move pieces');

  await menu('Sound');
  await page.getByRole('checkbox', { name: 'Background music' }).check();
  await page.getByRole('checkbox', { name: 'Sound effects' }).check();
  const energy = index => page.evaluate(i => {
    const values = new Float32Array(2048);
    window.observedAudio.buses[i]?.getFloatTimeDomainData(values);
    return values.reduce((sum, value) => sum + value * value, 0);
  }, index);
  await expect.poll(() => energy(0)).toBeGreaterThan(.001);
  await page.getByRole('checkbox', { name: 'Background music' }).uncheck();
  await expect.poll(() => energy(0)).toBe(0);
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect.poll(() => energy(1), { intervals: [10, 20, 30] }).toBeGreaterThan(.001);
  await page.getByRole('checkbox', { name: 'Background music' }).check();
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await page.waitForTimeout(800);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await expect.poll(() => page.evaluate(() => window.observedAudio.context.state)).toBe('suspended');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('PASS: native music/effects produce audio samples and background stops sound even in sound settings');
} finally {
  await device.close();
}
