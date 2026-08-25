import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { whatsappLink, type BrandMemory } from '@empleado/brand';
import { generateGeminiImage, generateGeminiVideo } from '@empleado/ai-providers';
import { logger } from '@empleado/shared';
import { UPLOADS_DIR } from '../server.js';

/**
 * Generación de material gráfico (Fase 4). Plantillas deterministas con sharp
 * (sin coste, sin erratas) + fotografía/video IA con dirección de arte. Todas
 * las piezas llevan el kit de marca: colores, logo y datos de contacto
 * (web/teléfono/correo) desde la Brand Memory.
 */
const W = 1080;
const H = 1080;

interface Palette {
  bg: string;
  bgDark: string;
  accent: string;
  text: string;
  muted: string;
}

function palette(brand: BrandMemory): Palette {
  const bg = brand.visual?.primaryColor ?? '#12263f';
  const accent = brand.visual?.accentColor ?? '#d9a441';
  return { bg, bgDark: darken(bg, 0.35), accent, text: '#f5f7fa', muted: '#9db2c9' };
}

function darken(hex: string, factor: number): string {
  const n = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${n(1)}${n(3)}${n(5)}`;
}

/** Línea de contacto para la franja inferior: solo los datos configurados. */
function contactLine(brand: BrandMemory): string {
  return [brand.contact?.website, brand.contact?.phoneDisplay, brand.contact?.email]
    .filter((v): v is string => Boolean(v?.trim()))
    .join('   ·   ');
}

/**
 * Iconos vectoriales de apoyo (infografía): trazos simples sobre viewBox 0-100,
 * elegidos por palabras clave del texto. Deterministas: sin assets externos.
 */
const ICONS: Record<string, string> = {
  doc: '<rect x="25" y="12" width="50" height="76" rx="6"/><line x1="36" y1="32" x2="64" y2="32"/><line x1="36" y1="48" x2="64" y2="48"/><line x1="36" y1="64" x2="55" y2="64"/>',
  ship: '<rect x="18" y="40" width="20" height="14"/><rect x="40" y="40" width="20" height="14"/><rect x="29" y="26" width="20" height="14"/><path d="M12 60 h76 l-10 20 h-56 z"/>',
  lupa: '<circle cx="44" cy="44" r="24"/><line x1="62" y1="62" x2="84" y2="84"/>',
  balanza: '<line x1="50" y1="14" x2="50" y2="82"/><line x1="22" y1="26" x2="78" y2="26"/><path d="M12 52 a12 12 0 0 0 24 0 l-12 -26 z"/><path d="M64 52 a12 12 0 0 0 24 0 l-12 -26 z"/><line x1="34" y1="86" x2="66" y2="86"/>',
  money: '<circle cx="50" cy="50" r="34"/><path d="M60 38 a12 8 0 0 0 -20 4 c0 6 8 7 12 8 c6 1 12 3 10 10 a12 8 0 0 1 -22 2"/><line x1="50" y1="28" x2="50" y2="72"/>',
  check: '<circle cx="50" cy="50" r="36"/><polyline points="34,52 46,64 68,38"/>',
  alerta: '<path d="M50 14 L88 82 H12 Z"/><line x1="50" y1="40" x2="50" y2="60"/><circle cx="50" cy="70" r="2.5"/>',
  reloj: '<circle cx="50" cy="50" r="34"/><polyline points="50,30 50,52 66,60"/>',
  phone: '<rect x="32" y="10" width="36" height="80" rx="8"/><line x1="44" y1="80" x2="56" y2="80"/>',
  globe: '<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="14" ry="34"/><line x1="16" y1="50" x2="84" y2="50"/>',
  mail: '<rect x="14" y="26" width="72" height="48" rx="6"/><polyline points="16,30 50,56 84,30"/>',
};

const ICON_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(pag|dinero|impuesto|tribut|cost|valor|honorari|arancel)/i, 'money'],
  [/\b(document|factur|acta|requerimient|declaraci|papel|contrato|registro)/i, 'doc'],
  [/\b(puert|contenedor|import|mercanc|embarqu|carga|aduan)/i, 'ship'],
  [/\b(verific|revis|clasific|inspecci|analiz|busca)/i, 'lupa'],
  [/\b(dian|sanci|legal|ley|norma|abogad|defens)/i, 'balanza'],
  [/\b(plazo|tiempo|hora|dia|urgen|venc)/i, 'reloj'],
  [/\b(error|riesgo|cuidado|alerta|peligro|multa)/i, 'alerta'],
];

function pickIcon(text: string): string {
  for (const [re, name] of ICON_KEYWORDS) if (re.test(text)) return name;
  return 'check';
}

/** Renderiza un icono en (x,y) con el tamaño y color dados. */
function iconSvg(name: string, x: number, y: number, size: number, color: string, opacity = 1): string {
  const inner = ICONS[name] ?? ICONS['check']!;
  return `<g transform="translate(${x},${y}) scale(${size / 100})" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${inner}</g>`;
}

/** Fondo con degradado + trazos decorativos sutiles, común a todas las plantillas. */
function baseBackground(pal: Palette): string {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${pal.bg}"/>
      <stop offset="1" stop-color="${pal.bgDark}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 60}" cy="120" r="220" fill="${pal.accent}" opacity="0.06"/>
  <circle cx="${W - 60}" cy="120" r="140" fill="${pal.accent}" opacity="0.05"/>
  <rect x="0" y="${H - 150}" width="${W}" height="2" fill="${pal.accent}" opacity="0.35"/>`;
}

