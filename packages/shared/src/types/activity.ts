/**
 * Bitácora del empleado (spec §30) y observabilidad de agentes (spec §39).
 */
export interface ActivityEntry {
  id: string;
  tenantId: string;
  at: Date;
  actor: string; // agente o skill que ejecutó la acción
  /** Mensaje amigable para el usuario, p. ej. "Analicé el rendimiento de tus últimas 20 publicaciones." */
  summary: string;
  /** Explicabilidad (spec §31): objetivo, evidencia, decisión, resultado esperado. Sin razonamiento interno. */
  explanation?: {
    objective?: string;
    evidence?: string;
    decision?: string;
    expectedResult?: string;
  };
  kind: 'info' | 'action' | 'recommendation' | 'alert' | 'approval_request';
}

export interface AgentExecutionRecord {
  executionId: string;
  tenantId: string;
  agent: string;
  task: string;
  provider?: string;
  model?: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'succeeded' | 'failed' | 'awaiting_approval' | 'blocked_by_policy';
  costUsd?: number;
  toolCalls?: string[];
  errors?: string[];
}
