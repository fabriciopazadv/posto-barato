import { ICON_CODEPOINTS, type IconName } from './icons.generated';

export type { IconName };

interface IconProps {
  name: IconName;
  /** Ícone preenchido (eixo FILL da fonte variável) — use para estado ativo. */
  filled?: boolean;
  /** Tamanho em px. O padrão da fonte é 24. */
  size?: number;
  className?: string;
  /**
   * Rótulo para leitor de tela. Sem ele, o ícone é decorativo e fica oculto —
   * o que é o certo quando o texto ao lado já descreve a ação.
   */
  label?: string;
}

/**
 * Ícone Material Symbols do subset local (74 glifos, 16 KB).
 *
 * A fonte é subsetada por codepoint, então a ligadura por nome ("home" como
 * texto) não funciona — o codepoint vem do mapa gerado por tools/build-icons.mjs.
 */
export function Icon({ name, filled = false, size = 24, className = '', label }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none leading-none ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
      }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {ICON_CODEPOINTS[name]}
    </span>
  );
}
