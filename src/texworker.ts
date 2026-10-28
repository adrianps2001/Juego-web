// Hilo aparte que dibuja las texturas de un tema y las devuelve como imágenes.

import { buildTheme, type ThemeData } from './textures';
import type { Theme } from './world';

self.onmessage = async (e: MessageEvent<Theme>) => {
  const theme = e.data;
  try {
    const jobs: Promise<ImageBitmap>[] = [];
    const data = buildTheme(theme, (w, h, paint) => {
      const canvas = new OffscreenCanvas(w, h);
      paint(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, w, h);
      // girada en vertical: equivale al flipY de las texturas de canvas
      const job = createImageBitmap(canvas, { imageOrientation: 'flipY' });
      jobs.push(job);
      return jobs.length - 1;
    });
    const imgs = await Promise.all(jobs);
    const pick = (list: number[]) => list.map((i) => imgs[i]);
    const out: ThemeData<ImageBitmap> = { ...data, walls: pick(data.walls), wallUppers: pick(data.wallUppers), floors: pick(data.floors), ceils: pick(data.ceils) };
    (self as unknown as Worker).postMessage({ theme, data: out }, imgs);
  } catch (err) {
    (self as unknown as Worker).postMessage({ theme, error: String(err) });
  }
};
