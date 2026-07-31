'use client';

import type { CompareResult } from '@posto-barato/shared-types';
import { useEffect, useMemo, useState } from 'react';

import { FuelChips } from '@/components/FuelChips';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, Notices, SkeletonList } from '@/components/ui';
import { compareStations, getProducts, getStations } from '@/lib/data';
import { distance, money, percent, pricePerUnit } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

const MAX_SELECTION = 3;

export default function ComparadorPage() {
  const { product, setProduct, origin, vehicles } = usePrefs();
  const vehicle = vehicles[0];

  const [selected, setSelected] = useState<string[]>([]);
  const [liters, setLiters] = useState(40);
  const [consumption, setConsumption] = useState(vehicle?.consumption ?? 10.5);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const products = useAsync(() => getProducts(), []);
  const stations = useAsync(
    () =>
      getStations({
        product,
        latitude: origin?.latitude,
        longitude: origin?.longitude,
        sort: 'lowest_price',
        limit: 20,
      }),
    [product, origin?.latitude, origin?.longitude],
  );

  const list = useMemo(() => stations.data?.data ?? [], [stations.data]);

  // Ao trocar de combustível, a seleção antiga pode não ter mais o produto.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => list.some((s) => s.id === id)).slice(0, MAX_SELECTION));
    setResult(null);
  }, [list]);

  const toggle = (id: string) => {
    setResult(null);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= MAX_SELECTION
          ? prev
          : [...prev, id],
    );
  };

  const run = async () => {
    setComparing(true);
    setCompareError(null);
    try {
      setResult(
        await compareStations({
          stationIds: selected,
          productCode: product,
          originLatitude: origin?.latitude,
          originLongitude: origin?.longitude,
          desiredLiters: liters,
          vehicleConsumptionKmPerLiter: consumption,
        }),
      );
    } catch {
      setCompareError('Não foi possível calcular a comparação agora.');
    } finally {
      setComparing(false);
    }
  };

  const best = result?.options.find((o) => o.isBestOption) ?? null;

  return (
    <>
      <TopBar title="Comparar" />

      <div className="space-y-lg py-md">
        <div className="px-container-margin">
          <h2 className="font-display text-headline-lg-mobile">Vale a pena desviar?</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Escolha até {MAX_SELECTION} postos. O cálculo considera o preço e o custo de ir
            até lá e voltar.
          </p>
        </div>

        {products.data && (
          <div className="px-container-margin">
            <FuelChips products={products.data} selected={product} onSelect={setProduct} />
          </div>
        )}

        <section className="px-container-margin">
          <h3 className="mb-gutter font-display text-headline-md">Seus parâmetros</h3>
          <div className="pb-card grid grid-cols-2 gap-md p-md">
            <label className="block">
              <span className="text-label-bold font-normal text-on-surface-variant">
                Litros desejados
              </span>
              <input
                type="number" inputMode="decimal" min={1} max={200} value={liters}
                onChange={(e) => { setLiters(Number(e.target.value)); setResult(null); }}
                className="pb-input mt-1 tabular"
              />
            </label>
            <label className="block">
              <span className="text-label-bold font-normal text-on-surface-variant">
                Consumo (km/l)
              </span>
              <input
                type="number" inputMode="decimal" min={1} max={40} step={0.1} value={consumption}
                onChange={(e) => { setConsumption(Number(e.target.value)); setResult(null); }}
                className="pb-input mt-1 tabular"
              />
            </label>
          </div>
        </section>

        <section className="px-container-margin">
          <div className="mb-gutter flex items-baseline justify-between gap-sm">
            <h3 className="font-display text-headline-md">Postos</h3>
            <span className="text-label-bold font-normal text-on-surface-variant">
              {selected.length}/{MAX_SELECTION} selecionados
            </span>
          </div>

          {stations.loading && <SkeletonList count={3} />}
          {stations.error && <ErrorState message={stations.error} onRetry={stations.reload} />}

          {!stations.loading && list.length === 0 && (
            <EmptyState
              icon="local_gas_station"
              title="Sem postos para comparar"
              description="Não há preços recentes para este combustível na sua região."
            />
          )}

          <ul className="space-y-gutter">
            {list.map((station) => {
              const checked = selected.includes(station.id);
              const full = !checked && selected.length >= MAX_SELECTION;
              return (
                <li key={station.id}>
                  <label
                    className={`pb-card flex cursor-pointer items-center gap-md p-md transition-colors
                                ${checked ? 'border-primary bg-primary-fixed/25' : ''}
                                ${full ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox" checked={checked} disabled={full}
                      onChange={() => toggle(station.id)}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-lg font-bold">{station.name}</span>
                      <span className="block text-label-bold font-normal text-on-surface-variant">
                        {distance(station.distanceKm) ?? station.neighborhood ?? '—'}
                      </span>
                    </span>
                    {station.lowestPrice && (
                      <span className="tabular shrink-0 font-display text-headline-md">
                        {money(station.lowestPrice.price)}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Barra de ação fixa: precisa de fundo próprio, senão o botão flutua
            por cima de um posto da lista e esconde um alvo clicável. */}
        <div
          className="sticky bottom-20 z-20 -mt-md bg-gradient-to-t from-background
                     from-60% to-transparent px-container-margin pb-sm pt-lg"
        >
          <button
            type="button"
            onClick={() => void run()}
            disabled={selected.length < 2 || comparing}
            className="pb-btn-primary w-full shadow-floating"
          >
            <Icon name="calculate" size={20} />
            {comparing
              ? 'Calculando…'
              : selected.length < 2
                ? 'Selecione ao menos 2 postos'
                : 'Comparar'}
          </button>
        </div>

        {compareError && (
          <div className="px-container-margin">
            <ErrorState message={compareError} onRetry={() => void run()} />
          </div>
        )}

        {result && (
          <section className="px-container-margin" aria-live="polite">
            <h3 className="mb-gutter font-display text-headline-md">Resultado</h3>

            {best && (
              <div className="mb-gutter rounded-lg bg-primary p-md text-on-primary">
                <p className="flex items-center gap-sm text-label-bold">
                  <Icon name="verified" size={16} />
                  MELHOR OPÇÃO
                </p>
                <p className="mt-1 text-body-lg font-bold">{best.stationName}</p>
                <p className="tabular mt-sm font-display text-headline-lg-mobile">
                  {best.netSavings > 0
                    ? `Economia de ${money(best.netSavings)}`
                    : 'Menor custo total'}
                </p>
                <p className="mt-1 text-body-md opacity-90">
                  {best.liters} litros por {money(best.fuelCost)}
                  {best.travelCost !== null && ` + ${money(best.travelCost)} de deslocamento`}
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-body-md">
                <caption className="sr-only">
                  Comparação de custo total entre os postos selecionados
                </caption>
                <thead className="text-label-bold text-on-surface-variant">
                  <tr className="border-b border-outline-variant">
                    <th scope="col" className="py-2 text-left">Posto</th>
                    <th scope="col" className="py-2 text-right">Preço/l</th>
                    <th scope="col" className="py-2 text-right">Trajeto</th>
                    <th scope="col" className="py-2 text-right">Custo total</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-outline-variant">
                  {result.options.map((option) => (
                    <tr key={option.stationId} className={option.isBestOption ? 'font-bold' : ''}>
                      <th scope="row" className="max-w-[10rem] truncate py-2 text-left font-normal">
                        {option.isBestOption && (
                          <Icon name="check_circle" size={14} className="mr-1 text-primary" />
                        )}
                        {option.stationName}
                      </th>
                      <td className="py-2 text-right">
                        {pricePerUnit(option.pricePerLiter, 'L')}
                      </td>
                      <td className="py-2 text-right">
                        {option.travelCost !== null ? money(option.travelCost) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {money(option.fuelCost + (option.travelCost ?? 0))}
                        {option.netSavings > 0 && (
                          <span className="ml-1 block text-label-bold font-normal text-primary">
                            −{percent(option.savingsPercent)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-md text-label-bold font-normal text-on-surface-variant">
              {result.notice}
            </p>
          </section>
        )}

        <div className="px-container-margin">
          <Notices
            notices={[
              'O custo de deslocamento considera ida e volta com o consumo informado.',
            ]}
          />
        </div>
      </div>
    </>
  );
}
