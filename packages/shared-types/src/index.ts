/**
 * Contratos públicos compartilhados entre a API do Posto Barato e seus clientes
 * (mobile/web). Nenhum campo interno do coletor é representado aqui — apenas o
 * modelo público derivado descrito na seção 8 da especificação da Fase 2.
 */

/** Classificação de frescor do preço (limites configuráveis via env). */
export type PriceFreshness = 'RECENT' | 'MODERATE' | 'OLD' | 'EXPIRED';

/** Nível de confiança derivado do confidence_score da observação. */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Categorias de produto conhecidas (derivadas de products.category). */
export type ProductCategory = 'FUEL' | 'OTHER';

export interface Product {
  code: string;
  name: string;
  category: ProductCategory;
  unit: string;
}

export interface Municipality {
  municipality: string;
  state: string;
  stationCount: number;
}

/** Preço público de um produto em um posto (observação válida mais recente). */
export interface PublicPrice {
  productCode: string;
  productName: string;
  price: number;
  currency: string;
  unit: string;
  /** Data estimada da observação, quando disponível. */
  observedAt: string | null;
  /** Se observedAt é uma estimativa (a partir de texto relativo). */
  observedAtEstimated: boolean;
  /** Data em que o dado foi coletado para o Banco de Dados Posto Barato. */
  collectedAt: string;
  /** Minutos decorridos desde collectedAt no momento da resposta. */
  ageMinutes: number;
  freshness: PriceFreshness;
  confidence: ConfidenceLevel;
}

export interface PublicStationSummary {
  id: string;
  name: string;
  address: string;
  neighborhood: string | null;
  municipality: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  /** Distância em km a partir da origem informada na consulta, quando houver. */
  distanceKm: number | null;
  isDemo: boolean;
  /** Menor preço entre os produtos consultados, para ordenação/exibição. */
  lowestPrice: PublicPrice | null;
  prices: PublicPrice[];
}

export interface PublicStationDetail extends PublicStationSummary {
  postalCode: string | null;
  /** Sempre "Banco de Dados Posto Barato" — nunca a fonte interna. */
  source: string;
  notices: string[];
}

export interface PricePoint {
  date: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export type PriceTrend = 'UP' | 'DOWN' | 'STABLE';

export interface PriceHistory {
  stationId: string;
  productCode: string;
  windowDays: number;
  points: PricePoint[];
  min: number | null;
  max: number | null;
  avg: number | null;
  trend: PriceTrend;
  municipalAvg: number | null;
  municipalMin: number | null;
}

export interface PriceSummary {
  productCode: string;
  productName: string;
  municipality: string;
  state: string;
  min: number;
  avg: number;
  max: number;
  stationCount: number;
  collectedAt: string;
}

export interface CompareInput {
  stationIds: string[];
  productCode: string;
  originLatitude?: number;
  originLongitude?: number;
  desiredLiters?: number;
  amountToSpend?: number;
  vehicleConsumptionKmPerLiter?: number;
}

export interface CompareOption {
  stationId: string;
  stationName: string;
  pricePerLiter: number;
  distanceKm: number | null;
  /** Custo estimado do deslocamento até o posto (ida), quando calculável. */
  travelCost: number | null;
  liters: number;
  fuelCost: number;
  /** Economia líquida vs. a opção mais cara, já descontado o deslocamento. */
  netSavings: number;
  savingsPercent: number;
  freshness: PriceFreshness;
  isBestOption: boolean;
}

export interface CompareResult {
  productCode: string;
  options: CompareOption[];
  bestOptionStationId: string | null;
  notice: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
}

/**
 * Envelope das listas sem paginação (`/products`, `/municipalities`,
 * `/prices/summary`). Mesmo formato do campo `data` de `Paginated`, para que
 * acrescentar paginação a uma dessas rotas no futuro não quebre o cliente.
 *
 * Existir como tipo compartilhado é o que impede a divergência que havia aqui:
 * a API respondia `{ data: [...] }` e o app declarava esperar `[...]`, e nada
 * acusava — o app roda em modo demonstração, então o erro só apareceria quando
 * alguém apontasse `NEXT_PUBLIC_API_URL` para a API de verdade.
 */
export interface ListResponse<T> {
  data: T[];
}

/** Resposta de `GET /stations/:id/prices`. */
export interface StationPricesResponse {
  stationId: string;
  /** Sempre "Banco de Dados Posto Barato". */
  source: string;
  prices: PublicPrice[];
}

export interface PublicConfig {
  environment: string;
  demoMode: boolean;
  source: string;
  freshnessThresholdsHours: {
    recent: number;
    moderate: number;
    old: number;
  };
  maxPageSize: number;
  maxRadiusKm: number;
  defaultMunicipality: string;
  defaultState: string;
  notices: string[];
  features: Record<string, boolean>;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export const STATION_SORTS = [
  'lowest_price',
  'nearest',
  'best_savings',
  'most_recent',
] as const;
export type StationSort = (typeof STATION_SORTS)[number];

// ---------------------------------------------------------------------------
// Autenticação e assinatura do Premium (recorrente, com teste grátis)
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  /**
   * Estado da assinatura no momento da resposta. Vem junto com a conta para o
   * cliente não precisar de uma segunda chamada só para saber se pode usar os
   * recursos pagos — e para os dois nunca ficarem fora de sincronia.
   */
  subscription: SubscriptionSummary | null;
}

/** 'web' (padrão): refreshToken vai só em cookie HttpOnly, nunca no JSON (evita
 * exposição a XSS). 'mobile': sem cookie jar de navegador — refreshToken vem
 * no corpo da resposta para o app guardar em SecureStore. */
export type ClientType = 'web' | 'mobile';

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  clientType?: ClientType;
}

