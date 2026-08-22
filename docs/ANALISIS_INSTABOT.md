# Análisis: repositorio juancadile/instabot y su complemento a esta plataforma

**Fecha:** 2026-08-21 · **Fuente analizada:** https://github.com/juancadile/instabot (clonado y revisado archivo por archivo)

## 1. Qué es instabot

Alternativa open-source a ManyChat: automatización de DMs de Instagram self-hosted (TypeScript/Node, Express, PostgreSQL, Docker/Railway). Funciona por **webhooks oficiales de Meta**: un comentario con keyword dispara un DM con plantilla, botones, captura de email y registro de leads.

## 2. Veredicto de cumplimiento (spec §8, §73, §90)

**Compatible.** instabot usa exclusivamente la **Instagram Graph API oficial** (`graph.instagram.com/v21.0`) con token OAuth de cuenta profesional:

- No hace scraping, ni automatiza follows/likes, ni compra seguidores, ni evade límites.
- Verifica la firma HMAC-SHA256 de cada webhook (comparación en tiempo constante).
- Aplica cooldowns por usuario+keyword y límite de 5 DMs/hora/usuario (anti-spam).
- Responde solo a usuarios que interactuaron primero con la cuenta propia (dato de procedencia autorizada según nuestro §80).

Clasificación en nuestra matriz de riesgo: sus acciones son **Nivel 3** (mensajería automática) → en nuestra plataforma pasan por el Social Policy Engine y la matriz de aprobación; nunca se ejecutan sin gobernanza.

## 3. Qué adoptamos (ya integrado en este repositorio)

| Patrón de instabot | Dónde vive ahora | Adaptación |
|---|---|---|
| Verificación de firma de webhooks (HMAC + `timingSafeEqual`) | `packages/social/src/instagram/webhook-verify.ts` | Idéntico en esencia; desacoplado de Express |
| Challenge de verificación GET de Meta | `webhook-verify.ts` + `apps/api/src/routes/webhooks.ts` | Igual |
| Parser de payloads (comments/messages/mentions, ignora echoes) | `packages/social/src/instagram/webhook-parser.ts` | Tipado defensivo, tolera payloads malformados |
| Matcher de keywords (exact/contains/word_boundary, prioridad, aliases) | `packages/social/src/community/keyword-matcher.ts` | Reglas por tenant (configuración, no `keywords.json` global) |
| Cooldown por usuario+regla y rate limit horario | `packages/social/src/community/cooldown.ts` | Igual, configurable |
| Cliente Graph API con retry/backoff | `packages/social/src/instagram/connector.ts` | Ampliado con flujo de publicación en 2 pasos + insights |
| Responder 200 en <5s y procesar async | `apps/api/src/routes/webhooks.ts` | Igual (setImmediate) |
| Captura de leads (upsert por ig_user_id) | Tabla `leads` + `store` | Con `tenant_id` y procedencia |
| Validación de entorno con zod | `apps/api/src/env.ts` | Igual |

## 4. Qué NO adoptamos y por qué

- **Envío de DM directo sin gobernanza:** en instabot, keyword match → DM inmediato. Aquí todo DM pasa por: clasificación IA → Policy Engine (scopes + procedencia + autonomía) → `allow` / `human_review`. En modo copiloto (default) el DM queda como solicitud de aprobación.
- **Configuración en archivo `keywords.json` global:** incompatible con multi-tenancy (spec §33); las reglas son datos por tenant.
- **Express:** el stack del spec propone Fastify/NestJS; usamos Fastify.
- **Envío de emails (Resend):** fuera del alcance del MVP (canal email = Fase 7). Documentado como referencia futura.
- **Follow handler / reminders:** se evaluarán contra el Policy Engine cuando toque la Fase 3 completa.

## 5. Qué aporta instabot que el spec no detallaba

1. **El mecanismo concreto de conversión comentario→conversación→lead** (el "CTA hacia WhatsApp/DM" del §78 tiene aquí una implementación probada).
2. La ventana de 5 segundos de Meta para responder webhooks (200 inmediato + proceso async).
3. El modelo de datos mínimo de leads y dm_log.
4. Detalles del endpoint `graph.instagram.com` (DMs con template de botones, campos de media).

## 6. Brechas de instabot que nuestra plataforma cubre

- Sin IA (respuestas fijas por plantilla) → aquí: clasificación y generación con Task Router multi-proveedor.
- Sin política/aprobación → aquí: Social Policy Engine + human-in-the-loop.
- Sin multi-tenant → aquí: `tenant_id` en todos los datos.
- Sin publicación de contenido ni analytics → aquí: flujo Draft→Quality Gate→Approval→Publish→Verify e insights.
- Sin bitácora/explicabilidad → aquí: activity_log con objetivo/evidencia/decisión.
