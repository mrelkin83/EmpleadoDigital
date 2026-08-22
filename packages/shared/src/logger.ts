import { pino } from 'pino';

/**
 * Logs estructurados (spec §34). Redacta campos sensibles: nunca registrar secretos (spec §39).
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      '*.accessToken',
      '*.apiKey',
      '*.token',
      '*.password',
      '*.secret',
      'headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
