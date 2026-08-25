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
docs/            Análisis de instabot, decisiones técnicas, guía de la app de Meta
```

## Arranque rápido (desarrollo)

```bash
npm install
cp .env.example .env          # completa lo que tengas (todo es opcional en dev)

# Opcional: PostgreSQL + Redis locales
docker compose up -d
npm run db:migrate

npm run dev:api               # API en http://127.0.0.1:3001
npm run dev:web               # Dashboard en http://localhost:3010
npm run dev:worker            # Worker (requiere DATABASE_URL)
```

Para conectar Instagram real, sigue **[docs/GUIA_APP_META.md](./docs/GUIA_APP_META.md)** (crear la app en developers.facebook.com, OAuth y webhooks paso a paso).

Sin `DATABASE_URL` la API usa almacenamiento en memoria (solo desarrollo). Sin `ANTHROPIC_API_KEY` la IA es un mock con salida marcada `[MOCK]` que el Quality Gate bloquea para publicación — nunca se presenta contenido simulado como real.

## Verificación

```bash
npm test           # 79 tests (policy engine, task router, quality gate, webhooks, API)
npm run typecheck  # TypeScript strict en todo el monorepo
npm run lint        # ESLint flat config
```

## Principios no negociables

- **Solo APIs oficiales.** Nada de scraping, compra de seguidores, engagement falso ni evasión de límites. El `SocialPolicyEngine` bloquea las acciones de Nivel 4 por diseño y ningún agente accede a APIs sociales sin pasar por él.
- **Autonomía dentro de límites.** Modo por defecto: copiloto (la IA propone, el humano aprueba). Campañas pagadas y cambios de presupuesto siempre requieren humano.
- **Multi-tenant desde el esquema.** El MVP opera con un tenant, sin mezclar datos jamás.
- **Sin secretos en el código.** Tokens y claves solo por variables de entorno.

## Estado (2026-08-25)

Estado detallado y pendientes actualizados: **[docs/ESTADO.md](./docs/ESTADO.md)**. Historial de decisiones técnicas: **[docs/DECISIONES.md](./docs/DECISIONES.md)**.

- ✅ Fases 0-5 del roadmap construidas: OAuth real de Instagram, publicación oficial (imagen/carrusel/reel) verificada con la cuenta del piloto, generación de contenido con IA (Anthropic + Gemini), calendario editorial, orquestador con publicación programada autónoma, Community Manager (pipeline listo, a la espera de que Meta publique la app), analytics, recomendaciones del analista y rol/persona configurable del empleado.
- ✅ Generación de material gráfico con IA: fotografía editorial (Gemini), carruseles con portada + láminas infográficas, video corto (Veo) — todos con el gancho de la pieza y la marca (logo, colores, contacto) estampados automáticamente.
- ⏳ Pendiente: autenticación del dashboard, despliegue con dominio propio (Docker), fases 6-7 (SaaS multi-tenant, multicanal).
