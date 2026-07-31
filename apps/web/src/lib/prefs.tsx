'use client';

/**
 * Preferências do usuário, mantidas no dispositivo.
 *
 * Nada aqui vai para o servidor: combustível preferido, favoritos, veículos e
 * tema são locais. Quando as áreas autenticadas da API existirem (favoritos,
 * alertas, veículos), este contexto passa a sincronizar — a interface das telas
 * não muda.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Vehicle } from './types';

const STORAGE_KEY = 'posto-barato:prefs:v1';

export interface Origin {
  latitude: number;
  longitude: number;
  label: string;
}

interface Prefs {
  product: string;
  favorites: string[];
  vehicles: Vehicle[];
  theme: 'system' | 'light' | 'dark';
  onboardingDone: boolean;
  origin: Origin | null;
}

const DEFAULT_ORIGIN: Origin = {
  latitude: -16.4707,
  longitude: -54.6357,
  label: 'Rondonópolis - MT',
};

const DEFAULTS: Prefs = {
  product: 'GASOLINA_COMUM',
  favorites: [],
  vehicles: [
    {
      id: 'v1', nickname: 'Meu carro', kind: 'combustion',
      detail: 'Gasolina · Placa ABC-1234', consumption: 10.5,
      tankOrBattery: 55, preferredProduct: 'GASOLINA_COMUM',
    },
  ],
  theme: 'system',
  onboardingDone: false,
  origin: DEFAULT_ORIGIN,
};

interface PrefsContext extends Prefs {
  ready: boolean;
  setProduct: (code: string) => void;
  toggleFavorite: (stationId: string) => void;
  isFavorite: (stationId: string) => boolean;
  setTheme: (theme: Prefs['theme']) => void;
  setOrigin: (origin: Origin | null) => void;
  addVehicle: (vehicle: Vehicle) => void;
  removeVehicle: (id: string) => void;
  completeOnboarding: () => void;
  /** Pede a localização ao navegador. Resolve false se negada/indisponível. */
  requestGeolocation: () => Promise<boolean>;
}

const Ctx = createContext<PrefsContext | null>(null);

function load(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  // O export é estático: a primeira renderização é sempre a padrão, e só depois
  // de montar lemos o localStorage. `ready` evita piscar conteúdo errado.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs, ready]);

  // Aplica o tema na raiz do documento.
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (prefs.theme !== 'system') root.classList.add(prefs.theme);
  }, [prefs.theme, ready]);

  const patch = useCallback((next: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...next }));
  }, []);

  const requestGeolocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          patch({
            origin: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              label: 'Sua localização',
            },
          });
          resolve(true);
        },
        () => resolve(false),
        { timeout: 8000, maximumAge: 300_000 },
      );
    });
  }, [patch]);

  const value = useMemo<PrefsContext>(
    () => ({
      ...prefs,
      ready,
      setProduct: (product) => patch({ product }),
      toggleFavorite: (stationId) =>
        setPrefs((prev) => ({
          ...prev,
          favorites: prev.favorites.includes(stationId)
            ? prev.favorites.filter((id) => id !== stationId)
            : [...prev.favorites, stationId],
        })),
      isFavorite: (stationId) => prefs.favorites.includes(stationId),
      setTheme: (theme) => patch({ theme }),
      setOrigin: (origin) => patch({ origin }),
      addVehicle: (vehicle) =>
        setPrefs((prev) => ({ ...prev, vehicles: [...prev.vehicles, vehicle] })),
      removeVehicle: (id) =>
        setPrefs((prev) => ({ ...prev, vehicles: prev.vehicles.filter((v) => v.id !== id) })),
      completeOnboarding: () => patch({ onboardingDone: true }),
      requestGeolocation,
    }),
    [prefs, ready, patch, requestGeolocation],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrefs precisa estar dentro de <PrefsProvider>.');
  return ctx;
}