export interface LoginRequest {
  email: string;
  password: string;
  clientType?: ClientType;
}

export interface RefreshRequest {
  /** Obrigatório apenas para clientType 'mobile' (web usa o cookie). */
  refreshToken?: string;
  clientType?: ClientType;
}

/** accessToken sempre vai no corpo (Authorization: Bearer nas próximas
 * chamadas). refreshToken só aparece no corpo para clientType 'mobile' — no
 * web ele é setado como cookie HttpOnly e nunca é exposto ao JavaScript. */
export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
}

/** Ciclos de cobrança oferecidos. */
export type SubscriptionPlan = 'MENSAL' | 'SEMESTRAL' | 'ANUAL';

/**
 * Estado da assinatura.
 *
 * - `TRIAL` — dias grátis correndo; nenhuma cobrança existe no provedor.
 * - `TRIAL_EXPIRADO` — dias grátis usados sem plano escolhido; sem cobrança.
 * - `AGUARDANDO_PAGAMENTO` — 1ª cobrança emitida, ainda não compensada.
 * - `ATIVA` — em dia.
 * - `INADIMPLENTE` — cobrança vencida; há carência antes de cortar o acesso.
 * - `CANCELADA` — encerrada; o período já pago ainda vale (`acessoAte`).
 */
export type SubscriptionStatus =
  | 'TRIAL'
  | 'TRIAL_EXPIRADO'
  | 'AGUARDANDO_PAGAMENTO'
  | 'ATIVA'
  | 'CANCELADA'
  | 'INADIMPLENTE';

export interface PlanDescription {
  id: SubscriptionPlan;
  titulo: string;
  valorCentavos: number;
  cicloMeses: number;
  /** Equivalente por mês, para comparação honesta entre os ciclos. */
  valorMensalCentavos: number;
  /** Economia percentual frente ao mensal; 0 no próprio mensal. */
  economiaPercent: number;
}

/** Resposta de `GET /billing/planos` — a UI nunca anuncia preço próprio. */
export interface PlansResponse {
  planos: PlanDescription[];
  trialDias: number;
  carenciaHoras: number;
}

export interface SubscriptionSummary {
  status: SubscriptionStatus;
  /** Ciclo contratado; nulo enquanto ninguém escolheu. */
  plano: SubscriptionPlan | null;
  /** Ciclo escolhido durante o teste, cobrado só na virada. */
  planoEscolhido: SubscriptionPlan | null;
  valorCentavos: number | null;
  trialEndsAt: string;
  proximaCobrancaEm: string | null;
  ultimoPagamentoEm: string | null;
  canceladaEm: string | null;
  acessoAte: string | null;
  /** Resultado do gate agora: se os recursos pagos estão liberados. */
  acessoLiberado: boolean;
  /** Dias restantes de teste; 0 fora do teste. */
  diasRestantesTrial: number;
  /**
   * CPF/CNPJ do pagador já guardado, mascarado (`***.456.789-**`); nulo quando
   * ainda não há documento. A tela usa isto para saber se precisa pedi-lo — o
   * número inteiro nunca sai do servidor.
   */
  cpfCnpjMascarado: string | null;
}

export interface SubscribeRequest {
  plano: SubscriptionPlan;
  /**
   * CPF/CNPJ do pagador, exigido para assinar — inclusive durante o teste, em
   * que nada é cobrado. É o que o Asaas pede para criar o cliente na virada, e
   * pedi-lo aqui é o que dispensa uma segunda visita à tela quando o teste
   * acaba. Opcional apenas para quem já o informou antes.
   */
  cpfCnpj?: string;
}

/**
 * Assinar tem dois desfechos, decididos pelos dias gratuitos:
 * `plano_registrado` (teste vigente, nada cobrado ainda) ou `cobranca_criada`.
 */
export type SubscribeEffect = 'plano_registrado' | 'cobranca_criada';

export interface SubscribeResponse {
  efeito: SubscribeEffect;
  /** Quando a cobrança nasce (fim do teste) ou nasceu (agora). */
  cobrancaEm: string;
  /** true quando rodou sem provedor configurado, fora de produção. */
  simulado: boolean;
  subscription: SubscriptionSummary;
}

export interface CancelSubscriptionResponse {
  ok: boolean;
  /** Até quando o acesso ainda vale; nulo quando não há período a preservar. */
  acessoAte: string | null;
  subscription: SubscriptionSummary;
}
