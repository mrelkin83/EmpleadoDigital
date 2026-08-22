import Anthropic from '@anthropic-ai/sdk';
import { ProviderError } from '@empleado/shared';
import type {
  AIProvider,
  GenerateStructuredInput,
  GenerateTextInput,
  GenerateTextOutput,
  ModelClass,
  ProviderCapabilities,
} from '@empleado/ai-core';

/**
 * Adapter de Anthropic sobre el SDK oficial (@anthropic-ai/sdk).
 * Mapeo de clases de modelo (spec §15): tareas de razonamiento/creativas → Opus 5;
 * clasificación y tareas rápidas/baratas → Haiku 4.5.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    text: true,
    reasoning: true,
    vision: true,
    imageGeneration: false,
    videoGeneration: false,
    embeddings: false,
  };
  readonly models: Partial<Record<ModelClass, string>> = {
    reasoning: 'claude-opus-5',
    creative: 'claude-opus-5',
    fast: 'claude-haiku-4-5',
  };

  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    // El SDK resuelve credenciales del entorno si no se pasa apiKey explícita.
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const model = input.model ?? this.models.creative ?? 'claude-opus-5';
    const isReasoningModel = model.startsWith('claude-opus') || model.startsWith('claude-sonnet');

    const response = await this.client.messages.create({
      model,
      max_tokens: input.maxTokens ?? 4096,
      ...(input.system ? { system: input.system } : {}),
      // Adaptive thinking en modelos que lo soportan; Haiku 4.5 no lo usa aquí.
      ...(isReasoningModel ? { thinking: { type: 'adaptive' as const } } : {}),
      messages: [{ role: 'user', content: input.prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    if (response.stop_reason === 'refusal') {
      throw new ProviderError('El modelo declinó la petición por políticas de seguridad', {
        model,
        stopReason: response.stop_reason,
      });
    }

    return {
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
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

/** Extrae el primer bloque JSON de una respuesta (tolera fences de markdown). */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.search(/[[{]/);
  if (start === -1) return text.trim();
  return text.slice(start).trim();
}
