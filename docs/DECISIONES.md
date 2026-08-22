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

## 2026-08-21 (2ª iteración) — OAuth y cierre de deudas

### D11. OAuth de Instagram (Business Login) implementado contra documentación oficial
Endpoints verificados en developers.facebook.com el mismo día: authorize en `www.instagram.com/oauth/authorize`, token corto en `api.instagram.com/oauth/access_token`, token de 60 días y refresh en `graph.instagram.com`. Anti-CSRF con `state` de un solo uso (TTL 10 min). Los scopes concedidos se toman de la respuesta del token y se validan contra los del MVP; si faltan, se registra alerta en la bitácora y el Policy Engine bloqueará las acciones sin permiso. Fallback de desarrollo: token por env var (Opción B en .env.example).

### D12. Tokens cifrados en reposo (AES-256-GCM)
`TOKEN_ENCRYPTION_KEY` (32 bytes hex) por entorno; el token nunca toca disco en claro (spec §32). Refresh proactivo al arrancar si vence en <10 días (y tiene >24h, requisito de Meta).

### D13. `ai_usage` persistido en PostgreSQL
`PgUsageSink` comparte el pool de `PgStore`; el presupuesto diario sobrevive reinicios. Con MemoryStore se mantiene el sink en memoria (solo dev).

## 2026-08-22 — Avance sin app de Meta (mientras el usuario la crea)

### D14. Calendario editorial: reglas deterministas + IA solo para temas
`planWeek` garantiza el mix de funnel (TOFU 3 / MOFU 2 / BOFU 1, spec §20) y la rotación de pilares por código, no por prompt: las reglas de negocio nunca dependen de que el LLM "se porte bien". La IA solo propone los temas; si su salida no es utilizable (o es mock), los temas quedan explícitamente "Por definir" para el humano (spec §57). Idempotencia por fecha: replanificar la misma semana no duplica slots.

### D15. Edición de borradores como parte del ciclo de aprobación
`PATCH /api/content/:id` en estados idea/draft/in_review/rejected; editar una pieza rechazada la devuelve a draft y resetea la aprobación a pending. Cada edición devuelve el Quality Gate recalculado para que el usuario vea qué falta (p. ej. el disclaimer).

### D16. ESLint ligero + CI
Flat config con typescript-eslint recommended sin reglas type-checked (ese coste ya lo paga tsc strict). Workflow de GitHub Actions (typecheck → lint → test → build web) listo para cuando exista remoto.

## Pendientes conocidos (no implementar sin validar la fase)
- Validación E2E del OAuth con una app de Meta real (bloqueado por: crear la app — ver docs/GUIA_APP_META.md).
- Obtener `username` del perfil tras OAuth (GET /me).
- Analytics con insights reales de Instagram (requiere cuenta conectada; no construir contra datos inventados).
- Vincular slots del calendario con generación automática de piezas (Fase 2, orquestador).
- RBAC y multiusuario (§32) al pasar de tenant único.
