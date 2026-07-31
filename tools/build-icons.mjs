/**
 * Gera o subset da fonte Material Symbols usada pelo projeto.
 *
 * A fonte variável completa tem ~4 MB. Subsetar por ligadura não adianta: o
 * fechamento do GSUB puxa todos os ícones, porque os nomes compartilham letras.
 * Então resolvemos cada ligadura para o codepoint do glifo e subsetamos por
 * codepoint, descartando o GSUB. Os eixos FILL e wght são preservados (as telas
 * usam `font-variation-settings: 'FILL' 1`); opsz e GRAD são fixados.
 *
 * Saídas:
 *   public/assets/fonts/material-symbols-outlined-<hash>.woff2   (protótipos)
 *   apps/web/public/assets/fonts/material-symbols-outlined-<hash>.woff2  (app)
 *   tools/icon-codepoints.json          — usado por build-screens.mjs
 *   apps/web/src/components/icons.generated.ts — mapa tipado do app
 *
 * Requisitos: python3 com fonttools e brotli (pip install fonttools brotli).
 * Uso: node tools/build-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// O Google Fonts decide o formato pelo User-Agent: sem a assinatura completa do
// Chrome ele devolve TTF em vez de WOFF2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Ícones usados pelo app Next.js. */
const APP_ICONS = [
  'account_circle', 'add', 'arrow_back', 'arrow_drop_down', 'arrow_forward',
  'bolt', 'bookmark_add', 'calculate', 'card_membership', 'check', 'check_circle',
  'chevron_left', 'chevron_right', 'close', 'compare_arrows', 'dark_mode',
  'database', 'delete', 'directions', 'directions_car', 'download', 'edit',
  'electric_bolt', 'electric_car', 'error', 'ev_charger', 'expand_more',
  'explore', 'favorite', 'filter_list', 'format_list_bulleted', 'help_outline',
  'history', 'home', 'horizontal_rule', 'info', 'light_mode', 'local_gas_station',
  'location_on', 'lock', 'mail', 'manage_accounts', 'map', 'menu', 'mic',
  'more_vert', 'my_location', 'navigation', 'notifications_active', 'open_in_new',
  'person', 'place', 'refresh', 'remove', 'savings', 'schedule', 'search',
  'sell', 'settings', 'share', 'speed', 'star', 'timer', 'trending_down',
  'trending_up', 'tune', 'verified', 'visibility', 'visibility_off', 'warning',
  'wifi_off', 'workspace_premium',
];

/** Ícones já usados pelas telas exportadas do Stitch (não podem sumir). */
const SCREEN_ICONS = (() => {
  const dir = path.join(ROOT, 'public/screens');
  const names = new Set();
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') {
        const html = fs.readFileSync(full, 'utf8');
        // Telas já processadas usam codepoints + data-icon="<nome>".
        for (const m of html.matchAll(/data-icon="([a-z0-9_]+)"/g)) names.add(m[1]);
        for (const m of html.matchAll(
          /<span[^>]*material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*<\/span>/g,
        )) names.add(m[1]);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return [...names];
})();

const icons = [...new Set([...APP_ICONS, ...SCREEN_ICONS])].sort();
console.log(`${icons.length} ícones (${APP_ICONS.length} do app, ${SCREEN_ICONS.length} das telas)`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-icons-'));
const curl = (url, out) =>
  execFileSync('curl', ['-sS', '-A', UA, '-o', out, url], { stdio: ['ignore', 'pipe', 'inherit'] });

// 1. CSS da fonte variável completa → URL do woff2.
const cssPath = path.join(tmp, 'font.css');
curl(
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block',
  cssPath,
);
const fontUrl = fs.readFileSync(cssPath, 'utf8').match(/https:\/\/[^)]+\.woff2/)?.[0];
if (!fontUrl) throw new Error('Não achei a URL do woff2 no CSS do Google Fonts.');

const fullPath = path.join(tmp, 'full.woff2');
curl(fontUrl, fullPath);
console.log(`fonte completa: ${(fs.statSync(fullPath).size / 1048576).toFixed(2)} MB`);

