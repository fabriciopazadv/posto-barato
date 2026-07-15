# Cálculo de economia real (seção 12)

O comparador estima a economia entre 2 e 3 postos para um mesmo produto,
opcionalmente descontando o custo do deslocamento.

## Entradas
- `stationIds` (2–3), `productCode`
- `originLatitude` / `originLongitude` — origem para a distância (opcional)
- `desiredLiters` — volume desejado (opcional)
- `amountToSpend` — valor a gastar (opcional)
- `vehicleConsumptionKmPerLiter` — consumo do veículo (opcional)

## Fórmula

```
litros        = desiredLiters
                ?? (amountToSpend / maiorPreço)
                ?? 40                                 (padrão)

custoAbast_i  = litros × preço_i
custoDesloc_i = (2 × distânciaKm_i / consumo) × preço_i    (ida e volta)
custoTotal_i  = custoAbast_i + custoDesloc_i

baseline      = maior custoAbast entre as opções (sem deslocamento)
economiaLíq_i = baseline − custoTotal_i
economia%_i   = economiaLíq_i / baseline × 100
melhorOpção   = menor custoTotal_i
```

- O deslocamento só é considerado quando há **distância** (origem informada) e
  **consumo** do veículo. Caso contrário, `custoDesloc = 0` e a comparação
  considera apenas o preço do combustível.
- O deslocamento assume **ida e volta** (fator 2) e usa o próprio preço do posto
  de destino como custo do combustível gasto no trajeto.

## Aviso

O resultado sempre acompanha:

> "Cálculo estimado. Consumo, trânsito e preços podem variar."

Nunca é apresentado como garantia.
