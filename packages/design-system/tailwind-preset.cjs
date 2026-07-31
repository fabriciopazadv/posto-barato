/**
 * Preset Tailwind do Posto Barato.
 *
 * As cores apontam para custom properties (`--pb-<token>`) em vez de valores
 * fixos, para que o tema claro/escuro seja trocado por CSS — sem recompilar e
 * sem duplicar cada classe com `dark:`. Os valores das variáveis vivem em
 * `theme.css`, gerado por `sync.mjs` a partir de `tokens.json`.
 *
 * Fonte de verdade dos tokens: design-system/DESIGN.md
 */
const tokens = require('./tokens.json');

/** `#006c49` → `0 108 73`, para usar com `rgb(var(--x) / <alpha>)`. */
const colorNames = [
  ...Object.keys(tokens.colors),
  'chart-series',
  'chart-reference',
];
const colorVars = Object.fromEntries(
  colorNames.map((name) => [
    name,
    `rgb(var(--pb-${name}) / <alpha-value>)`,
  ]),
);

const fontSize = Object.fromEntries(
  Object.entries(tokens.typography).map(([name, t]) => [
    name,
    [t.fontSize, {
      lineHeight: t.lineHeight,
      fontWeight: t.fontWeight,
      ...(t.letterSpacing ? { letterSpacing: t.letterSpacing } : {}),
    }],
  ]),
);

const fontFamily = Object.fromEntries(
  Object.entries(tokens.typography).map(([name, t]) => [
    name,
    t.fontFamily === 'Manrope'
      ? ['Manrope', 'Inter', 'system-ui', 'sans-serif']
      : ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  ]),
);

module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: colorVars,
      fontFamily: {
        ...fontFamily,
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize,
      // Grade de 8pt do DESIGN.md (4px só para micro-ajustes).
      spacing: tokens.spacing,
      borderRadius: tokens.rounded,
      boxShadow: {
        card: tokens.elevation.card,
        floating: tokens.elevation.floating,
        sheet: tokens.elevation.sheet,
      },
      minHeight: { touch: tokens.touchTargetMin },
      minWidth: { touch: tokens.touchTargetMin },
      backdropBlur: { sheet: '12px' },
      keyframes: {
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        pulse: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
      },
      animation: {
        'sheet-up': 'sheet-up .28s cubic-bezier(.32,.72,0,1)',
        'fade-in': 'fade-in .2s ease-out',
      },
    },
  },
};
