/**
 * Chart export helpers.
 *
 * - svgToPngBlob: render a Recharts SVG to a PNG Blob with an optional
 *   title strip drawn on top. Hi-DPI by default (2×).
 * - downloadChartPng: find the <svg> inside a chart container, write to PNG,
 *   trigger a browser download.
 * - exportChartsToPptx: build a .pptx (one slide per chart) using pptxgenjs,
 *   which is loaded lazily so it isn't in the initial bundle.
 */

type PngOpts = { title?: string; scale?: number };

export async function svgToPngBlob(svg: SVGElement, opts: PngOpts = {}): Promise<Blob> {
  const scale = opts.scale ?? 2;
  const bbox = svg.getBoundingClientRect();
  const titleH = opts.title ? 36 : 0;
  const W = Math.max(1, Math.ceil(bbox.width));
  const H = Math.max(1, Math.ceil(bbox.height));

  // Clone so we can force width/height attrs without mutating the live chart.
  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error('Failed to rasterize SVG: ' + e));
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = (H + titleH) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H + titleH);

  if (opts.title) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 16px "Arial Black", Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.title, 12, 10);
  }

  ctx.drawImage(img, 0, titleH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
    );
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFileName(s: string): string {
  return s.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'chart';
}

export async function downloadChartPng(container: HTMLElement | null, title: string) {
  if (!container) return;
  const svg = container.querySelector('svg');
  if (!svg) return;
  const blob = await svgToPngBlob(svg as SVGElement, { title, scale: 2 });
  triggerDownload(blob, `${safeFileName(title)}.png`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export interface ChartExport {
  title: string;
  element: HTMLElement | null;
}

export async function exportChartsToPptx(charts: ChartExport[], fileName = 'Dashboard.pptx') {
  // Dynamic import — keeps ~300KB out of the initial bundle.
  const mod: any = await import('pptxgenjs');
  const PptxGen = mod.default ?? mod;
  const pptx = new PptxGen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"

  for (const c of charts) {
    if (!c.element) continue;
    const svg = c.element.querySelector('svg');
    if (!svg) continue;

    const bbox = (svg as SVGElement).getBoundingClientRect();
    const blob = await svgToPngBlob(svg as SVGElement, { scale: 2 });
    const dataUrl = await blobToDataUrl(blob);

    const slide = pptx.addSlide();
    slide.addText(c.title, {
      x: 0.5, y: 0.3, w: 12.3, h: 0.6,
      fontSize: 22, bold: true, fontFace: 'Arial Black', color: '0F172A',
    });

    // Fit the chart into the slide body area (keeping its aspect ratio).
    const maxW = 12.3, maxY = 1.1, maxH = 6.0;
    const ratio = bbox.height > 0 ? bbox.width / bbox.height : 2;
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    const x = 0.5 + (maxW - w) / 2;

    slide.addImage({ data: dataUrl, x, y: maxY, w, h });
  }

  await pptx.writeFile({ fileName });
}
