# Empleado Digital de Marketing (MVP — Fase 0/1)

Plataforma de empleado digital de Marketing + Community Manager con IA. Canal inicial: **Instagram mediante APIs oficiales de Meta**. Documento rector: [`SYSTEM_PROMPT_MAESTRO_AI_MARKETING_EMPLOYEE_V2_CONSOLIDADO.md`](./SYSTEM_PROMPT_MAESTRO_AI_MARKETING_EMPLOYEE_V2_CONSOLIDADO.md).

## Estructura

```
apps/
  api/      API HTTP (Fastify): brand memory, contenido, aprobaciones, bitácora, webhooks de Meta
  worker/   Worker de jobs en background (cola PostgreSQL)
  web/      Dashboard (Next.js): bitácora, aprobaciones, generación de contenido
packages/
  shared/        Tipos transversales: autonomía, procedencia de datos, actividad, errores, logger
  ai-core/       Abstracción AIProvider + AI Task Router + control de costes
  ai-providers/  Adapters: Anthropic (SDK oficial) y Mock (desarrollo)
  social/        Social Policy Engine, conector Instagram (Graph API), webhooks, keywords, cooldowns
  brand/         Brand Memory + perfil del caso piloto (derecho aduanero, Colombia)
  content/       Piezas con metadata (pilar/funnel), Quality Gate, calendario editorial
  skills/        generate_caption, classify_comment, publish_post
db/
  migrations/    Esquema PostgreSQL (multi-tenant desde el día 1)
docs/            Análisis de instabot, decisiones técnicas, reportes
```

## Arranque rápido (desarrollo)

```bash
npm install
cp .env.example .env          # completa lo que tengas (todo es opcional en dev)

# Opcional: PostgreSQL + Redis locales
docker compose up -d
npm run db:migrate

npm run dev:api               # API en http://127.0.0.1:3001
npm run dev:web               # Dashboard en http://localhost:3000
npm run dev:worker            # Worker (requiere DATABASE_URL)
```

Sin `DATABASE_URL` la API usa almacenamiento en memoria (solo desarrollo). Sin `ANTHROPIC_API_KEY` la IA es un mock con salida marcada `[MOCK]` que el Quality Gate bloquea para publicación — nunca se presenta contenido simulado como real.

## Verificación

```bash
npm test           # 56 tests (policy engine, task router, quality gate, webhooks, API)
npm run typecheck  # TypeScript strict en todo el monorepo
```

## Principios no negociables

- **Solo APIs oficiales.** Nada de scraping, compra de seguidores, engagement falso ni evasión de límites. El `SocialPolicyEngine` bloquea las acciones de Nivel 4 por diseño y ningún agente accede a APIs sociales sin pasar por él.
- **Autonomía dentro de límites.** Modo por defecto: copiloto (la IA propone, el humano aprueba). Campañas pagadas y cambios de presupuesto siempre requieren humano.
- **Multi-tenant desde el esquema.** El MVP opera con un tenant, sin mezclar datos jamás.
- **Sin secretos en el código.** Tokens y claves solo por variables de entorno.

## Estado (2026-08-21)

- ✅ Fase 0: monorepo, tipado estricto, tests, esquema de base de datos, observabilidad básica.
- ✅ Fase 1 (parcial): brand memory (seed piloto), generación de contenido con Quality Gate, flujo de aprobación, conector de publicación oficial, webhooks con pipeline de comentarios gobernado.
- ⏳ Pendiente: OAuth de Meta, analytics reales, calendario UI, más proveedores IA. Ver `docs/DECISIONES.md`.