/**
 * Banner superior con el gancho (hook) de la pieza: scrim + pilar + titular
 * envuelto. Toda pieza generada (imagen IA, portada de carrusel, video) debe
 * mostrar el gancho en la gráfica misma, no solo en el caption — es lo que
 * detiene el scroll. Se compone por plantilla, nunca lo escribe la IA.
 */
function hookBannerSvg(brand: BrandMemory, pal: Palette, pillar: string, hook: string, w = W): string {
  const lines = wrap(hook, Math.round(w / 42), 4);
  const fontSize = lines.length <= 2 ? 52 : lines.length === 3 ? 44 : 38;
  const lineHeight = Math.round(fontSize * 1.25);
  const bannerHeight = 100 + lines.length * lineHeight;
  return `
  <rect x="0" y="0" width="${w}" height="${bannerHeight}" fill="${pal.bgDark}" opacity="0.85"/>
  <rect x="0" y="${bannerHeight}" width="${w}" height="3" fill="${pal.accent}"/>
  <text x="60" y="56" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="${pal.accent}" letter-spacing="3">${escapeXml(pillar.toUpperCase())}</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="60" y="${96 + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${pal.text}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}`;
}

/** Franja inferior de marca: nombre + datos de contacto (+ indicador opcional). */
function footerSvg(brand: BrandMemory, pal: Palette, rightText?: string, w = W, h = H): string {
  const contacts = contactLine(brand);
  return `
  <text x="80" y="${h - 92}" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="${pal.accent}" letter-spacing="0.5">${escapeXml(brand.brandName)}</text>
  ${contacts ? `<text x="80" y="${h - 44}" font-family="Arial, sans-serif" font-size="26" fill="${pal.muted}">${escapeXml(contacts)}</text>` : ''}
  ${rightText ? `<text x="${w - 80}" y="${h - 44}" text-anchor="end" font-family="Arial, sans-serif" font-size="30" fill="${pal.muted}">${escapeXml(rightText)}</text>` : ''}`;
}

/** Estampa el logo de la marca (si está subido) en la esquina superior derecha. */
async function composeWithLogo(
  pipeline: sharp.Sharp,
  brand: BrandMemory,
): Promise<sharp.Sharp> {
  const logoFile = brand.visual?.logoFilename;
  if (!logoFile) return pipeline;
  try {
    const logo = await sharp(path.join(UPLOADS_DIR, logoFile))
      .resize({ height: 96, fit: 'inside' })
      .png()
      .toBuffer();
    const meta = await sharp(logo).metadata();
    return sharp(await pipeline.toBuffer()).composite([
      { input: logo, top: 64, left: W - 64 - (meta.width ?? 96) },
    ]);
  } catch (err) {
    logger.warn({ err, logoFile }, 'No se pudo estampar el logo; se continúa sin él');
    return pipeline;
  }
}

export interface GeneratedImage {
  filename: string;
  mime: 'image/jpeg';
  /** Cómo se produjo: 'ai' (Gemini) o 'template' (plantilla determinista). */
  source: 'ai' | 'template';
}

