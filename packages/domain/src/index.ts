/**
 * Regras de domínio puras do Posto Barato.
 *
 * Ficam fora de `apps/api` porque não são exclusivas do servidor: o cliente
 * também precisa classificar frescor, calcular distância e estimar economia
 * (no modo de demonstração, e para cálculos locais como o comparador). Manter
 * uma implementação só evita que o número mostrado ao usuário divirja do que a
 * API calcula — o cálculo de economia é o núcleo do produto.
 *
 * Sem dependências além dos tipos compartilhados; nada de I/O, banco ou HTTP.
 */
export {
  ageMinutesFrom,
  classifyConfidence,
  classifyFreshness,
  humanizeAge,
  type FreshnessThresholds,
} from './freshness.js';

export { haversineKm, isValidLatitude, isValidLongitude, type LatLng } from './geo.js';

export {
  COMPARE_NOTICE,
  DEFAULT_LITERS,
  computeComparison,
  type CompareCandidate,
  type CompareParams,
} from './savings.js';

export {
  CARENCIA_HORAS,
  CARENCIA_MS,
  CICLO_ASAAS,
  CICLO_MESES,
  CobrancaAntesDoTrialError,
  PLANOS,
  TRIAL_DIAS,
  dataEmSaoPaulo,
  fimDoTrial,
  garantirCobrancaPermitida,
  isPlano,
  proximoVencimento,
  transicaoExternaPermitida,
  trialVigente,
  type Plano,
  type StatusAssinatura,
} from './billing-policy.js';

export {
  AssinaturaInativaError,
  assinaturaPermiteAcesso,
  type EstadoAssinatura,
} from './subscription-policy.js';

export {
  PRECOS_PADRAO,
  descreverPlano,
  listarPlanos,
  type DescricaoPlano,
  type TabelaPrecos,
} from './planos.js';
