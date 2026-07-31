'use client';

import type { PriceHistory } from '@posto-barato/shared-types';
import { useId, useMemo, useState } from 'react';

import { money } from '@/lib/format';

import { Icon, type IconName } from './Icon';

/**
 * Histórico de preço do posto.
 *
 * Forma: evolução no tempo de uma única medida → linha com área de apoio.
 * Série única, então não há caixa de legenda — o título nomeia a série. A média
 * do município entra como LINHA DE REFERÊNCIA (tracejada, recessiva, rotulada
 * direto), não como segunda série: é um valor de contexto, não uma entidade
 * comparável ponto a ponto.
 *
 * A cor da série vem do token `chart-series`, que tem um passo próprio por tema
 * porque o verde do modo escuro é claro demais para virar marca de gráfico.
 * A tendência NUNCA colore a linha (cor segue a entidade, não o valor) — vai
 * como pílula com ícone + texto.
 */
const TREND: Record<PriceHistory['trend'], { label: string; icon: IconName; className: string }> = {
  UP: { label: 'Em alta', icon: 'trending_up', className: 'bg-error-container text-on-error-container' },
  DOWN: { label: 'Em queda', icon: 'trending_down', className: 'bg-primary-fixed text-on-primary-fixed' },
  STABLE: { label: 'Estável', icon: 'horizontal_rule', className: 'bg-surface-container text-on-surface-variant' },
};

const W = 320;
const H = 132;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

export function PriceHistoryChart({ history }: { history: PriceHistory }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const points = history.points;
  const trend = TREND[history.trend];

  const geometry = useMemo(() => {
    const values = points.map((p) => p.avg);
    const refs = history.municipalAvg !== null ? [history.municipalAvg] : [];
    const lo = Math.min(...values, ...refs);
    const hi = Math.max(...values, ...refs);
    // Faixa mínima para que oscilações de centavos não virem um serrote.
    const span = Math.max(hi - lo, 0.15);
    const mid = (hi + lo) / 2;
    const min = mid - span / 2;
    const max = mid + span / 2;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

    return { x, y, min, max };
  }, [points, history.municipalAvg]);

  if (points.length === 0) return null;

  const { x, y } = geometry;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const area =
    `${line} L${x(points.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;

  const last = points[points.length - 1]!;
  const active = hover !== null ? points[hover] : null;
  const refY = history.municipalAvg !== null ? y(history.municipalAvg) : null;

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (W - PAD.left - PAD.right) + PAD.left - PAD.left);
    const i = Math.round(((index / (W - PAD.left - PAD.right)) * (points.length - 1)));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <div className="pb-card p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <div>
          <p className="text-body-md text-on-surface-variant">
            Preço médio diário · {history.windowDays} dias
          </p>
          <p className="tabular mt-0.5 font-display text-price-display">{money(last.avg)}</p>
        </div>
        <span className={`pb-pill ${trend.className}`}>
          <Icon name={trend.icon} size={14} />
          {trend.label}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-md w-full touch-none"
        role="img"
        aria-label={`Preço médio nos últimos ${history.windowDays} dias, de ${money(
          points[0]!.avg,
        )} a ${money(last.avg)}. Tendência: ${trend.label.toLowerCase()}.`}
        onPointerMove={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--pb-chart-series))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--pb-chart-series))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grade recessiva: só horizontais, para leitura de nível. */}
        {[0, 0.5, 1].map((t) => {
          const gy = PAD.top + t * (H - PAD.top - PAD.bottom);
          return (
            <line
              key={t}
              x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy}
              stroke="rgb(var(--pb-outline-variant))" strokeWidth="1" opacity="0.5"
            />
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />

        {/* Referência: média do município. Tracejada e rotulada direto. */}
        {refY !== null && (
          <>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={refY} y2={refY}
              stroke="rgb(var(--pb-chart-reference))" strokeWidth="1.5" strokeDasharray="4 4"
            />
            <text
              x={W - PAD.right} y={refY - 5} textAnchor="end"
              className="fill-on-surface-variant" style={{ fontSize: 9, fontWeight: 700 }}
            >
              média da cidade
            </text>
          </>
        )}

        <path
          d={line}
          fill="none"
          stroke="rgb(var(--pb-chart-series))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Crosshair + marcador no ponto sob o cursor. */}
        {active && hover !== null && (
          <>
            <line
              x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="rgb(var(--pb-outline))" strokeWidth="1" opacity="0.6"
            />
            <circle
              cx={x(hover)} cy={y(active.avg)} r="5"
              fill="rgb(var(--pb-chart-series))"
              stroke="rgb(var(--pb-surface-container-lowest))" strokeWidth="2"
            />
          </>
        )}

        {/* Rótulo direto do último ponto — nunca um número em cada ponto. */}
        {!active && (
          <circle
            cx={x(points.length - 1)} cy={y(last.avg)} r="4"
            fill="rgb(var(--pb-chart-series))"
            stroke="rgb(var(--pb-surface-container-lowest))" strokeWidth="2"
          />
        )}

        <text
          x={PAD.left} y={H - 6}
          className="fill-on-surface-variant" style={{ fontSize: 9 }}
        >
          {formatDay(points[0]!.date)}
        </text>
        <text
          x={W - PAD.right} y={H - 6} textAnchor="end"
          className="fill-on-surface-variant" style={{ fontSize: 9 }}
        >
          {formatDay(last.date)}
        </text>
      </svg>

      <p aria-live="polite" className="mt-sm min-h-[1.25rem] text-label-bold font-normal text-on-surface-variant">
        {active
          ? `${formatDay(active.date)} · ${money(active.avg)}`
          : history.municipalAvg !== null
            ? `Média da cidade: ${money(history.municipalAvg)}`
            : ''}
      </p>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        className="mt-sm text-label-bold text-primary hover:underline"
      >
        {showTable ? 'Ocultar tabela' : 'Ver como tabela'}
      </button>

      {showTable && (
        <div className="mt-sm max-h-56 overflow-auto">
          <table className="w-full text-body-md">
            <caption className="sr-only">
              Preço médio diário nos últimos {history.windowDays} dias
            </caption>
            <thead className="sticky top-0 bg-surface-container-lowest text-label-bold
                              text-on-surface-variant">
              <tr>
                <th scope="col" className="py-1 text-left">Dia</th>
                <th scope="col" className="py-1 text-right">Mínimo</th>
                <th scope="col" className="py-1 text-right">Médio</th>
                <th scope="col" className="py-1 text-right">Máximo</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-outline-variant">
              {points.map((p) => (
                <tr key={p.date}>
                  <th scope="row" className="py-1 text-left font-normal">{formatDay(p.date)}</th>
                  <td className="py-1 text-right">{money(p.min)}</td>
                  <td className="py-1 text-right font-bold">{money(p.avg)}</td>
                  <td className="py-1 text-right">{money(p.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}
