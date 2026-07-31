/**
 * Copia a galeria de protótipos (`public/`) para dentro do export do app,
 * em `/prototipos/`.
 *
 * A galeria usa caminhos absolutos (`/screens/…`, `href="/"`), então eles são
 * reescritos para o novo prefixo. `/assets/…` NÃO é reescrito de propósito:
 * fontes e imagens são compartilhadas com o app e vivem na raiz, o que evita
 * baixar as mesmas fontes duas vezes.
 *
 * Uso: node tools/copy-prototipos.mjs [destino]
 * Padrão: apps/web/out/prototipos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public');
const DEST = path.resolve(ROOT, process.argv[2] ?? 'apps/web/out/prototipos');
const BASE = '/prototipos';

// O CSS dos protótipos precisa existir na raiz, porque as telas o pedem em
// `/assets/css/app.css` — caminho compartilhado com o app.
const SHARED_CSS_SRC = path.join(SRC, 'assets/css/app.css');
const SHARED_CSS_DEST = path.join(path.dirname(DEST), 'assets/css/app.css');

function rewrite(html) {
  return html
    .replace(/href="\/"/g, `href="${BASE}/"`)
    .replace(/(href|src)="\/screens\//g, `$1="${BASE}/screens/`)
    .replace(/href="\/404\.html"/g, `href="${BASE}/404.html"`);
}

let files = 0;
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      // `assets/` fica na raiz do site, compartilhado com o app.
      if (path.relative(SRC, src) === 'assets') continue;
      copy(src, dst);
    } else if (entry.name.endsWith('.html')) {
      fs.writeFileSync(dst, rewrite(fs.readFileSync(src, 'utf8')));
      files++;
    } else {
      fs.copyFileSync(src, dst);
      files++;
    }
  }
}

if (!fs.existsSync(path.dirname(DEST))) {
  throw new Error(`Destino não existe: ${path.dirname(DEST)} (rode o build do app antes).`);
}

fs.rmSync(DEST, { recursive: true, force: true });
copy(SRC, DEST);

fs.mkdirSync(path.dirname(SHARED_CSS_DEST), { recursive: true });
fs.copyFileSync(SHARED_CSS_SRC, SHARED_CSS_DEST);

console.log(`${files} arquivos copiados para ${path.relative(ROOT, DEST)}/ (+ assets/css/app.css)`);
