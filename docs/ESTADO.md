# Estado del proyecto — Empleado Digital de Marketing

**Última actualización:** 2026-08-24 · **Caso piloto:** Asesoría Aduanera (Instagram `PedroAbogadoAduanero`)
Documento rector: `SYSTEM_PROMPT_MAESTRO_AI_MARKETING_EMPLOYEE_V2_CONSOLIDADO.md` · Decisiones: `docs/DECISIONES.md` (D1–D28) · Guía de la app de Meta: `docs/GUIA_APP_META.md`

---

## Estado por fase del roadmap

| Fase | Estado | Notas |
|---|---|---|
| 0 — Fundación | ✅ Completa | Monorepo TS strict, PostgreSQL (8 migraciones), CI, 76 tests + lint + typecheck, rate limiting. Login del dashboard: fase de despliegue |
| 1 — Instagram MVP | ✅ Completa | OAuth real (5 permisos, token 60 días con refresh), publicación oficial verificada (post real + permalink), material propio, analytics con insights reales, IA real (claude-opus-5) |
| 2 — Empleado Digital | ✅ **Completa y validada** | Orquestador, agentes, skills, recomendaciones, bitácora, autonomía persistente. Validación E2E 2026-08-24: primera publicación programada salió sola (reel con video Veo, scheduler del orquestador) |
| 3 — Community Manager | ✅ Código completo · ⏸️ bloqueada por Meta | Pipelines de comentarios y DMs (clasificación→leads→escalamiento→respuesta con políticas), poller de comentarios, reglas de keywords con editor. Meta no entrega eventos ni contenido de comentarios hasta publicar la app |
| 4 — Multimedia | ✅ Completa | Subida de imagen/video, publicación de reels, generador de imágenes de marca (plantilla sharp, un clic), variantes de copy |
| 5 — Inteligencia | ✅ Núcleo operando | Ranking determinista de pilares (interacciones reales + feedback neto), planificación optimizada por rendimiento, recomendaciones proactivas, aprendizaje de motivos de rechazo. Experimentos A/B: pospuestos hasta tener volumen |
| 6 — SaaS | ⬜ Sin empezar | Multi-tenant (la arquitectura ya lo permite), billing, App Review de Meta + verificación del negocio |
| 7 — Multicanal | ⬜ Sin empezar | Facebook, TikTok, LinkedIn, YouTube, WhatsApp, email |

## Hitos verificados (2026-08-24)

1. App de Meta creada y conectada por OAuth (5 scopes, `missingScopes: []`).
2. Primera publicación real: https://www.instagram.com/p/DcbiyA1lnhm/ (flujo Draft→Gate→Approval→Publish→Verify completo).
3. Webhook verificado por Meta vía túnel; cuenta suscrita (`subscribed_apps`).
4. Primera generación con IA real: pasó el Quality Gate a la primera. Semana completa planificada (6 temas) y 6 borradores generados, todos con gate verde. Coste del día: ~$0.12 de $5.
5. Analytics con métricas reales en dashboard y reporte semanal imprimible.
6. Imagen de marca generada por plantilla verificada visualmente.

## Cómo se opera hoy (ciclo semanal)

1. `Planificar próxima semana` → calendario con temas IA priorizando pilares que rinden.
2. `Generar borradores` desde el calendario → cola de revisión.
3. Humano: revisa/edita, **rechaza con motivo** (el sistema aprende) o aprueba.
4. `Generar imagen` (plantilla de marca) o subir material propio (imagen/video).
5. `Programar` a la fecha del slot → el scheduler publica solo. `Publicar ya` también existe.
6. Métricas en **Rendimiento**, sugerencias en **Recomendaciones del analista**, `/reporte` imprimible para el cliente.

## Pendientes

### Del usuario (rodaje — cierra la validación de Fase 2)
- [ ] Revisar los 7 borradores; rechazar con motivo los flojos; aprobar el resto.
- [ ] Generar/subir imágenes y **programar** las piezas → primera publicación 100% autónoma.
- [ ] Borrar del perfil el post de prueba (imagen azul) si molesta.
- [ ] Decidir si se conservan o borran las capturas de pantalla en `docs/`.

### Bloqueados por Meta (se desbloquean al publicar la app — fase SaaS)
- [ ] Verificación del negocio + App Review → app publicada.
- [ ] Con eso: webhooks en vivo (comentarios/DMs), lectura de comentarios (el poller empezará a verlos sin cambios de código), respuestas automáticas del CM en producción.

### Técnicos (fase de despliegue, cuando el piloto valide)
- [ ] Login/autenticación del dashboard y despliegue con dominio propio (elimina ngrok y sus URLs rotativas en panel de Meta + `.env`).
- [ ] Mover poller/scheduler a la cola del worker (multi-proceso) y envío automático del reporte semanal (email).
- [ ] Onboarding guiado post-OAuth (marca → audiencia → primer calendario en una sesión).
- [ ] Experimentos A/B (hooks/horarios) cuando haya ≥10-15 posts publicados.
- [ ] Proveedor de imagen IA como alternativa a la plantilla (la plantilla queda de fallback).

### Recordatorios operativos
- Si se reinicia **ngrok** cambia la URL → actualizar `OAUTH_REDIRECT_URI` en `.env` y en el panel de Meta: Redirect URI, Callback URL del webhook y URL de política de privacidad.
- **Docker Desktop** debe estar corriendo (Postgres en 5433) antes de `npm run dev:api`; si la API arranca antes que Postgres, se relanza sola al tocar un archivo (o reiniciar el watcher).
- Token de Instagram vence 2026-10-23; se refresca solo si la API corre al menos una vez cerca del vencimiento.
- El presupuesto diario de IA es `AI_DAILY_BUDGET_USD=5` (consumo registrado en `ai_usage`).
