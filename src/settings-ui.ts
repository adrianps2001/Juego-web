import { DEFAULTS, onSettings, updateSettings, type Settings } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

const ranges: { id: string; key: NumberKey; format: (v: number) => string }[] = [
  { id: 'set-master', key: 'master', format: (v) => `${Math.round(v * 100)} %` },
  { id: 'set-ambient', key: 'ambient', format: (v) => `${Math.round(v * 100)} %` },
  { id: 'set-sfx', key: 'sfx', format: (v) => `${Math.round(v * 100)} %` },
  { id: 'set-sensitivity', key: 'sensitivity', format: (v) => `${v.toFixed(2)}×` },
  { id: 'set-fov', key: 'fov', format: (v) => `${v}°` },
  { id: 'set-brightness', key: 'brightness', format: (v) => `${Math.round(v * 100)} %` },
];

let onClose: (() => void) | null = null;

/** Conecta los controles del panel de configuración con los ajustes. */
export function initSettingsUi() {
  for (const r of ranges) {
    const input = $<HTMLInputElement>(r.id);
    input.addEventListener('input', () => updateSettings({ [r.key]: Number(input.value) }));
  }
  const invert = $<HTMLInputElement>('set-invert');
  invert.addEventListener('change', () => updateSettings({ invertY: invert.checked }));
  const fps = $<HTMLInputElement>('set-fps');
  fps.addEventListener('change', () => updateSettings({ showFps: fps.checked }));
  const screamers = $<HTMLInputElement>('set-screamers');
  screamers.addEventListener('change', () => updateSettings({ screamers: screamers.checked }));

  onSettings((s) => {
    for (const r of ranges) {
      $<HTMLInputElement>(r.id).value = String(s[r.key]);
      $(r.id + '-value').textContent = r.format(s[r.key]);
    }
    invert.checked = s.invertY;
    fps.checked = s.showFps;
    screamers.checked = s.screamers;
  });

  $('settings-reset').addEventListener('click', () => updateSettings({ ...DEFAULTS }));
  $('settings-close').addEventListener('click', closeSettings);
}

export function openSettings(then?: () => void) {
  onClose = then ?? null;
  $('settings').hidden = false;
}

export function closeSettings() {
  $('settings').hidden = true;
  onClose?.();
  onClose = null;
}