/** Dirección de arte compartida para las piezas fotográficas IA. */
function artDirection(brand: BrandMemory): string {
  return [
    `Contexto del negocio: ${brand.niche} en ${brand.market}.`,
    'Dirección de arte: fotografía editorial premium tipo revista de negocios,',
    'lente 50mm, profundidad de campo corta, iluminación cinematográfica cálida,',
    'compo­sición con regla de tercios y espacio negativo amplio a la izquierda,',
    'paleta sobria de azul marino profundo con acentos dorados, aspecto sofisticado y confiable.',
    'Ambiente de comercio exterior: puertos al amanecer, contenedores, documentos aduaneros elegantes,',
    'oficinas jurídicas modernas — según corresponda al tema.',
    'Incluye objetos y metáforas visuales que apoyen el concepto (composición editorial con intención, no foto genérica).',
    'SIN texto, SIN letras, SIN logotipos, SIN marcas de agua dentro de la imagen.',
  ].join(' ');
}

/**
 * Imagen fotográfica con IA (Gemini) + franja de marca inferior estampada por
 * plantilla (el texto de marca nunca lo escribe la IA: cero erratas).
 */
export async function generateAiImage(
  apiKey: string,
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string },
): Promise<GeneratedImage> {
  const prompt = `Fotografía editorial profesional para Instagram (cuadrada 1:1) que ilustre: "${piece.topic}". ${artDirection(brand)}`;
  const { bytes } = await generateGeminiImage(apiKey, prompt);
  const pal = palette(brand);

  // Gancho arriba (detiene el scroll) + franja de marca abajo (contacto).
  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${hookBannerSvg(brand, pal, piece.pillar, piece.hook || piece.topic)}
  <rect x="0" y="${H - 150}" width="${W}" height="150" fill="${pal.bgDark}" opacity="0.82"/>
  <rect x="0" y="${H - 150}" width="${W}" height="3" fill="${pal.accent}"/>
  ${footerSvg(brand, pal)}
</svg>`);

  let pipeline = sharp(bytes).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]);
  pipeline = await composeWithLogo(pipeline, brand);

  const filename = `${randomUUID()}.jpg`;
  await pipeline.jpeg({ quality: 92 }).toFile(path.join(UPLOADS_DIR, filename));
  logger.info({ filename }, 'Imagen IA generada con franja de marca');
  return { filename, mime: 'image/jpeg', source: 'ai' };
}

/** Plantilla tipográfica de marca (portadas y posts de texto). */
export async function generateBrandImage(
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string },
): Promise<GeneratedImage> {
  const pal = palette(brand);
  const headline = (piece.hook || piece.topic).trim();
  const lines = wrap(headline, 22, 7);
  const fontSize = lines.length <= 3 ? 76 : lines.length <= 5 ? 64 : 52;
  const lineHeight = Math.round(fontSize * 1.22);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((H - 150 - blockHeight) / 2 + fontSize * 0.8);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${baseBackground(pal)}
  <text x="80" y="${startY - fontSize - 56}" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="${pal.accent}" letter-spacing="4">${escapeXml(piece.pillar.toUpperCase())}</text>
  <rect x="80" y="${startY - fontSize - 36}" width="140" height="8" fill="${pal.accent}"/>
  ${iconSvg(pickIcon(headline), W - 280, H - 380, 180, pal.accent, 0.35)}
  ${lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${pal.text}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  ${footerSvg(brand, pal)}
</svg>`;

  let pipeline = sharp(Buffer.from(svg));
  pipeline = await composeWithLogo(pipeline, brand);
  const filename = `${randomUUID()}.jpg`;
  await pipeline.jpeg({ quality: 92 }).toFile(path.join(UPLOADS_DIR, filename));
  return { filename, mime: 'image/jpeg', source: 'template' };
}

/**
 * Video corto vertical con Veo para reels, con la misma dirección de arte.
 * (La franja de marca en video requiere post-producción — pendiente ffmpeg.)
 */
