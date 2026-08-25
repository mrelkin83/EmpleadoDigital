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

### D17. Orquestador Fase 2 (primer tramo): calendario → borradores
`POST /api/calendar/generate-drafts` genera piezas solo para slots con tema concreto; los "Por definir" se reportan como pendientes de input humano — el sistema pide el dato, no lo inventa (spec §57, §63). Se ejecuta síncrono en la API para el MVP; cuando la semana completa use proveedor real (6 llamadas LLM), moverlo a un job del worker es el paso natural (la cola ya existe).

### D18. Hardening de inputs (spec §32)
`PUT /api/brand` y `PATCH /api/content/:id` pasan a schemas `.strict()` (rechazan campos desconocidos; `tenantId` inmutable) con topes de longitud en todos los strings. Motivo: la Brand Memory alimenta prompts — un campo sin tope es vector de prompt injection y de coste descontrolado.

## Pendientes conocidos (no implementar sin validar la fase)
- Validación E2E del OAuth con una app de Meta real (bloqueado por: crear la app — ver docs/GUIA_APP_META.md).
- Analytics con insights reales de Instagram (requiere cuenta conectada; no construir contra datos inventados).
- Mover generate-drafts a job del worker cuando se use proveedor real.
- Rate limiting HTTP global (@fastify/rate-limit) antes de exponer la API a internet.
- RBAC y multiusuario (§32) al pasar de tenant único.

## 2026-08-24 — App de Meta real conectada (OAuth E2E completado)

### D19. Subida de material propio (imagen/video) por pieza
`POST /api/content/:id/media` (multipart, JPEG/PNG/MP4, tope 100 MB) guarda el archivo en `uploads/` (fuera del repo) y lo sirve en `/media/<uuid>` para que la API de Instagram lo descargue por el túnel/dominio público (origen derivado de `OAUTH_REDIRECT_URI`, sin variable nueva). El publish usa el material adjunto si no se pasa `imageUrl`; el video se acepta y almacena pero aún no se publica (el flujo de reels es distinto — fase posterior). Dashboard: botón "Subir material" por pieza y "Publicar en Instagram" (con confirmación) solo para piezas aprobadas con imagen.

### D20. Bug corregido: el UPDATE de `saveContent` no persistía todos los campos editables
El `ON CONFLICT DO UPDATE` omitía `format/pillar/funnel/topic` (y ahora `media`): el PATCH parecía funcionar (la respuesta usaba el objeto en memoria) pero el cambio se perdía. Regla derivada: si un endpoint permite editar un campo, el upsert debe incluirlo — revisar ambos lados al añadir campos.

### D21. Community Manager por polling mientras la app no esté publicada
Verificado empíricamente (2026-08-24): con la app sin publicar, Meta no entrega NINGÚN webhook (ni de testers) y `GET /{media}/comments` devuelve `data: []` con cursores (contenido oculto). Publicar la app exige Verificación del negocio (fase SaaS). Mitigación: poller cada 2 min (`apps/api/src/pipeline/comment-poller.ts`) que lee comentarios de las últimas publicaciones y los inyecta al MISMO pipeline de los webhooks, con dedupe persistente (`processed_comments`, migración 0005) para que la convivencia polling+webhooks nunca duplique. El fix del contenedor de publicación (sondear `status_code` hasta FINISHED antes de `media_publish`; error 9007 si no) quedó en el conector. Página `/privacidad` servida por la API para el requisito de publicación.

### D22. Publicación programada: scheduler en el proceso de la API
`POST /api/content/:id/schedule` (aprobada + imagen + fecha futura → `scheduled`) y `/unschedule` (vuelta a `approved`). Un barrido cada 60s (`publish-scheduler.ts`) publica las piezas vencidas por el MISMO camino que la publicación manual (Quality Gate + Policy Engine + aprobación humana previa, que la transición approved→scheduled garantiza); si falla, la pieza pasa a `failed` con alerta en la bitácora — el humano ve qué no salió y por qué. Igual que D17/D21, corre dentro de la API para el MVP monoproceso; cuando haya despliegue multiproceso, mover el barrido a la cola del worker es mecánico (la cola ya existe).

