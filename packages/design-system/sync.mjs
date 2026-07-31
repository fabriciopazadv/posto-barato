/**
 * Gera `theme.css` a partir de `tokens.json`.
 *
 * O preset Tailwind referencia `rgb(var(--pb-<token>) / <alpha>)`, então as
 * variáveis precisam guardar os canais separados ("0 108 73"), não "#006c49".
 *
 * Uso: pnpm --filter @posto-barato/design-system sync
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(fs.readFileSync(path.join(DIR, 'tokens.json'), 'utf8'));

const channels = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(' ');
};

const block = (colors, indent = '  ') =>
  Object.entries(colors)
    .map(([name, hex]) => `${indent}--pb-${name}: ${channels(hex)};`)
    .join('\n');

// Tokens que não existem no tema escuro herdam o valor do claro.
const dark = { ...tokens.colors, ...tokens.darkColors };

// Cores de gráfico entram como `chart-*`, com o passo próprio de cada tema.
const chartLight = {
  'chart-series': tokens.chart.series,
  'chart-reference': tokens.chart.reference,
};
const chartDark = {
  'chart-series': tokens.chart['series-dark'],
  'chart-reference': tokens.chart['reference-dark'],
};

const css = `/* Gerado por sync.mjs a partir de tokens.json — não edite à mão. */
/* Fonte de verdade dos valores: design-system/DESIGN.md */

:root {
${block({ ...tokens.colors, ...chartLight })}
  --pb-touch-target: ${tokens.touchTargetMin};
}

.dark {
${block({ ...dark, ...chartDark })}
}

/* Respeita a preferência do sistema quando o usuário não escolheu um tema. */
@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.dark) {
${block({ ...dark, ...chartDark }, '    ')}
  }
}
`;

fs.writeFileSync(path.join(DIR, 'theme.css'), css);

// Também emite os tokens como módulo TS. Importar JSON de dentro de um pacote
// com `verbatimModuleSyntax` + NodeNext exigiria import attributes, que o
// bundler do Next e o tsc discordam sobre como tratar — gerar TS evita o atrito.
const ts = `/* Gerado por sync.mjs a partir de tokens.json — não edite à mão. */
/* Fonte de verdade dos valores: design-system/DESIGN.md */

export const colors = ${JSON.stringify(tokens.colors, null, 2)} as const;

export const darkColors: Record<string, string> = ${JSON.stringify(tokens.darkColors, null, 2)};

export const typography = ${JSON.stringify(tokens.typography, null, 2)} as const;

export const spacing = ${JSON.stringify(tokens.spacing, null, 2)} as const;

export const rounded = ${JSON.stringify(tokens.rounded, null, 2)} as const;

export const elevation = ${JSON.stringify(tokens.elevation, null, 2)} as const;

export const touchTargetMin = ${JSON.stringify(tokens.touchTargetMin)};
`;
fs.writeFileSync(path.join(DIR, 'src/tokens.generated.ts'), ts);

console.log(
  `theme.css + src/tokens.generated.ts gerados — ` +
    `${Object.keys(tokens.colors).length} tokens claros, ` +
    `${Object.keys(tokens.darkColors).length} sobrescritos no escuro`,
);
