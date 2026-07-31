/**
 * Tokens de marca do Posto Barato, tipados.
 *
 * Fonte de verdade: `design-system/DESIGN.md` → `tokens.json` → (sync.mjs) →
 * `tokens.generated.ts` + `theme.css`.
 *
 * Clientes web consomem os tokens via preset Tailwind e `theme.css`. Este
 * módulo existe para código que precisa dos valores em runtime (cor de marcador
 * no mapa, `theme-color`) e para `apps/mobile`, que não terá Tailwind.
 */
import {
  colors as lightColors,
  darkColors,
  elevation,
  rounded,
  spacing,
  touchTargetMin,
  typography,
} from './tokens.generated.js';

export type ColorToken = keyof typeof lightColors;
export type TypographyToken = keyof typeof typography;
export type Theme = 'light' | 'dark';

export { darkColors, elevation, rounded, spacing, typography };
export const colors = lightColors;

/** Altura mínima de alvo de toque (DESIGN.md: usuários dirigindo). */
export const TOUCH_TARGET_MIN = touchTargetMin;

/**
 * Valor de um token de cor no tema pedido. No escuro, tokens não sobrescritos
 * caem para o valor claro — é o caso dos `*-fixed` do Material 3, que por
 * definição não mudam entre temas.
 */
export function color(token: ColorToken, theme: Theme = 'light'): string {
  if (theme === 'dark') {
    return darkColors[token] ?? lightColors[token];
  }
  return lightColors[token];
}
