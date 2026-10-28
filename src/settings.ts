// Ajustes del jugador. Se guardan en el navegador (si se puede) y avisan a
// quien esté suscrito cuando cambian.

export type Quality = 'baja' | 'media' | 'alta';

export interface Settings {
  master: number; // volumen general (0-1)
  ambient: number; // zumbido de fondo
  sfx: number; // pasos, Smilers, efectos
  sensitivity: number; // multiplicador de la sensibilidad del ratón
  invertY: boolean;
  quality: Quality;
  fov: number;
  brightness: number;
  showFps: boolean;
}

export const DEFAULTS: Settings = {
  master: 0.8,
  ambient: 0.35,
  sfx: 0.8,
  sensitivity: 1,
  invertY: false,
  quality: 'media',
  fov: 75,
  brightness: 1,
  showFps: false,
};

const KEY = 'ajustes';

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // sin almacenamiento: los ajustes duran hasta cerrar la pestaña
  }
  for (const fn of listeners) fn(current);
}

/** Llama a fn ahora y cada vez que cambien los ajustes. Devuelve cómo dejar de escuchar. */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
