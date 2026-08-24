import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import type { BrandMemory } from '@empleado/brand';
import { UPLOADS_DIR } from '../server.js';

/**
 * Generador de imágenes de marca (Fase 4 — Imagen). Plantilla determinista con
 * sharp: fondo de marca + hook como titular + pie con el nombre. Sin servicios
 * externos ni coste por imagen; cuando se integre un proveedor de imagen IA,
 * esta plantilla queda como fallback y para posts de texto.
 */
const W = 1080;
const H = 1080;
const BG = '#12263f';
const ACCENT = '#d9a441';
const TEXT = '#f5f7fa';
const MUTED = '#9db2c9';

export interface GeneratedImage {
  filename: string;
  mime: 'image/jpeg';
}

export async function generateBrandImage(
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string },
): Promise<GeneratedImage> {
  const headline = (piece.hook || piece.topic).trim();
  const lines = wrap(headline, 24, 8);
  const fontSize = lines.length <= 3 ? 72 : lines.length <= 5 ? 60 : 48;
  const lineHeight = Math.round(fontSize * 1.25);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((H - blockHeight) / 2 + fontSize * 0.8) - 40;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="80" y="${startY - fontSize - 40}" width="120" height="10" fill="${ACCENT}"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${TEXT}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  <text x="80" y="${H - 90}" font-family="Arial, sans-serif" font-size="34" fill="${MUTED}">${escapeXml(piece.pillar)}</text>
  <text x="80" y="${H - 46}" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="${ACCENT}">${escapeXml(brand.brandName)}</text>
</svg>`;

  const filename = `${randomUUID()}.jpg`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(path.join(UPLOADS_DIR, filename));
  return { filename, mime: 'image/jpeg' };
}

/** Corta el texto en líneas de máximo `maxChars`, hasta `maxLines` (elipsis al final). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.join(' ').length < text.length && lines.length === maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1]!.slice(0, maxChars - 1) + '…';
  }
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
