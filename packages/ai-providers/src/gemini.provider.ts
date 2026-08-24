import { ProviderError } from '@empleado/shared';
import type {
  AIProvider,
  GenerateStructuredInput,
  GenerateTextInput,
  GenerateTextOutput,
  ModelClass,
  ProviderCapabilities,
} from '@empleado/ai-core';
import { extractJson } from './anthropic.provider.js';

/**
 * Adapter de Google Gemini vía REST oficial (generativelanguage.googleapis.com).
 * Texto: gemini-2.5-pro (razonamiento/creativo) y gemini-2.5-flash (rápido).
 * Imagen: gemini-2.5-flash-image, expuesta como cliente aparte (generateGeminiImage)
 * porque la interfaz AIProvider del MVP solo modela texto.
 */
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly capabilities: ProviderCapabilities = {
    text: true,
    reasoning: true,
    vision: true,
    imageGeneration: true,
    videoGeneration: false,
    embeddings: false,
  };
  readonly models: Partial<Record<ModelClass, string>> = {
    reasoning: 'gemini-2.5-pro',
    creative: 'gemini-2.5-pro',
    fast: 'gemini-2.5-flash',
    image: 'gemini-2.5-flash-image',
  };

  constructor(private readonly apiKey: string) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const model = input.model ?? this.models.creative ?? 'gemini-2.5-pro';
    const data = await geminiRequest(this.apiKey, model, {
      ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 4096,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
    });

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('');
    if (!text) {
      throw new ProviderError('Gemini no devolvió texto', {
        model,
        finishReason: data.candidates?.[0]?.finishReason,
      });
    }

    return {
      text,
      model,
      ...(data.usageMetadata?.promptTokenCount !== undefined
        ? { inputTokens: data.usageMetadata.promptTokenCount }
        : {}),
      ...(data.usageMetadata?.candidatesTokenCount !== undefined
        ? { outputTokens: data.usageMetadata.candidatesTokenCount }
        : {}),
    };
  }

  async generateStructuredOutput<T>(
    input: GenerateStructuredInput,
    parse: (raw: string) => T,
  ): Promise<T> {
    const result = await this.generateText({
      ...input,
      system: [
        input.system ?? '',
        `Responde ÚNICAMENTE con JSON válido que cumpla este esquema: ${input.schemaDescription}. Sin markdown, sin explicaciones.`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
    const raw = extractJson(result.text);
    try {
      return parse(raw);
    } catch (err) {
      throw new ProviderError('La salida estructurada no cumple el esquema esperado', {
        raw: raw.slice(0, 500),
        cause: String(err),
      });
    }
  }
}

/** Genera una imagen con Gemini y devuelve sus bytes (PNG/JPEG según el modelo). */
export async function generateGeminiImage(
  apiKey: string,
  prompt: string,
  model = 'gemini-2.5-flash-image',
): Promise<{ bytes: Buffer; mimeType: string }> {
  const data = await geminiRequest(apiKey, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  const part = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new ProviderError('Gemini no devolvió imagen', {
      model,
      finishReason: data.candidates?.[0]?.finishReason,
    });
  }
  return {
    bytes: Buffer.from(part.inlineData.data, 'base64'),
    mimeType: part.inlineData.mimeType ?? 'image/png',
  };
}

async function geminiRequest(
  apiKey: string,
  model: string,
  body: unknown,
): Promise<GeminiResponse> {
  const response = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new ProviderError(`Gemini API respondió ${response.status}`, {
      status: response.status,
      message: data.error?.message?.slice(0, 300),
    });
  }
  return data;
}
