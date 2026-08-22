# Registro de decisiones técnicas (ADR-lite)

## 2026-08-21 — Fundación del proyecto

### D1. Monorepo con npm workspaces (sin pnpm/turbo)
El entorno solo tiene npm; añadir tooling global sin supervisión sería dependencia innecesaria (spec §55.5). Los paquetes exportan TypeScript fuente (`main: ./src/index.ts`) y las apps corren con `tsx`; el gate de compilación es `npm run typecheck` (tsc strict + exactOptionalPropertyTypes). Build de producción por app (Next build ya funciona; bundling de la API cuando se despliegue).

### D2. Fastify en lugar de NestJS
El spec §34 permite ambos. Fastify: menos dependencias, arranque más simple, suficiente para el MVP. Si la superficie crece, NestJS se reevalúa (decisión documentada, spec §36).

### D3. PostgreSQL vía Docker (puerto 5433) + fallback en memoria
Laragon no incluye PostgreSQL (tiene MySQL). El spec fija PostgreSQL; se provee `docker-compose.yml`. Para que el proyecto arranque sin Docker, la API usa `MemoryStore` cuando no hay `DATABASE_URL` (con warning explícito de no persistencia). El esquema completo está en `db/migrations/0001_init.sql` y `PgStore` lo implementa.

### D4. Proveedor IA inicial: Anthropic (SDK oficial) + MockProvider
La abstracción `AIProvider` (spec §37) está implementada y el Task Router no conoce proveedores concretos. Solo se implementó el adapter de Anthropic porque es verificable contra documentación oficial en esta sesión; añadir OpenAI/Google es escribir un adapter (regla §55.11: no inventar APIs). Sin claves, MockProvider con salida marcada `[MOCK]` que el Quality Gate bloquea para publicación (spec §57).

### D5. Mapeo de modelos del Task Router
reasoning/creative → `claude-opus-5`; fast (clasificación) → `claude-haiku-4-5` (spec §15: clasificación va a modelo rápido/barato). Configurable por override manual del administrador.

### D6. Cola de jobs sobre PostgreSQL (sin Redis/BullMQ todavía)
`SELECT ... FOR UPDATE SKIP LOCKED` soporta el volumen del MVP con una pieza menos de infraestructura. Redis está previsto en docker-compose para cuando el volumen o la programación fina lo exijan.

### D7. Autonomía por defecto: modo copiloto
Todo lo configurable requiere aprobación humana hasta que el usuario lo relaje (spec §10: nunca asumir permiso ilimitado). `paid_campaign`, `strategy_change`, `budget_change` no son relajables por diseño.

### D8. Acciones prohibidas catalogadas explícitamente
El Policy Engine enumera las acciones Nivel 4 (scraping, mass_follow, buy_followers, etc.) para **bloquearlas y auditarlas**, no para implementarlas. Así, si un flujo futuro intenta pedirlas, hay un punto único de rechazo con log (spec §82, §90).

### D9. Tenant único con arquitectura multi-tenant
`tenant_id` viaja en todos los datos desde el día 1 (spec §33); el MVP opera con `DEFAULT_TENANT_ID` fijo. El paso a SaaS no requiere migración de esquema.

### D10. instabot como referencia, no como dependencia
Se adaptaron patrones (ver docs/ANALISIS_INSTABOT.md) reescritos dentro de nuestra arquitectura con gobernanza. No se importa código suyo como librería.

## Pendientes conocidos (no implementar sin validar la fase)
- OAuth real de Meta (onboarding §10 paso 4): hoy el token entra por env var.
- Persistencia de `ai_usage` en PostgreSQL (hoy sink en memoria; tabla ya creada).
- ESLint (gate actual: tsc strict; añadir linter en CI).
- CI/CD (Fase 0 del roadmap; definir cuando exista remoto git).
- Cifrado de tokens en reposo y RBAC (§32) al pasar a multiusuario.
