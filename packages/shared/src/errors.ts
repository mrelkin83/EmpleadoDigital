/** Error base del dominio con código estable para logs/API. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Acción bloqueada por el Social Policy Engine. Nunca debe "resolverse" con un workaround (spec §8). */
export class PolicyViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('POLICY_VIOLATION', message, details);
  }
}

/** La plataforma/API oficial no soporta la operación: se marca como no soportada, no se evade (spec §42). */
export class UnsupportedOperationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('UNSUPPORTED_OPERATION', message, details);
  }
}

export class ApprovalRequiredError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('APPROVAL_REQUIRED', message, details);
  }
}

export class ProviderError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PROVIDER_ERROR', message, details);
  }
}