### D23. Analista con reglas deterministas, bajo demanda
`GET /api/recommendations` + tarjeta "Recomendaciones del analista": reglas en código (D14: nada de conclusiones de LLM sobre números que puede malinterpretar) sobre datos reales — piezas fallidas, ritmo de publicación, calendario vacío o con temas pendientes, trabajo atascado (aprobadas sin programar, borradores acumulados), mejor pilar por interacciones (con ≥2 posts medibles) y mix de funnel reciente. Se calculan al momento de consultar: siempre actuales y sin ensuciar la bitácora con corridas periódicas (los reinicios del dev-watcher habrían generado ruido). El Investigador quedó validado con IA real: plan-week produce temas concretos (sin "Por definir") respetando el mix determinista.

### D24. Audiencia declarativa y feedback binario (del análisis de competencia)
Dos adopciones legítimas de docs/ANALISIS_COMPETENCIA_PATHSOCIAL_PLIXI.md: (1) `audience.location/ageRange/interests` opcionales en la Brand Memory, editables en `/marca` e inyectados en `brandContextForPrompt` — contexto de generación, NUNCA targeting de engagement (nivel 4). (2) Feedback binario persistido (`content_feedback`, migración 0007): cada aprobación/rechazo de contenido guarda veredicto + motivo + perfil de la pieza; el dashboard pide el motivo al rechazar, y los últimos 5 motivos de rechazo se inyectan como "preferencias aprendidas" en la generación siguiente (generate y generate-drafts). Semilla del AI-Match propio: con volumen, los patrones por pilar/formato permitirán ajustar el mix automáticamente.

### D25. Rate limiting global y reporte semanal
`@fastify/rate-limit` (300 req/min por IP) con exención para `/webhooks` y `/media` — el ritmo de Meta no lo controlamos y un 429 nuestro rompería webhooks o publicación. Reporte semanal en `GET /api/report/weekly` + página `/reporte` imprimible (botón Imprimir/PDF) para compartir con el cliente: publicaciones con métricas, leads nuevos, plan próximo y recomendaciones — determinista y bajo demanda (misma filosofía que D23); el envío automático (email/job del worker) queda para cuando haya despliegue con worker corriendo.

### D26. Fase 3 completa a nivel de código (validación en vivo bloqueada por Meta)
Pipeline de DMs (`message-pipeline.ts`, espejo del de comentarios: clasificación → lead → escalamiento | keyword → cooldown → Policy Engine) conectado al webhook. Reglas de keywords persistidas (`keyword_rules`, migración 0008) con seed del piloto, `GET/PUT /api/keywords` con recarga del matcher y editor en `/marca`. Hallazgo: el KeywordMatcher arrancaba sin reglas desde el inicio — el auto-responder era inerte. Todo queda listo para el día en que la app se publique y lleguen eventos.

### D27. Fase 4: reels, imagen de marca y variantes
`publishReel` en el conector (contenedor REELS, timeout de procesamiento 5 min); `publishPost` generalizado a `media {url, kind}` — el scheduler y el publish manual publican video como reel sin cambios extra. Generador de imágenes de marca con sharp (plantilla determinista 1080×1080: titular del hook, barra de acento, pilar y marca; sin coste por imagen) en `POST /api/content/:id/media/generate` + botón "Generar imagen" — desaparece el único paso manual del flujo. Variantes: `POST /api/content/:id/variant` regenera con ángulo distinto (`avoidSimilarTo`) aprendiendo del feedback.