export async function generateAiVideo(
  apiKey: string,
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string },
): Promise<{ filename: string; mime: 'video/mp4'; kind: 'video' }> {
  const prompt = [
    `Video corto vertical (9:16) para un reel de Instagram que ilustre: "${piece.topic}".`,
    'Estilo: motion graphics editorial premium combinado con tomas cinematográficas —',
    'iconos y elementos infográficos animados (líneas que se trazan, gráficos que crecen, objetos flotantes)',
    'integrados con imágenes reales de puertos, contenedores y documentos aduaneros.',
    artDirection(brand),
    'Movimiento de cámara suave y elegante, transiciones fluidas, ritmo dinámico pero sereno.',
  ].join(' ');

  const { bytes } = await generateGeminiVideo(apiKey, prompt, { aspectRatio: '9:16' });
  const rawFilename = `${randomUUID()}.mp4`;
  const rawPath = path.join(UPLOADS_DIR, rawFilename);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(rawPath, bytes);
  logger.info({ filename: rawFilename, sizeKb: Math.round(bytes.length / 1024) }, 'Video generado con Veo');

  try {
    const branded = await burnBrandOverlay(rawPath, brand, piece);
    const { unlink } = await import('node:fs/promises');
    await unlink(rawPath).catch(() => {});
    return { filename: branded, mime: 'video/mp4', kind: 'video' };
  } catch (err) {
    // Sin overlay el video sigue siendo publicable; solo pierde el gancho quemado.
    logger.warn({ err }, 'No se pudo quemar el gancho sobre el video; se usa sin overlay');
    return { filename: rawFilename, mime: 'video/mp4', kind: 'video' };
  }
}

/**
 * Quema el gancho (banner superior) y la franja de marca (inferior) sobre el
 * video con ffmpeg, igual que en imagen/carrusel — el gancho debe verse en
 * TODO el material generado, no solo en el caption. El overlay se renderiza
 * como PNG transparente (misma técnica SVG que las imágenes) y se compone
 * con el filtro `overlay` de ffmpeg; nunca se le pide texto a la IA de video.
 */
async function burnBrandOverlay(
  inputPath: string,
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string },
): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { createRequire } = await import('node:module');
  const run = promisify(execFile);

  // createRequire evita ambigüedades de interoperabilidad ESM/CJS con estos
  // paquetes (ffmpeg-static exporta un string; ffprobe-installer, un objeto).
  const require = createRequire(import.meta.url);
  const ffmpegPath = require('ffmpeg-static') as string;
  const ffprobePath = (require('@ffprobe-installer/ffprobe') as { path: string }).path;

  const { stdout } = await run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    inputPath,
  ]);
  const [w, h] = stdout.trim().split('x').map(Number);
  if (!w || !h) throw new Error('No se pudo leer la resolución del video');

  const pal = palette(brand);
  const footerHeight = Math.round(h * 0.14);
  const overlaySvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${hookBannerSvg(brand, pal, piece.pillar, piece.hook || piece.topic, w)}
  <rect x="0" y="${h - footerHeight}" width="${w}" height="${footerHeight}" fill="${pal.bgDark}" opacity="0.82"/>
  <rect x="0" y="${h - footerHeight}" width="${w}" height="3" fill="${pal.accent}"/>
  ${footerSvg(brand, pal, undefined, w, h)}
