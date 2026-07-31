'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { usingMock } from '@/lib/data';

/**
 * Entrada de conta.
 *
 * A API de autenticação existe (Argon2 + JWT + refresh em cookie HttpOnly),
 * mas ainda não está publicada. Enquanto não estiver, o formulário fica
 * desabilitado e explícito: um login que parece funcionar mas não autentica
 * seria pior do que nenhum — o usuário digitaria uma senha real à toa.
 */
export default function EntrarPage() {
  const [showPassword, setShowPassword] = useState(false);
  const disabled = usingMock;

  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-screen-sm flex-col px-container-margin py-lg">
      <Link
        href="/"
        className="-ml-2 flex min-h-touch w-fit items-center gap-sm rounded-full px-2
                   text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name="arrow_back" size={20} />
        Voltar
      </Link>

      <div className="flex flex-1 flex-col justify-center py-lg">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/img/logo-mark.svg"
            alt=""
            width={64}
            height={64}
            className="mx-auto"
          />
          <h1 className="mt-md font-display text-headline-lg-mobile">
            Bem-vindo ao Posto Barato
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Acesse sua conta para economizar hoje.
          </p>
        </div>

        <form
          className="mt-xl space-y-md"
          onSubmit={(e) => e.preventDefault()}
          aria-describedby={disabled ? 'aviso-login' : undefined}
        >
          <label className="block">
            <span className="text-label-bold text-on-surface-variant">E-mail</span>
            <div className="relative mt-1">
              <Icon
                name="mail"
                size={20}
                className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2
                           text-on-surface-variant"
              />
              <input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                disabled={disabled}
                className="pb-input pl-12"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-label-bold text-on-surface-variant">Senha</span>
            <div className="relative mt-1">
              <Icon
                name="lock"
                size={20}
                className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2
                           text-on-surface-variant"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={disabled}
                className="pb-input px-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 flex min-h-touch min-w-touch -translate-y-1/2
                           items-center justify-center rounded-full text-on-surface-variant
                           hover:bg-surface-container"
              >
                <Icon
                  name={showPassword ? 'visibility_off' : 'visibility'}
                  size={20}
                  label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                />
              </button>
            </div>
          </label>

          <button type="submit" disabled={disabled} className="pb-btn-primary w-full">
            Entrar
            <Icon name="arrow_forward" size={18} />
          </button>
        </form>

        {disabled && (
          <p
            id="aviso-login"
            role="status"
            className="mt-md rounded-md bg-surface-container px-md py-sm text-body-md
                       text-on-surface-variant"
          >
            <Icon name="info" size={16} className="mr-1 align-text-bottom" />
            O login ainda não está disponível: a API de contas não foi publicada. Você pode usar
            o app sem conta — favoritos e veículos ficam salvos neste aparelho.
          </p>
        )}

        <Link href="/" className="pb-btn-ghost mt-md w-full">
          Continuar sem conta
        </Link>
      </div>
    </main>
  );
}
