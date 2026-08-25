import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateGeminiSpeech } from '@empleado/ai-providers';
import { ProviderError, logger } from '@empleado/shared';
import type { BrandMemory } from '@empleado/brand';

const run = promisify(execFile);
const requireCjs = createRequire(import.meta.url);
const ffmpegPath = requireCjs('ffmpeg-static') as string;

const PEXELS_BASE = 'https://api.pexels.com/v1/videos/search';

interface PexelsVideoFile {
  quality: string;
  width: number;
  height: number;
  file_type: string;
  link: string;
}
interface PexelsVideo {
  id: number;
  duration: number;
  width: number;
  height: number;
  video_files: PexelsVideoFile[];
}

/**
 * Video económico (D33): voz de Gemini TTS + clips de stock de Pexels (API
 * oficial, sin scraping) + subtítulos quemados con ffmpeg, en vez de generar
 * video con IA (Veo: caro y lento). Patrón adaptado de harry0703/MoneyPrinterTurbo
 * (reescrito, no copiado — mismo criterio que instabot, D10).
 */
export async function generateCheapVideo(
  keys: { geminiApiKey: string; pexelsApiKey: string },
  brand: BrandMemory,
  piece: { hook: string; topic: string; pillar: string; body: string; cta: string },
): Promise<{ filename: string; mime: 'video/mp4'; kind: 'video' }> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'cheap-video-'));
  try {
    const narration = narrationText(piece);
    logger.info({ chars: narration.length }, 'Video económico: generando narración con Gemini TTS');
    const { pcm, sampleRate } = await generateGeminiSpeech(keys.geminiApiKey, narration);
    const wavPath = path.join(workDir, 'narration.wav');
    await writeFile(wavPath, wrapPcmAsWav(pcm, sampleRate));
    const narrationSeconds = pcm.length / (sampleRate * 2); // 16 bits = 2 bytes/muestra, mono

    const query = pexelsQuery(piece);
    logger.info({ query }, 'Video económico: buscando clips en Pexels');
    const clipPaths = await downloadClips(keys.pexelsApiKey, query, narrationSeconds, workDir);

    const srtPath = path.join(workDir, 'captions.srt');
    await writeFile(srtPath, buildSrt(narration, narrationSeconds), 'utf-8');

    const rawVideoPath = path.join(workDir, 'assembled.mp4');
    await assembleVideo(clipPaths, wavPath, srtPath, narrationSeconds, rawVideoPath);

    // Reutiliza el mismo quemado de gancho + franja de marca que el resto del material.
    const { burnBrandOverlay } = await import('./image-generator.js');
    const filename = await burnBrandOverlay(rawVideoPath, brand, piece);

    return { filename, mime: 'video/mp4', kind: 'video' };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Texto de narración: hook + cuerpo limpios de markdown/emoji, sin el CTA (va en pantalla, no en voz). */
function narrationText(piece: { hook: string; body: string }): string {
  const clean = (s: string) =>
    s
      .replace(/[#*_`]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  return `${clean(piece.hook)}. ${clean(piece.body)}`.slice(0, 1200);
}

/**
 * Pexels indexa en inglés: mapeo determinista de palabras clave del tema/pilar
 * (español) a términos de búsqueda en inglés, mismo patrón que `pickIcon` en
 * image-generator.ts. Sin traducir el texto completo (evita una llamada IA
 * extra — "video económico" también en coste).
 */
const STOCK_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(puert|contenedor|import|mercanc|embarqu|carga|barco|naviero)/i, 'shipping container port cargo'],
  [/\b(document|factur|acta|requerimient|declaraci|contrato|registro|firma)/i, 'business documents signing office'],
  [/\b(dian|sanci|legal|ley|norma|abogad|defens|corte|juzgad)/i, 'law office consultation lawyer'],
  [/\b(pag|dinero|impuesto|tribut|cost|valor|honorari|arancel|banco)/i, 'finance money business meeting'],
  [/\b(verific|revis|clasific|inspecci|analiz)/i, 'inspection checklist office review'],
  [/\b(china|asia|proveedor|fabric)/i, 'factory warehouse supplier global trade'],
  [/\b(estados unidos|usa|tlc|origen)/i, 'international trade world map logistics'],
];

function pexelsQuery(piece: { topic: string; pillar: string }): string {
  const haystack = `${piece.topic} ${piece.pillar}`;
  for (const [re, query] of STOCK_KEYWORDS) {
    if (re.test(haystack)) return query;
  }
  return 'business office professional meeting';
}

async function downloadClips(
  apiKey: string,
  query: string,
  targetSeconds: number,
  workDir: string,
): Promise<string[]> {
  // El tema/pilar mapea a una consulta fija (pexelsQuery es determinista), así
  // que sin variar página + orden acá, cada video con el mismo pilar pedía
  // siempre el mismo top-N de Pexels y terminaba con el mismo clip de apoyo.
  // Si la página al azar no tiene resultados (consultas angostas con pocos
  // clips), se reintenta con la página 1 en vez de fallar la generación.
  const fetchPage = async (page: number) => {
    const res = await fetch(
      `${PEXELS_BASE}?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=12&page=${page}`,
      { headers: { Authorization: apiKey } },
    );
    if (!res.ok) {
      throw new ProviderError(`Pexels API respondió ${res.status}`, { status: res.status });
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    return data.videos ?? [];
  };

  const page = 1 + Math.floor(Math.random() * 3);
  let videos = await fetchPage(page);
  if (videos.length === 0 && page !== 1) videos = await fetchPage(1);
  videos = shuffle(videos);
  if (videos.length === 0) {
    throw new ProviderError('Pexels no encontró clips para la búsqueda', { query });
  }

  const paths: string[] = [];
  let covered = 0;
  for (const video of videos) {
    if (covered >= targetSeconds) break;
    const file = bestVerticalFile(video);
    if (!file) continue;
    const bytes = await fetch(file.link).then((r) => r.arrayBuffer());
    const clipPath = path.join(workDir, `clip-${paths.length}.mp4`);
    await writeFile(clipPath, Buffer.from(bytes));
    paths.push(clipPath);
    covered += video.duration;
  }
  if (paths.length === 0) {
    throw new ProviderError('Ningún clip de Pexels tenía un archivo vertical descargable', { query });
  }
  return paths;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/** Prioriza el archivo vertical (9:16) de mejor calidad disponible. */
function bestVerticalFile(video: PexelsVideo): PexelsVideoFile | undefined {
  const vertical = video.video_files.filter((f) => f.height > f.width);
  const pool = vertical.length > 0 ? vertical : video.video_files;
  return [...pool].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/**
 * Subtítulos estimados: sin timestamps por palabra (evita depender de un
 * servicio de voz distinto), se reparte el tiempo total proporcional a la
 * longitud de cada fragmento — suficiente para lectura en redes (D33).
 */
function buildSrt(text: string, totalSeconds: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += 5) chunks.push(words.slice(i, i + 5));
  if (chunks.length === 0) return '';

  const totalChars = chunks.reduce((sum, c) => sum + c.join(' ').length, 0) || 1;
  let t = 0;
  const lines: string[] = [];
  chunks.forEach((chunk, i) => {
    const text2 = chunk.join(' ');
    const duration = (text2.length / totalChars) * totalSeconds;
    const start = t;
    const end = Math.min(t + duration, totalSeconds);
    lines.push(
      `${i + 1}`,
      `${srtTime(start)} --> ${srtTime(end)}`,
      text2,
      '',
    );
    t = end;
  });
  return lines.join('\n');
}

function srtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Envuelve PCM crudo (s16le) en un contenedor WAV mínimo para que ffmpeg lo lea sin flags especiales. */
function wrapPcmAsWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Concatena los clips (recortados a cubrir la narración), los escala/recorta a
 * 1080x1920, quema los subtítulos y mezcla la narración como único audio.
 */
async function assembleVideo(
  clipPaths: string[],
  narrationWavPath: string,
  srtPath: string,
  targetSeconds: number,
  outPath: string,
): Promise<void> {
  const concatListPath = path.join(path.dirname(outPath), 'concat.txt');
  await writeFile(
    concatListPath,
    clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf-8',
  );

  // Escapar la ruta del .srt para el filtro subtitles= (dos puntos y barras invertidas en Windows).
  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const vf =
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,' +
    `subtitles='${escapedSrt}':force_style='Fontsize=20,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=140'`;

  await run(ffmpegPath, [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-i', narrationWavPath,
    '-t', String(targetSeconds),
    '-vf', vf,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outPath,
  ]);
}