</svg>`;

  const overlayPngPath = path.join(UPLOADS_DIR, `${randomUUID()}-overlay.png`);
  await sharp(Buffer.from(overlaySvg)).png().toFile(overlayPngPath);

  const outFilename = `${randomUUID()}.mp4`;
  const outPath = path.join(UPLOADS_DIR, outFilename);
  try {
    await run(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-i', overlayPngPath,
      '-filter_complex', '[0:v][1:v]overlay=0:0',
      '-c:a', 'copy',
      outPath,
    ]);
  } finally {
    const { unlink } = await import('node:fs/promises');
    await unlink(overlayPngPath).catch(() => {});
  }
  return outFilename;
}

export interface GeneratedCarousel {
  filename: string;
  mime: 'image/jpeg';
  kind: 'carousel';
  items: Array<{ filename: string; mime: string }>;
}

/**
 * Carrusel completo: portada IA (o plantilla) + lámina por punto + lámina final
 * de contacto (CTA). Máximo 10 láminas (límite de Instagram).
 */
export async function generateCarousel(
  geminiKey: string | undefined,
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string; body: string },
): Promise<GeneratedCarousel> {
  const points = extractPoints(piece.body);
  if (points.length < 1) {
    throw new Error('El cuerpo de la pieza no tiene puntos identificables para las láminas.');
  }

  const cover = geminiKey
    ? await generateAiImage(geminiKey, brand, piece).catch(() => generateBrandImage(brand, piece))
    : await generateBrandImage(brand, piece);

  const hasContact = Boolean(contactLine(brand) || whatsappLink(brand));
  const maxPoints = hasContact ? 8 : 9;
  const total = Math.min(points.length, maxPoints);

  const slides: Array<{ filename: string; mime: string }> = [
    { filename: cover.filename, mime: cover.mime },
  ];
  for (let i = 0; i < total; i++) {
    slides.push(await renderTextSlide(brand, points[i]!, i + 1, total));
  }
  if (hasContact) slides.push(await renderCtaSlide(brand));

  return { filename: cover.filename, mime: 'image/jpeg', kind: 'carousel', items: slides };
}

/** Extrae los puntos numerados/listados del cuerpo; fallback: párrafos largos. */
function extractPoints(body: string): string[] {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const numbered = lines
    .filter((l) => /^(\d{1,2}[.):]|[0-9]️?⃣|[•▪➡-])\s*/u.test(l))
    .map((l) => l.replace(/^(\d{1,2}[.):]|[0-9]️?⃣|[•▪➡-])\s*/u, '').trim());
  if (numbered.length >= 2) return numbered;
  return body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter((p) => p.length > 60)
    .slice(0, 6);
}

async function renderTextSlide(
  brand: BrandMemory,
  text: string,
  index: number,
  total: number,
): Promise<{ filename: string; mime: string }> {
  const pal = palette(brand);
  const lines = wrap(text, 28, 9);
  const fontSize = lines.length <= 4 ? 56 : lines.length <= 6 ? 48 : 42;
  const lineHeight = Math.round(fontSize * 1.28);
  const startY = 400;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${baseBackground(pal)}
  <text x="80" y="250" font-family="Arial, sans-serif" font-size="140" font-weight="bold" fill="${pal.accent}" opacity="0.95">${index}</text>
  <rect x="80" y="290" width="140" height="8" fill="${pal.accent}"/>
  ${iconSvg(pickIcon(text), W - 260, 120, 160, pal.accent, 0.9)}
  ${lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${pal.text}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  ${footerSvg(brand, pal, `${index} / ${total}`)}
</svg>`;

  let pipeline = sharp(Buffer.from(svg));
  pipeline = await composeWithLogo(pipeline, brand);
  const filename = `${randomUUID()}.jpg`;
  await pipeline.jpeg({ quality: 92 }).toFile(path.join(UPLOADS_DIR, filename));
  return { filename, mime: 'image/jpeg' };
}

/** Lámina final del carrusel: llamado a la acción con todos los datos de contacto. */
async function renderCtaSlide(brand: BrandMemory): Promise<{ filename: string; mime: string }> {
  const pal = palette(brand);
  const rows: Array<{ icon: string; text: string }> = [
    brand.contact?.whatsappNumber
      ? { icon: 'phone', text: `WhatsApp: ${brand.contact.phoneDisplay ?? brand.contact.whatsappNumber}` }
      : null,
    brand.contact?.website ? { icon: 'globe', text: brand.contact.website } : null,
    brand.contact?.email ? { icon: 'mail', text: brand.contact.email } : null,
  ].filter((r): r is { icon: string; text: string } => r !== null);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${baseBackground(pal)}
  <text x="80" y="330" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="${pal.accent}" letter-spacing="4">HABLEMOS DE TU CASO</text>
  <rect x="80" y="352" width="140" height="8" fill="${pal.accent}"/>
  <text x="80" y="450" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="${pal.text}">¿Necesitas ayuda</text>
  <text x="80" y="530" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="${pal.text}">con tu importación?</text>
  ${rows
    .map(
      (row, i) =>
        `${iconSvg(row.icon, 80, 610 + i * 70, 44, pal.accent)}
  <text x="144" y="${642 + i * 70}" font-family="Arial, sans-serif" font-size="38" fill="${pal.text}">${escapeXml(row.text)}</text>`,
    )
    .join('\n  ')}
  <text x="80" y="${640 + rows.length * 70 + 24}" font-family="Arial, sans-serif" font-size="30" fill="${pal.muted}">Escríbenos por DM y te orientamos.</text>
  ${footerSvg(brand, pal)}
</svg>`;

  let pipeline = sharp(Buffer.from(svg));
  pipeline = await composeWithLogo(pipeline, brand);
  const filename = `${randomUUID()}.jpg`;
  await pipeline.jpeg({ quality: 92 }).toFile(path.join(UPLOADS_DIR, filename));
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