### D28. Fase 5: aprendizaje determinista y planificación optimizada
`rankPillars` (`performance.ts`): puntuación explicable por pilar = interacciones promedio reales + 2×(aprobados−rechazados); pilares sin datos conservan el orden de marca ("sin datos no hay opinión"). `plan-week` acepta `pillarRanking` y arranca la rotación por los que mejor rinden (sigue rotando: variedad). Transparencia en `GET /api/insights/pillars`. El Analista añade recomendación proactiva cuando un pilar acumula rechazos. Experimentos formales (A/B de hooks/horarios) pospuestos hasta tener volumen: con 1-2 posts serían ruido, no ciencia.

### D30. El gancho (hook) siempre visible en el material gráfico, no solo en el caption
Instrucción directa del usuario: toda pieza generada (imagen IA, portada de carrusel, video) debe mostrar el hook en la gráfica misma — es lo que detiene el scroll; el caption se trunca en el feed y no basta. `hookBannerSvg` (banner superior: kicker del pilar + titular envuelto, mismo estilo que el footer de marca) se compone por plantilla — nunca lo escribe la IA — y se aplica en `generateAiImage` (encima de la foto), automáticamente en la portada del carrusel (reutiliza `generateAiImage`) y en video vía `burnBrandOverlay` (ffmpeg `overlay` filter sobre un PNG transparente renderizado con la misma técnica SVG). Dependencias nuevas: `ffmpeg-static` + `@ffprobe-installer/ffprobe` (binarios portátiles, sin instalación de sistema; `createRequire` para evitar ambigüedad ESM/CJS). Si el overlay de video falla, se publica sin él en vez de bloquear (degradación, no bloqueo). De paso corregido: `footerSvg` tenía coordenadas fijas a la plantilla de imagen (1080px) que rompían en el lienzo vertical del video; ahora recibe ancho/alto. Verificado con un video sintético (ffmpeg testsrc) antes de gastar una llamada real a Veo.

### D29. Gemini como segundo proveedor: texto de respaldo e imagenes IA
Con GEMINI_API_KEY (Google AI Studio; la suscripcion Gemini Pro del chat NO es la API), GeminiProvider entra al TaskRouter tras Anthropic (fallback de texto: gemini-2.5-pro/flash) y aporta la capacidad de imagen (gemini-2.5-flash-image). generateAiImage produce foto editorial 1:1 guiada por marca/tema con la regla "sin texto dentro de la imagen" (los modelos cometen erratas tipograficas; el copy vive en el caption) y cae automaticamente a la plantilla determinista si falla. UI: botones "Imagen IA" (default con clave) y "Plantilla". Video (Veo) pospuesto: API de pago por segundo, sin justificacion en fase piloto. Coste de imagen no registrado en ai_usage aun (free tier); anotar si se pasa a tier pago.

### D31. Rol/persona maestro del empleado de IA (configurable, no codigo duro)
Pestana nueva "Rol del empleado" (ruta /rol): textarea que edita `BrandMemory.aiRole`, un prompt maestro que `brandContextForPrompt` antepone a TODO el contexto de marca (gobierna generate-caption y plan-week: temas del calendario y borradores en cualquier formato). Plantilla sugerida (senior en marketing digital: exigencias de gancho, copy humano, una idea por pieza, CTA accionable, claridad sobre creatividad) vive en `DEFAULT_AI_ROLE` (packages/brand/pilot-profile.ts) y se sirve via GET /api/brand/role-template, fuente unica sin duplicar el texto en el frontend. Aplicada al tenant del piloto: verificado que sube la calidad del hook generado. Alcance deliberado: NO se inyecta en classify-comment (tarea de categorizacion, no de creacion; el escalamiento ALWAYS_HUMAN sigue en codigo, no en prompt).

