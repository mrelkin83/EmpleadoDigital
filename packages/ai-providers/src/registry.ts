import { logger } from '@empleado/shared';
import type { AIProvider } from '@empleado/ai-core';
import { AnthropicProvider } from './anthropic.provider.js';
import { MockProvider } from './mock.provider.js';

/**
 * Construye la lista de proveedores según las claves disponibles en el entorno.
 * Sin claves configuradas: MockProvider (solo desarrollo, salida marcada [MOCK]).
 * NOTA: la abstracción admite más proveedores (OpenAI, Google, ...); se añadirán como
 * adapters validados contra su documentación oficial (spec §55 regla 11: no inventar APIs).
 */
export function buildProvidersFromEnv(env: NodeJS.ProcessEnv = process.env): AIProvider[] {
  const providers: AIProvider[] = [];

  if (env['ANTHROPIC_API_KEY']) {
    providers.push(new AnthropicProvider(env['ANTHROPIC_API_KEY']));
  }

  if (providers.length === 0) {
    if (env['NODE_ENV'] === 'production') {
      throw new Error(
        'No hay proveedores de IA configurados. Define ANTHROPIC_API_KEY en producción.',
      );
    }
    logger.warn(
      'Sin claves de IA configuradas: usando MockProvider (salida marcada [MOCK], solo desarrollo)',
    );
    providers.push(new MockProvider());
  }

  return providers;
}
