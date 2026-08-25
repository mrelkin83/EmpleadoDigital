import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  generateRecoveryCode,
  generateSessionToken,
  hashPassword,
  hashRecoveryCode,
  verifyPassword,
  verifyRecoveryCode,
} from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
}

/**
 * Login del dashboard (single-admin por tenant hoy). Recuperación de
 * contraseña por código de respaldo local (sin servicio de correo, spec de
 * despliegue del usuario): el código se muestra UNA sola vez al crear la
 * cuenta o al regenerarlo, y se rota cada vez que se usa para restablecer.
 */
export function registerAccountRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ¿Ya existe la cuenta admin? El login muestra "crear cuenta" o "iniciar sesión" según esto.
  app.get('/api/account/status', async () => {
    const user = await ctx.store.getAnyUser(DEFAULT_TENANT_ID);
    return { hasAccount: user !== null };
  });

  const setupSchema = z
    .object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(200),
      password: z.string().min(8).max(200),
    })
    .strict();

  app.post('/api/account/setup', async (request, reply) => {
    const existing = await ctx.store.getAnyUser(DEFAULT_TENANT_ID);
    if (existing) {
      return reply.status(409).send({ error: 'account_exists', message: 'Ya existe una cuenta.' });
    }
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const recoveryCode = generateRecoveryCode();
    const now = new Date();
    const user = {
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash: hashPassword(parsed.data.password),
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      createdAt: now,
      updatedAt: now,
    };
    await ctx.store.createUser(user);
    await startSession(ctx, reply, user.id);
    await ctx.logActivity({
      actor: 'usuario',
      kind: 'info',
      summary: `Se creó la cuenta del panel (${user.email}).`,
    });
    // El código de respaldo se muestra una única vez; nunca se vuelve a poder consultar.
    return reply.status(201).send({ name: user.name, email: user.email, recoveryCode });
  });

  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) }).strict();

  app.post('/api/account/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body' });
    }
    const user = await ctx.store.getUserByEmail(DEFAULT_TENANT_ID, parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
    }
    await startSession(ctx, reply, user.id);
    return { name: user.name, email: user.email };
  });

  app.post('/api/account/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await ctx.store.deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { loggedOut: true };
  });

  app.get('/api/account/me', async (request, reply) => {
    const user = await authenticatedUser(ctx, request);
    if (!user) return reply.status(401).send({ error: 'unauthenticated' });
    return { name: user.name, email: user.email };
  });

  const updateMeSchema = z.object({ name: z.string().min(1).max(120), email: z.string().email().max(200) }).strict();

  app.put('/api/account/me', async (request, reply) => {
    const user = await authenticatedUser(ctx, request);
    if (!user) return reply.status(401).send({ error: 'unauthenticated' });
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    await ctx.store.updateUser({
      ...user,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      updatedAt: new Date(),
    });
    return { name: parsed.data.name, email: parsed.data.email.toLowerCase() };
  });

  const changePasswordSchema = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
    .strict();

  app.post('/api/account/change-password', async (request, reply) => {
    const user = await authenticatedUser(ctx, request);
    if (!user) return reply.status(401).send({ error: 'unauthenticated' });
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      return reply.status(401).send({ error: 'invalid_credentials', message: 'La contraseña actual no coincide.' });
    }
    await ctx.store.updateUser({
      ...user,
      passwordHash: hashPassword(parsed.data.newPassword),
      updatedAt: new Date(),
    });
    return { updated: true };
  });

  /** Regenera el código de respaldo (rota el anterior); se muestra una sola vez. */
  app.post('/api/account/regenerate-recovery-code', async (request, reply) => {
    const user = await authenticatedUser(ctx, request);
    if (!user) return reply.status(401).send({ error: 'unauthenticated' });
    const parsed = z.object({ currentPassword: z.string().min(1) }).strict().safeParse(request.body);
    if (!parsed.success || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      return reply.status(401).send({ error: 'invalid_credentials', message: 'La contraseña actual no coincide.' });
    }
    const recoveryCode = generateRecoveryCode();
    await ctx.store.updateUser({
      ...user,
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      updatedAt: new Date(),
    });
    return { recoveryCode };
  });

  const resetSchema = z
    .object({
      email: z.string().email(),
      recoveryCode: z.string().min(1).max(20),
      newPassword: z.string().min(8).max(200),
    })
    .strict();

  app.post('/api/account/reset-password', async (request, reply) => {
    const parsed = resetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const user = await ctx.store.getUserByEmail(DEFAULT_TENANT_ID, parsed.data.email);
    if (!user || !verifyRecoveryCode(parsed.data.recoveryCode, user.recoveryCodeHash)) {
      return reply.status(401).send({
        error: 'invalid_recovery_code',
        message: 'El correo o el código de respaldo no coinciden.',
      });
    }
    // El código se rota al usarse: uno nuevo reemplaza al que se acaba de gastar.
    const newRecoveryCode = generateRecoveryCode();
    await ctx.store.updateUser({
      ...user,
      passwordHash: hashPassword(parsed.data.newPassword),
      recoveryCodeHash: hashRecoveryCode(newRecoveryCode),
      updatedAt: new Date(),
    });
    await ctx.logActivity({
      actor: 'usuario',
      kind: 'alert',
      summary: 'Se restableció la contraseña del panel con el código de respaldo.',
    });
    return { reset: true, recoveryCode: newRecoveryCode };
  });
}

async function startSession(ctx: AppContext, reply: FastifyReply, userId: string): Promise<void> {
  const token = generateSessionToken();
  await ctx.store.createSession({
    id: token,
    userId,
    createdAt: new Date(),
    expiresAt: sessionExpiry(),
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

/** Resuelve el usuario autenticado a partir de la cookie de sesión, o null. */
export async function authenticatedUser(ctx: AppContext, request: FastifyRequest) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await ctx.store.getSession(token);
  if (!session) return null;
  return ctx.store.getUserById(session.userId);
}