### D32. Login del panel: single-admin, codigo de respaldo local, sin correo
Decision del usuario (previo a desplegar en VPS con dominio propio): el panel necesita autenticacion antes de exponerse a internet. Implementado sin servicio de correo (evita depender de un proveedor nuevo/coste): usuario unico por tenant, contrasena con scrypt (node:crypto, sin dependencia externa), y recuperacion via codigo de respaldo local tipo "XXXX-XXXX-XXXX" (alfabeto sin caracteres ambiguos) mostrado UNA sola vez al crear la cuenta o al regenerarlo, con hash guardado (mismo esquema que la contrasena) y rotacion automatica al usarse para restablecer.
Arquitectura: tablas `users`/`sessions` (migracion 0009); cookie de sesion httpOnly (`@fastify/cookie`) de 30 dias; guardian global en server.ts (`onRequest` hook) que exige sesion valida en TODA la API excepto una lista explicita de rutas publicas (webhooks de Meta, /media, /auth/instagram/callback, /health, y los 4 endpoints de cuenta necesarios para entrar: status/setup/login/reset-password). `/auth/instagram/login` (iniciar la conexion de Instagram) SI exige sesion: conectar una cuenta es accion sensible.
Frontend: middleware.ts de Next (edge) redirige a /login si falta la cookie, EXCLUYENDO explicitamente /api, /auth, /webhooks, /media, /health del matcher (bug real detectado y corregido en esta sesion: el matcher inicial solo excluia "login", interceptando tambien las llamadas a la API y devolviendo HTML de redireccion en vez de JSON, rompiendo el propio login). AuthGuard.tsx (parchea window.fetch) redirige si la API devuelve 401 en cualquier momento (sesion revocada), como defensa adicional a la comprobacion de borde. Pagina /cuenta: datos, cambio de contrasena, regenerar codigo de respaldo, cerrar sesion.
Verificado end-to-end con playwright-cli: crear cuenta -> login -> panel protegido -> /cuenta -> cerrar sesion -> vuelta a /login. 79 tests verdes (suite de la API adaptada con un helper `inject()` que adjunta la cookie de una sesion de prueba creada en beforeAll).

### D33. Video economico: voz de Gemini TTS + stock de Pexels + subtitulos (patron MoneyPrinterTurbo)
Adopcion de PATRON (reescrito, no codigo copiado) de harry0703/MoneyPrinterTurbo, verificado antes de adoptar (D10: instabot como precedente de este criterio) — usa Pexels/Pixabay por API oficial, sin scraping. Pipeline propio en `apps/api/src/pipeline/cheap-video.ts`: Gemini TTS (`gemini-2.5-flash-preview-tts`, PCM 24kHz/mono/16-bit, verificado contra docs oficiales antes de implementar — modelo y forma exacta de request/response confirmados via WebFetch, no inventados) narra el hook+cuerpo de la pieza; clips de stock de Pexels (`/v1/videos/search`, header `Authorization: <key>`, orientation=portrait) elegidos por un mapeo determinista tema->keywords en ingles (mismo patron que `pickIcon`); subtitulos estimados por proporcion de caracteres (sin timestamps por palabra: evita depender de un servicio de voz distinto solo por eso) quemados con el filtro `subtitles` de ffmpeg (libass); ensamblaje con `concat`+`crop`+mezcla de audio; y al final reutiliza `burnBrandOverlay` (ya existente, ahora exportado) para el mismo gancho+franja de marca que el resto del material.
Riesgo tecnico verificado ANTES de dar el trabajo por terminado: los builds estaticos de ffmpeg en Windows a veces fallan al quemar subtitulos por falta de fontconfig. Prueba sintetica con texto acentuado confirmo que renderiza correctamente en este binario (gyan.dev build via ffmpeg-static, con --enable-libass --enable-fontconfig --enable-libfreetype).
Endpoint `POST /api/content/:id/media/generate-video-cheap` (paralelo a `/generate-video` de Veo), boton "Video economico" en el dashboard junto a "Video IA (Veo)". Requiere `PEXELS_API_KEY` (gratis, sin tarjeta) ademas de la `GEMINI_API_KEY` ya configurada. Pendiente: prueba end-to-end real (falta la clave de Pexels del usuario).
