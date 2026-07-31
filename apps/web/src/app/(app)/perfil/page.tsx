'use client';

import Link from 'next/link';

import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { usingMock } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';

const THEMES: { value: 'system' | 'light' | 'dark'; label: string; icon: IconName }[] = [
  { value: 'system', label: 'Sistema', icon: 'settings' },
  { value: 'light', label: 'Claro', icon: 'light_mode' },
  { value: 'dark', label: 'Escuro', icon: 'dark_mode' },
];

export default function PerfilPage() {
  const { vehicles, removeVehicle, theme, setTheme, favorites, ready } = usePrefs();

  return (
    <>
      <TopBar title="Perfil" />

      <div className="space-y-lg py-md">
        <section className="px-container-margin">
          <div className="pb-card flex items-center gap-md p-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/img/avatar.svg"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="text-body-lg font-bold">Visitante</p>
              <p className="text-body-md text-on-surface-variant">
                Entre para salvar favoritos e alertas em todos os aparelhos.
              </p>
            </div>
          </div>
          <Link href="/entrar" className="pb-btn-primary mt-gutter w-full">
            <Icon name="account_circle" size={20} />
            Entrar ou criar conta
          </Link>
        </section>

        <section className="px-container-margin">
          <Link
            href="/premium"
            className="flex items-center gap-md rounded-lg bg-primary p-md text-on-primary
                       hover:bg-on-primary-fixed-variant"
          >
            <Icon name="workspace_premium" size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-body-lg font-bold">Posto Barato Premium</span>
              <span className="block text-body-md opacity-90">
                Pagamento único, acesso vitalício.
              </span>
            </span>
            <Icon name="chevron_right" />
          </Link>
        </section>

        <section className="px-container-margin">
          <div className="mb-gutter flex items-center justify-between gap-sm">
            <h2 className="font-display text-headline-md">Meus veículos</h2>
            <span className="text-label-bold font-normal text-on-surface-variant">
              {vehicles.length} cadastrado{vehicles.length === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="space-y-gutter">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="pb-card flex items-center gap-md p-md">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${
                    vehicle.kind === 'electric'
                      ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                      : 'bg-secondary-fixed text-on-secondary-fixed'
                  }`}
                >
                  <Icon name={vehicle.kind === 'electric' ? 'electric_car' : 'directions_car'} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-lg font-bold">{vehicle.nickname}</p>
                  <p className="truncate text-body-md text-on-surface-variant">{vehicle.detail}</p>
                  <p className="tabular mt-1 text-label-bold font-normal text-on-surface-variant">
                    {vehicle.consumption} {vehicle.kind === 'electric' ? 'km/kWh' : 'km/l'} ·{' '}
                    {vehicle.tankOrBattery} {vehicle.kind === 'electric' ? 'kWh' : 'L'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeVehicle(vehicle.id)}
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-full
                             text-on-surface-variant hover:bg-surface-container hover:text-error"
                >
                  <Icon name="delete" label={`Remover ${vehicle.nickname}`} size={20} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-container-margin">
          <h2 className="mb-gutter font-display text-headline-md">Aparência</h2>
          <div className="flex gap-sm" role="group" aria-label="Tema">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={ready && theme === option.value}
                className={`pb-card flex flex-1 flex-col items-center gap-1 py-md transition-colors ${
                  ready && theme === option.value
                    ? 'border-primary bg-primary-fixed/25 text-primary'
                    : 'text-on-surface-variant'
                }`}
              >
                <Icon name={option.icon} size={22} />
                <span className="text-label-bold">{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="px-container-margin">
          <h2 className="mb-gutter font-display text-headline-md">Atalhos</h2>
          <ul className="pb-card divide-y divide-outline-variant">
            {[
              { href: '/economia', icon: 'savings' as IconName, label: 'Minha economia' },
              { href: '/favoritos', icon: 'favorite' as IconName, label: `Favoritos (${favorites.length})` },
              { href: '/recarga', icon: 'ev_charger' as IconName, label: 'Pontos de recarga' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-touch items-center gap-md px-md py-3
                             hover:bg-surface-container-low"
                >
                  <Icon name={item.icon} className="text-on-surface-variant" />
                  <span className="flex-1 text-body-lg">{item.label}</span>
                  <Icon name="chevron_right" className="text-on-surface-variant" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-container-margin">
          <h2 className="mb-gutter font-display text-headline-md">Sobre</h2>
          <div className="pb-card space-y-sm p-md text-body-md text-on-surface-variant">
            <p>
              Os preços vêm do <strong className="text-on-surface">Banco de Dados Posto
              Barato</strong> e não são oficiais nem atualizados em tempo real.
            </p>
            {usingMock && (
              <p className="rounded-md bg-surface-container px-sm py-2">
                Modo demonstração: dados de exemplo de Rondonópolis/MT.
              </p>
            )}
            <p>
              <a
                href="/prototipos/"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Ver galeria de protótipos
                <Icon name="open_in_new" size={14} />
              </a>
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
