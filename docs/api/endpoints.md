# API Posto Barato — Endpoints (v1)

Base: `/api/v1` · Documentação interativa (Swagger UI): `/docs` ·
OpenAPI JSON: `/docs/json`

Os endpoints de catálogo, postos e preços são **públicos e somente-leitura**.
Autenticação (`/auth/*`) e assinatura (`/billing/*`) estão documentadas em
[`docs/architecture/auth-billing.md`](../architecture/auth-billing.md).
Favoritos, alertas e veículos virão nos próximos incrementos.

## Sistema
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Liveness (não toca dependências) |
| GET | `/ready` | Readiness (verifica o banco) |

## Formato das respostas

Listas vêm em envelope, nunca como array puro:

| Rota | Formato |
|---|---|
| `/products`, `/municipalities`, `/prices/summary` | `{ "data": [...] }` (`ListResponse<T>`) |
| `/stations`, `/prices/latest` | `{ "data": [...], "page", "limit", "total", "hasNextPage" }` (`Paginated<T>`) |
| `/stations/:id/prices` | `{ "stationId", "source", "prices": [...] }` (`StationPricesResponse`) |
| `/stations/:id`, `/prices/compare`, `/stations/:id/history` | objeto direto |

Os três formatos são tipos de `@posto-barato/shared-types`, importados pela API
e pelo PWA. É o que impede a divergência que existia aqui: a API respondia em
envelope e o app declarava esperar array puro, e nada acusava — o app roda em
modo demonstração, então as quatro rotas só quebrariam quando alguém apontasse
`NEXT_PUBLIC_API_URL` para a API real.

## Catálogo
| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/config` | Configuração pública (limites, faixas de frescor, avisos, flags) |
| GET | `/products` | Lista de produtos (combustíveis) |
| GET | `/municipalities` | Municípios com dados disponíveis |

## Postos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/stations` | Lista/pesquisa com proximidade, filtros, ordenação e paginação |
| GET | `/stations/:id` | Detalhes de um posto |
| GET | `/stations/:id/prices` | Preços mais recentes do posto |
| GET | `/stations/:id/history` | Histórico agregado por dia (7/30/90) |

### Parâmetros de `GET /stations`
`latitude`, `longitude`, `radiusKm` (≤ `MAX_RADIUS_KM`), `municipality`,
`state`, `product`, `minPrice`, `maxPrice`, `updatedWithinHours`,
`sort` (`lowest_price` | `nearest` | `best_savings` | `most_recent`),
`page`, `limit` (≤ `MAX_PAGE_SIZE`).

Regras: `latitude`/`longitude` andam juntas; `radiusKm` e `sort=nearest` exigem
origem. A distância (km) só é calculada quando há origem.

`updatedWithinHours` e `sort=most_recent` usam a **data de negócio** da
observação (quando o preço valia na bomba), não a data de coleta.

### Frescor e preço vencido

`freshness` combina duas coisas: as faixas de tempo configuráveis
(`RECENT`/`MODERATE`/`OLD`/`EXPIRED`, medidas desde a data de negócio) e o
vencimento declarado pela fonte. Quando a fonte marca a observação como vencida,
a resposta é `EXPIRED` mesmo que pelo relógio o preço fosse recente. Preços
vencidos continuam sendo devolvidos — com aviso em `notices` no detalhe do posto
—, porque omiti-los faria o posto desaparecer do mapa.

## Preços
| Método | Rota | Descrição |
|---|---|---|
| GET | `/prices/latest` | Postos por município ordenados pelo menor preço |
| GET | `/prices/summary` | min/média/max por produto no município |
| POST | `/prices/compare` | Comparação de economia entre 2–3 postos |

### Corpo de `POST /prices/compare`
```json
{
  "stationIds": ["<uuid>", "<uuid>"],
  "productCode": "GASOLINA_COMUM",
  "originLatitude": -16.47,
  "originLongitude": -54.63,
  "desiredLiters": 40,
  "amountToSpend": 200,
  "vehicleConsumptionKmPerLiter": 12
}
```
Ver a fórmula em [`docs/product/calculo-economia.md`](../product/calculo-economia.md).

## Formato de erro
```json
{ "error": { "code": "NOT_FOUND", "message": "Posto não encontrado", "requestId": "…" } }
```
Códigos: `VALIDATION_ERROR` (400), `BAD_REQUEST` (400), `NOT_FOUND` (404),
`RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

## Assinatura

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/billing/planos` | — | Planos, dias de teste e carência |
| GET | `/billing/subscription` | access token | Estado da assinatura |
| POST | `/billing/subscription` | access token | Escolhe o plano ou cria a cobrança |
| DELETE | `/billing/subscription` | access token | Cancela |
| POST | `/billing/webhook` | token do Asaas | Sinal do provedor |
| POST | `/billing/cron` | `CRON_SECRET` | Virada do teste + reconciliação |

Recurso pago sem assinatura em dia responde **402** com código
`SUBSCRIPTION_REQUIRED`.

`POST /billing/subscription` recebe `{ "plano": "MENSAL", "cpfCnpj": "…" }`. O
documento é exigido **também durante o teste grátis**, quando nada é cobrado: é
o dado que o Asaas pede para criar o cliente, e tê-lo guardado é o que permite
ao cron transformar o fim do teste em cobrança sem uma segunda visita do
usuário. Só pode ser omitido por quem já o informou antes. CPF/CNPJ ausente ou
com dígito verificador errado responde **400** (`BAD_REQUEST`).

`GET /billing/subscription` devolve `cpfCnpjMascarado` (`***.982.247-**`, ou
`null`) para a tela saber se ainda precisa pedir o documento — o número inteiro
nunca sai do servidor.
