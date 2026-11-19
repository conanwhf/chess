import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

await mkdir('public/engine', { recursive: true });
await mkdir('public/legal', { recursive: true });
await mkdir('public/pieces', { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await copyFile(`node_modules/stockfish/bin/${file}`, `public/engine/${file}`);
}

const packages = ['react', 'react-dom', 'scheduler', 'chess.js', 'lucide-react', '@capacitor/core', '@capacitor/android', '@capacitor/app', 'stockfish'];
const notices = [await readFile('THIRD_PARTY_NOTICES.md', 'utf8'), await readFile('public/legal/STOCKFISH-BUILD.txt', 'utf8')];
for (const name of packages) {
  const dir = join('node_modules', name);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  const files = (await readdir(dir)).filter(f => /^(license|copying)(\.|$)/i.test(f));
  if (!files.length) throw new Error(`Missing license: ${name}`);
  notices.push(`\n--- ${name} ${pkg.version} (${pkg.license}) ---\n`);
  for (const file of files) notices.push(await readFile(join(dir, file), 'utf8'));
}
await writeFile('public/legal/dependencies.txt', notices.join('\n'));
await copyFile('LICENSE', 'public/legal/GPL-3.0.txt');

// Original Staunton-inspired silhouettes with shared lighting and a broad base.
const silhouettes = {
  p: '<circle cx="32" cy="17" r="9"/><path d="M26 27 Q28 38 22 49 L42 49 Q36 38 38 27Z"/><path d="M23 27H41V31H23Z"/>',
  r: '<path d="M17 10H25V18H29V10H35V18H39V10H47V28H42L44 49H20L22 28H17Z"/><path d="M21 29H43" fill="none"/>',
  n: '<path d="M19 49Q21 40 28 34L26 29L20 33L13 28L18 20L27 11L29 5L36 10Q51 14 47 36L46 49Z"/><path d="M28 16L24 22M34 26Q43 30 37 43" fill="none"/><circle cx="29" cy="19" r="1.8" fill="EYE" stroke="none"/>',
  b: '<path d="M32 6Q47 18 42 28L35 35Q37 43 43 49H21Q28 41 29 35L22 28Q17 18 32 6Z"/><path d="M35 14L29 26" fill="none"/><path d="M24 35H40" fill="none"/>',
  q: '<path d="M17 18L24 26L26 13L32 25L38 13L40 26L47 18L42 37H22Z"/><path d="M24 37H40L43 49H21Z"/><circle cx="16" cy="15" r="3.5"/><circle cx="26" cy="10" r="3.5"/><circle cx="38" cy="10" r="3.5"/><circle cx="48" cy="15" r="3.5"/><path d="M23 34H41" fill="none"/>',
  k: '<path d="M29 4H35V10H41V16H35V23H29V16H23V10H29Z"/><path d="M20 25Q21 19 29 23L32 26L35 23Q43 19 44 25L40 37L43 49H21L24 37Z"/><path d="M24 37H40" fill="none"/>',
};
for (const color of ['w', 'b']) {
  const light = color === 'w';
  const stroke = light ? '#555e64' : '#111820';
  const stops = light ? ['#ffffff', '#f1f3f4', '#b7c0c5', '#e7ecef'] : ['#7b8791', '#3d4853', '#182129', '#515e68'];
  for (const [type, silhouette] of Object.entries(silhouettes)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76"><defs><linearGradient id="body"><stop stop-color="${stops[0]}"/><stop offset=".32" stop-color="${stops[1]}"/><stop offset=".78" stop-color="${stops[2]}"/><stop offset="1" stop-color="${stops[3]}"/></linearGradient></defs><ellipse cx="33" cy="69" rx="24" ry="4" fill="#13241c" opacity=".2"/><g fill="url(#body)" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${silhouette.replace('EYE', light ? '#25313a' : '#f3f6f8')}<path d="M20 49H44L47 55H17Z"/><path d="M17 55H47V61H17Z"/><path d="M17 61H47L52 67H12Z"/><path d="M13 67H51V69H13Z"/></g><path d="M19 57H44" stroke="${light ? '#fff' : '#93a2ac'}" stroke-width="1.2" opacity=".7"/></svg>`;
    await writeFile(`public/pieces/${color}${type}.svg`, svg + '\n');
  }
}
const knight = await readFile('public/pieces/wn.svg', 'utf8');
await writeFile('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="22" fill="#176f50"/><svg x="22" y="12" width="64" height="84" viewBox="0 0 64 76">${knight.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg></svg>\n`);
console.log('Prepared offline engine, original pieces, and dependency licenses.');
