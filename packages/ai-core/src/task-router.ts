import { DomainError, ProviderError } from '@empleado/shared';
import type { AIProvider, GenerateTextInput, GenerateTextOutput, ModelClass } from './provider.js';
import { estimateCostUsd, type UsageSink } from './usage.js';

/**
 * AI Task Router (spec §15): "para esta tarea, ¿qué modelo es el más adecuado?".
 * La lógica de negocio pide una tarea; el router elige proveedor/modelo, registra
 * uso/coste y aplica límites de presupuesto (spec §38, §50).
 */
export type TaskType =
  | 'strategic_analysis'
  | 'copywriting'
  | 'classification'
  | 'complex_planning'
  | 'research_synthesis'
  | 'image_generation'
  | 'video_generation';

const TASK_TO_MODEL_CLASS: Record<TaskType, ModelClass> = {
  strategic_analysis: 'reasoning',
  copywriting: 'creative',
  classification: 'fast',
  complex_planning: 'reasoning',
  research_synthesis: 'reasoning',
  image_generation: 'image',
  video_generation: 'video',
};

export interface RouteOverride {
  provider?: string;
  model?: string;
}

export interface TaskRequest {
  tenantId: string;
  taskType: TaskType;
  input: GenerateTextInput;
  /** Selección manual del administrador (spec §14). */
  override?: RouteOverride;
}

export interface TaskResult extends GenerateTextOutput {
  provider: string;
  selectionReason: string;
  estimatedCostUsd: number;
}

export class BudgetExceededError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BUDGET_EXCEEDED', message, details);
  }
}

export interface TaskRouterOptions {
  dailyBudgetUsd?: number;
}

export class TaskRouter {
  constructor(
    private readonly providers: AIProvider[],
    private readonly usage: UsageSink,
    private readonly options: TaskRouterOptions = {},
  ) {
    if (providers.length === 0) {
      throw new ProviderError('TaskRouter requiere al menos un proveedor de IA');
    }
  }

  /** Elige el proveedor: override manual > primer proveedor con la capacidad y modelo para la clase. */
  select(taskType: TaskType, override?: RouteOverride): { provider: AIProvider; model: string; reason: string } {
    const modelClass = TASK_TO_MODEL_CLASS[taskType];

    if (override?.provider) {
      const p = this.providers.find((x) => x.name === override.provider);
      if (!p) throw new ProviderError(`Proveedor no registrado: ${override.provider}`);
      const model = override.model ?? p.models[modelClass];
      if (!model) {
        throw new ProviderError(
          `El proveedor ${p.name} no tiene modelo para la clase "${modelClass}"`,
        );
      }
      return { provider: p, model, reason: 'manual_override' };
    }

    for (const p of this.providers) {
      const model = p.models[modelClass];
      if (model && this.hasCapability(p, modelClass)) {
        return { provider: p, model, reason: `first_capable:${modelClass}` };
      }
    }
    throw new ProviderError(
      `Ningún proveedor registrado soporta la clase de modelo "${modelClass}" (tarea: ${taskType})`,
    );
  }

  async run(request: TaskRequest): Promise<TaskResult> {
    const { provider, model, reason } = this.select(request.taskType, request.override);

    const budget = this.options.dailyBudgetUsd;
    if (budget !== undefined) {
      const spent = await this.usage.spentTodayUsd(request.tenantId);
      if (spent >= budget) {
        throw new BudgetExceededError(
          `Presupuesto diario de IA agotado (${spent.toFixed(4)}/${budget} USD)`,
          { tenantId: request.tenantId },
        );
      }
    }

    const start = Date.now();
    let output: GenerateTextOutput | undefined;
    let success = false;
    try {
      output = await provider.generateText({ ...request.input, model });
      success = true;
      return {
        ...output,
        provider: provider.name,
        selectionReason: reason,
        estimatedCostUsd: estimateCostUsd(output.inputTokens, output.outputTokens),
      };
    } finally {
      await this.usage.record({
        tenantId: request.tenantId,
        provider: provider.name,
        model: output?.model ?? model,
        operation: request.taskType,
        ...(output?.inputTokens !== undefined ? { inputTokens: output.inputTokens } : {}),
        ...(output?.outputTokens !== undefined ? { outputTokens: output.outputTokens } : {}),
        estimatedCostUsd: estimateCostUsd(output?.inputTokens, output?.outputTokens),
        durationMs: Date.now() - start,
        success,
        selectionReason: reason,
        at: new Date(),
      });
    }
  }

  private hasCapability(p: AIProvider, modelClass: ModelClass): boolean {
    switch (modelClass) {
      case 'reasoning':
        return p.capabilities.reasoning;
      case 'creative':
      case 'fast':
        return p.capabilities.text;
      case 'image':
        return p.capabilities.imageGeneration;
      case 'video':
        return p.capabilities.videoGeneration;
      case 'embedding':
        return p.capabilities.embeddings;
    }
  }
}