// 2. Resolve ligaduras → codepoints e subseta (fontTools).
fs.writeFileSync(path.join(tmp, 'names.txt'), icons.join('\n'));
const py = `
import json, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

full, tmp = sys.argv[1], sys.argv[2]
names = open(f"{tmp}/names.txt").read().split()

f = TTFont(full)
cmap = f.getBestCmap()
char2glyph = {chr(cp): g for cp, g in cmap.items()}
glyph2cp = {}
for cp, g in cmap.items():
    glyph2cp.setdefault(g, cp)

def subtables(lk):
    for st in lk.SubTable:
        yield st.ExtSubTable if st.__class__.__name__ == "ExtensionSubst" else st

lig = {}
for lk in f["GSUB"].table.LookupList.Lookup:
    for st in subtables(lk):
        if st.__class__.__name__ == "LigatureSubst":
            for first, ligs in st.ligatures.items():
                for L in ligs:
                    lig[(first, *L.Component)] = L.LigGlyph

resolved, missing = {}, []
for n in names:
    seq = tuple(char2glyph[c] for c in n if c in char2glyph)
    g = lig.get(seq)
    if g is None or g not in glyph2cp:
        missing.append(n)
    else:
        resolved[n] = glyph2cp[g]

if missing:
    print("IGNORADOS (não existem na fonte):", ", ".join(missing))

# opsz e GRAD não são usados pelo projeto; FILL e wght sim.
inst = instancer.instantiateVariableFont(TTFont(full), {"opsz": 24, "GRAD": 0}, inplace=True)
inst.flavor = None
inst.save(f"{tmp}/pinned.ttf")

subprocess.run([
    "pyftsubset", f"{tmp}/pinned.ttf",
    "--unicodes=" + ",".join(f"U+{v:04X}" for v in resolved.values()),
    "--layout-features=",
    "--no-hinting", "--desubroutinize",
    "--flavor=woff2",
    f"--output-file={tmp}/subset.woff2",
], check=True)

json.dump(dict(sorted(resolved.items())), open(f"{tmp}/codepoints.json", "w"), indent=1)
print(f"{len(resolved)} ícones no subset")
`;
fs.writeFileSync(path.join(tmp, 'build.py'), py);
execFileSync('python3', [path.join(tmp, 'build.py'), fullPath, tmp], { stdio: 'inherit' });

// 3. Instala o subset nos dois destinos, com hash de conteúdo no nome.
const subset = fs.readFileSync(path.join(tmp, 'subset.woff2'));
const codepoints = JSON.parse(fs.readFileSync(path.join(tmp, 'codepoints.json'), 'utf8'));
const hash = execFileSync('sha1sum', [path.join(tmp, 'subset.woff2')])
  .toString().slice(0, 8);
const fileName = `material-symbols-outlined-${hash}.woff2`;

for (const dir of ['public/assets/fonts', 'apps/web/public/assets/fonts']) {
  const target = path.join(ROOT, dir);
  if (!fs.existsSync(target)) continue;
  for (const old of fs.readdirSync(target)) {
    if (/^material-symbols-outlined-.*\.woff2$/.test(old)) fs.rmSync(path.join(target, old));
  }
  fs.writeFileSync(path.join(target, fileName), subset);

  const cssFile = path.join(target, 'fonts.css');
  const css = fs.readFileSync(cssFile, 'utf8').replace(
    /url\('\/assets\/fonts\/material-symbols-outlined-[^']*\.woff2'\)/,
    `url('/assets/fonts/${fileName}')`,
  );
  fs.writeFileSync(cssFile, css);
}
console.log(`${fileName} — ${(subset.length / 1024).toFixed(1)} KB`);

// 4. Mapas consumidos pelo build das telas e pelo componente Icon do app.
fs.writeFileSync(
  path.join(ROOT, 'tools/icon-codepoints.json'),
  JSON.stringify(codepoints, null, 1) + '\n',
);

const entries = Object.entries(codepoints)
  .map(([name, cp]) => `  '${name}': '\\u${cp.toString(16)}',`)
  .join('\n');
fs.writeFileSync(
  path.join(ROOT, 'apps/web/src/components/icons.generated.ts'),
  `/* Gerado por tools/build-icons.mjs — não edite à mão. */\n\n` +
    `/** Nome do ícone → codepoint. A fonte é subsetada por codepoint, então\n` +
    ` *  ligaduras (escrever "home" como texto) não funcionam mais. */\n` +
    `export const ICON_CODEPOINTS = {\n${entries}\n} as const;\n\n` +
    `export type IconName = keyof typeof ICON_CODEPOINTS;\n`,
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('icon-codepoints.json e icons.generated.ts atualizados');
