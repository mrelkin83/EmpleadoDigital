import type {
  AIProvider,
  GenerateStructuredInput,
  GenerateTextInput,
  GenerateTextOutput,
  ModelClass,
  ProviderCapabilities,
} from '@empleado/ai-core';

/**
 * Proveedor simulado para desarrollo y tests (spec §57: el mock data debe estar
 * claramente identificado y NUNCA presentarse como información real).
 * Toda salida va prefijada con [MOCK] para que ningún flujo la confunda con contenido real.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly capabilities: ProviderCapabilities = {
    text: true,
    reasoning: true,
    vision: false,
    imageGeneration: false,
    videoGeneration: false,
    embeddings: false,
  };
  readonly models: Partial<Record<ModelClass, string>> = {
    reasoning: 'mock-reasoning',
    creative: 'mock-creative',
    fast: 'mock-fast',
  };

  /** Respuestas programadas para tests; si está vacía se genera un eco del prompt. */
  private queue: string[] = [];

  enqueue(...responses: string[]): void {
    this.queue.push(...responses);
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const canned = this.queue.shift();
    const text = canned ?? `[MOCK] Respuesta simulada para: ${input.prompt.slice(0, 120)}`;
    return {
      text,
      model: input.model ?? 'mock-creative',
      inputTokens: Math.ceil(input.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }

  async generateStructuredOutput<T>(
    input: GenerateStructuredInput,
    parse: (raw: string) => T,
  ): Promise<T> {
    const result = await this.generateText(input);
    return parse(result.text);
  }
}
