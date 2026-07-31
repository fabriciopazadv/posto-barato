/**
 * Fonte única dos planos. Preço, ciclo e rótulos vivem aqui — a UI os recebe
 * por `GET /api/v1/billing/planos` em vez de repetir números escritos à mão, e
 * o valor cobrado é o mesmo que a tela anuncia.
 *
 * Diferente do mei-facil, os preços não são lidos de `process.env` aqui: este
 * pacote é puro e roda também no navegador. Quem tem a configuração tipada é a
 * API, que passa os valores vigentes. O valor escolhido é gravado em
 * `subscriptions.valor_centavos` no ato, então mudar o preço não altera
 * contratos já firmados.
 */

import { CICLO_MESES, PLANOS, type Plano } from './billing-policy.js';

export interface DescricaoPlano {
  id: Plano;
  titulo: string;
  valorCentavos: number;
  cicloMeses: number;
  /** Valor equivalente por mês, para comparação honesta entre os planos. */
  valorMensalCentavos: number;
  /** Economia percentual frente ao mensal — 0 no próprio mensal. */
  economiaPercent: number;
}

/** Preços padrão em centavos. Sobrescritíveis por env na API, sem deploy. */
export const PRECOS_PADRAO: Record<Plano, number> = {
  MENSAL: 999,
  SEMESTRAL: 4999,
  ANUAL: 8999,
};

const TITULOS: Record<Plano, string> = {
  MENSAL: 'Mensal',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export type TabelaPrecos = Partial<Record<Plano, number>>;

function centavos(plano: Plano, precos?: TabelaPrecos): number {
  const valor = precos?.[plano];
  return Number.isFinite(valor) && (valor as number) > 0
    ? (valor as number)
    : PRECOS_PADRAO[plano];
}

export function descreverPlano(plano: Plano, precos?: TabelaPrecos): DescricaoPlano {
  const cicloMeses = CICLO_MESES[plano];
  const valorCentavos = centavos(plano, precos);
  const valorMensalCentavos = Math.round(valorCentavos / cicloMeses);
  const mensal = centavos('MENSAL', precos);

  return {
    id: plano,
    titulo: TITULOS[plano],
    valorCentavos,
    cicloMeses,
    valorMensalCentavos,
    economiaPercent:
      plano === 'MENSAL' || mensal <= 0
        ? 0
        : Math.round(((mensal - valorMensalCentavos) / mensal) * 100),
  };
}

/** Do ciclo mais longo para o mais curto — o de melhor custo-benefício primeiro. */
export function listarPlanos(precos?: TabelaPrecos): DescricaoPlano[] {
  const ordem: Plano[] = ['ANUAL', 'SEMESTRAL', 'MENSAL'];
  return ordem
    .filter((p) => (PLANOS as readonly Plano[]).includes(p))
    .map((p) => descreverPlano(p, precos));
}
