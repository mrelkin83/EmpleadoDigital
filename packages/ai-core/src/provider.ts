/**
 * AI Provider Adapter (spec §37): interfaz común para todos los proveedores.
 * No todos implementan todas las capacidades; se descubren por metadata.
 */
export interface ProviderCapabilities {
  text: boolean;
  reasoning: boolean;
  vision: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  embeddings: boolean;
}

export interface GenerateTextInput {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Modelo concreto; si se omite, el adapter elige su default para la tarea. */
  model?: string;
}

export interface GenerateTextOutput {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateStructuredInput extends GenerateTextInput {
  /** Descripción del esquema JSON esperado (se valida con el parser del llamador). */
  schemaDescription: string;
}

export interface AIProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** Modelos disponibles por categoría de tarea; usado por el Task Router. */
  readonly models: Partial<Record<ModelClass, string>>;

  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateStructuredOutput<T>(input: GenerateStructuredInput, parse: (raw: string) => T): Promise<T>;
}

/** Clases de modelo que el router entiende (spec §15). */
export type ModelClass = 'reasoning' | 'creative' | 'fast' | 'image' | 'video' | 'embedding';
