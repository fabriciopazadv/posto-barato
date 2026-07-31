'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { MapIllustration } from '@/components/MapIllustration';
import { usePrefs } from '@/lib/prefs';

interface Step {
  /** Ilustração: `map` é o SVG inline consciente do tema. */
  image: string | 'map';
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    image: '/assets/img/illus-economia-rota.svg',
    title: 'Encontre o melhor preço perto de você',
    description:
      'Compare valores, distância e quando cada preço foi atualizado nos postos da sua região.',
  },
  {
    image: 'map',
    title: 'Economia que considera o seu caminho',
    description:
      'Não adianta o posto barato ficar longe. Calculamos o custo real somando o deslocamento.',
  },
  {
    image: '/assets/img/illus-combustivel-ev.svg',
    title: 'Combustível e energia em um só lugar',
    description:
      'Localize postos e também pontos de recarga para veículos elétricos.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, requestGeolocation } = usePrefs();
  const [index, setIndex] = useState(0);
  const [asking, setAsking] = useState(false);

  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  const finish = async () => {
    setAsking(true);
    // Pede a localização no fim do fluxo, quando o motivo já ficou claro —
    // pedir na primeira tela costuma virar recusa.
    await requestGeolocation();
    completeOnboarding();
    router.replace('/');
  };

  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh max-w-screen-sm flex-col px-container-margin py-lg"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            completeOnboarding();
            router.replace('/');
          }}
          className="pb-btn-ghost px-md text-label-bold"
        >
          Pular
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-xl bg-surface-container-low p-lg">
          {step.image === 'map' ? (
            <MapIllustration className="mx-auto h-52 w-full animate-fade-in rounded-lg" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={step.image}
              src={step.image}
              alt=""
              className="mx-auto h-52 w-full animate-fade-in object-contain"
            />
          )}
        </div>

        <h1 className="mt-xl text-center font-display text-headline-lg-mobile">{step.title}</h1>
        <p className="mt-sm text-center text-body-lg text-on-surface-variant">
          {step.description}
        </p>

        <div
          className="mt-lg flex justify-center gap-2"
          role="group"
          aria-label={`Passo ${index + 1} de ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ir para o passo ${i + 1}`}
              aria-current={i === index ? 'step' : undefined}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-6 bg-primary' : 'w-2 bg-outline-variant'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-sm pb-lg">
        {last ? (
          <button
            type="button"
            onClick={() => void finish()}
            disabled={asking}
            className="pb-btn-primary w-full"
          >
            <Icon name="my_location" size={20} />
            {asking ? 'Aguardando permissão…' : 'Usar minha localização'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="pb-btn-primary w-full"
          >
            Continuar
            <Icon name="arrow_forward" size={18} />
          </button>
        )}

        {last && (
          <button
            type="button"
            onClick={() => {
              completeOnboarding();
              router.replace('/');
            }}
            className="pb-btn-ghost w-full"
          >
            Agora não
          </button>
        )}
      </div>
    </main>
  );
}
