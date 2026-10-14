import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const release = resolve(fileURLToPath(new URL('../docs/', import.meta.url)));
const htmlFile = resolve(release, 'index.html');
let html = readFileSync(htmlFile, 'utf8');

function bundledFile(path) {
  const file = resolve(release, path);
  if (!file.startsWith(release + sep) || !path.startsWith('./assets/')) throw new Error(`Unexpected release asset: ${path}`);
  return readFileSync(file, 'utf8');
}

const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (entries.length !== 1) throw new Error('Expected exactly one bundled entry script.');
const javascript = bundledFile(entries[0][1]).replace(/<\/script/gi, '<\\/script');
html = html.replace(entries[0][0], '');
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g, (_, path) => {
  return `<style>${bundledFile(path).replace(/<\/style/gi, '\\3c /style')}</style>`;
});
// Module scripts are blocked on local file URLs. A classic IIFE runs after the DOM exists.
html = html.replace('</body>', () => `<script>${javascript}</script>\n  </body>`);
const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
const notices = readFileSync(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8');
html = html.replace('</head>', () => `<!--\n${(license + '\n' + notices).replace(/--/g, '- -')}\n-->\n</head>`);
if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"|type="module"/.test(html)) throw new Error('Release still requires external CSS or JavaScript.');
writeFileSync(htmlFile, html);
writeFileSync(new URL('../index.html', import.meta.url), html);

// Disable Jekyll processing: every file in docs is an ordinary static game asset.
writeFileSync(new URL('../docs/.nojekyll', import.meta.url), '');
copyFileSync(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), new URL('../docs/THIRD_PARTY_NOTICES.txt', import.meta.url));
copyFileSync(new URL('../LICENSE', import.meta.url), new URL('../docs/LICENSE', import.meta.url));
console.log('Standalone game saved to index.html and docs/index.html (no server or external assets needed).');
