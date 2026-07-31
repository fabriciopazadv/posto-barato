/**
 * Mapa ilustrativo do app.
 *
 * É SVG inline, não `<img>`, para herdar as variáveis de tema: como imagem
 * externa ele ficaria claro sobre a interface escura, e um filtro CSS deixaria
 * a arte embaçada. Substitui o mapa real até a integração com um provedor
 * (MAP_PROVIDER no .env.example).
 */
export function MapIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label="Mapa ilustrativo com uma rota e postos marcados"
    >
      <rect width="800" height="400" fill="rgb(var(--pb-surface-container-low))" />

      {/* Quadras */}
      <g fill="rgb(var(--pb-surface-container-high))">
        <rect x="40" y="30" width="180" height="120" rx="10" />
        <rect x="250" y="30" width="230" height="120" rx="10" />
        <rect x="510" y="30" width="250" height="80" rx="10" />
        <rect x="40" y="180" width="180" height="140" rx="10" />
        <rect x="250" y="180" width="230" height="140" rx="10" />
        <rect x="590" y="140" width="170" height="180" rx="10" />
        <rect x="40" y="350" width="290" height="60" rx="10" />
        <rect x="360" y="350" width="180" height="60" rx="10" />
        <rect x="570" y="350" width="190" height="60" rx="10" />
      </g>

      {/* Área verde */}
      <g fill="rgb(var(--pb-primary-fixed))" opacity="0.45">
        <rect x="510" y="128" width="250" height="18" rx="9" />
        <circle cx="150" cy="255" r="38" />
      </g>

      {/* Vias */}
      <g stroke="rgb(var(--pb-surface-container-lowest))" strokeWidth="18" fill="none" strokeLinecap="round">
        <path d="M232 0v400M492 0v400M0 165h800M0 335h800" />
      </g>
      <g stroke="rgb(var(--pb-surface-container-lowest))" strokeWidth="9" fill="none" opacity="0.85">
        <path d="M575 0v400M0 100h800" />
      </g>

      {/* Rota */}
      <path
        d="M120 370 120 250 355 250 355 120 640 120 640 40"
        stroke="rgb(var(--pb-chart-series))"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="120" cy="370" r="13" fill="rgb(var(--pb-surface-container-lowest))" />
      <circle cx="120" cy="370" r="7" fill="rgb(var(--pb-tertiary))" />

      {/* Destino */}
      <g transform="translate(620 8)">
        <path
          d="M20 0C9 0 0 9 0 20c0 12.5 20 28 20 28s20-15.5 20-28C40 9 31 0 20 0Z"
          fill="rgb(var(--pb-chart-series))"
        />
        <circle cx="20" cy="19" r="8" fill="rgb(var(--pb-surface-container-lowest))" />
      </g>

      {/* Postos ao longo do trajeto */}
      <g fill="rgb(var(--pb-surface-container-lowest))" strokeWidth="4">
        <circle cx="355" cy="165" r="10" stroke="rgb(var(--pb-primary-container))" />
        <circle cx="232" cy="250" r="10" stroke="rgb(var(--pb-primary-container))" />
        <circle cx="492" cy="120" r="10" stroke="rgb(var(--pb-tertiary-container))" />
      </g>
    </svg>
  );
}
