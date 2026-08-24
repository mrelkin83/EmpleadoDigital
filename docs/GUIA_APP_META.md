# Guía paso a paso: crear la app de Meta y conectar Instagram

**Objetivo:** dejar funcionando la conexión oficial entre esta plataforma y la cuenta profesional de Instagram del caso piloto.
**Tiempo estimado:** 30-45 minutos.
**Verificada contra la documentación oficial de Meta el 2026-08-22 y contra el panel real el 2026-08-24** (app del piloto creada siguiendo estos pasos). Los nombres exactos de menús pueden variar ligeramente si Meta rediseña el panel; los conceptos no.

---

## Requisitos previos

1. **Cuenta de Instagram profesional** (tipo *Empresa* o *Creador*). Si la cuenta del abogado es personal:
   - Instagram → Configuración → *Tipo de cuenta y herramientas* → *Cambiar a cuenta profesional*.
   - No requiere página de Facebook vinculada (ventaja de la variante "Instagram Login" que usamos).
2. **Cuenta en Meta for Developers**: entra a https://developers.facebook.com con tu cuenta de Facebook y acepta los términos de desarrollador.
3. El proyecto corriendo en local: PostgreSQL vía Docker Desktop (`docker compose up -d postgres`, luego `npm run db:migrate` la primera vez) y la API (`npm run dev:api`). Los scripts `dev:*` y `db:migrate` cargan el `.env` de la raíz automáticamente (flag `--env-file-if-exists` de Node); sin Docker, la API arranca en modo memoria (no persistente).

---

## Paso 1 — Crear la app

El asistente actual de Meta tiene 5 pasos: *Detalles de la app → Casos de uso → Negocio → Requisitos → Resumen*. Ya **no existe** la pantalla de "tipo de app" (Empresa/Business); el tipo se asigna automáticamente según el caso de uso elegido.

1. Ve a https://developers.facebook.com/apps y pulsa **Crear app**.
2. **Detalles de la app:** nombre sugerido `Empleado Digital Marketing` (o el nombre comercial que quieras) y tu email de contacto.
3. **Casos de uso:** son ~20 con casillas de selección. Usa el filtro lateral **"Administración de contenido"** para encontrarlo rápido y marca **"Administrar mensajes y contenido en Instagram"** (el que menciona la API de Instagram con inicio de sesión de Instagram). Este caso de uso añade automáticamente el producto Instagram — luego puedes saltarte el Paso 2 de esta guía.
4. **Negocio:** pregunta si conectas un portafolio comercial (Business Manager). Elige la opción de omitir / "todavía no"; se puede asociar después.
5. **Requisitos:** pantalla solo informativa — "Verificación del negocio" y "Revisión de la app" son requisitos para *publicar* la app (fase SaaS), no bloquean el modo desarrollo. **Siguiente**.
6. **Resumen:** confirma y pulsa **Crear app**.

> Al crear la app pueden quedar seleccionados casos de uso extra (oEmbed, "Administrar todos los aspectos de tu página"). No estorban en modo desarrollo; se pueden eliminar desde **Personalizar** en cada uno, o dejar ahí.

## Paso 2 — Añadir el producto Instagram

> Si en el Paso 1 elegiste el caso de uso de Instagram, este paso ya está hecho.

1. En **Casos de uso**, pulsa **Personalizar** en "Administrar mensajes y contenido en Instagram". Llegas a la pantalla **"API de Instagram" → Configuración de la API con inicio de sesión de Instagram**. **Esta es la pantalla principal donde harás casi todo.** Tiene 5 secciones numeradas: permisos, tokens de acceso/cuentas, webhooks, inicio de sesión de empresa y revisión de la app.
2. En la **sección 1 (permisos)**, pulsa **"Add all required permissions"**. Ojo: eso agrega solo 3 permisos (`instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`). **Agrega también `instagram_business_content_publish`** desde **Permisos y funciones** (menú lateral) — sin él no se puede publicar.

## Paso 3 — Copiar las credenciales de la app

En esa misma pantalla (o en **Configuración de la app → Básica**):

| Dato en el panel | Variable en nuestro `.env` |
|---|---|
| **ID de la app de Instagram** (Instagram App ID) | `INSTAGRAM_APP_ID` |
| **Secreto de la app de Instagram** (Instagram App Secret) | `INSTAGRAM_APP_SECRET` |
| **Secreto de la app** general (Configuración → Básica → App Secret) | `META_APP_SECRET` (firma de webhooks) |

> ⚠️ Ojo: el *Instagram App ID/Secret* (del producto Instagram) y el *App ID/Secret* general de Meta son **cosas distintas**. Para el OAuth usamos los de Instagram; para verificar la firma de los webhooks, el secreto general (`META_APP_SECRET`).

## Paso 4 — Configurar el inicio de sesión (Business Login)

1. En **Instagram → API setup with Instagram business login**, busca **Business login settings** / *Configurar inicio de sesión de empresa*.
2. En **OAuth Redirect URIs** agrega exactamente la URL que pondrás en `OAUTH_REDIRECT_URI`. Meta exige **HTTPS**, así que en desarrollo usa un túnel (Paso 6):
   ```
   https://TU-SUBDOMINIO.ngrok-free.app/auth/instagram/callback
   ```
3. Guarda. Si la URI del panel y la del `.env` difieren en un solo carácter (barra final incluida), el OAuth fallará con `redirect_uri mismatch`.

## Paso 5 — Configurar webhooks

1. En la misma pantalla de configuración de Instagram hay una sección **Webhooks** (*Configure webhooks*).
2. **Callback URL:**
   ```
   https://TU-SUBDOMINIO.ngrok-free.app/webhooks/meta
   ```
3. **Verify token:** inventa una cadena aleatoria (ej. `empleado-digital-verify-2026`) y ponla igual en el panel y en `META_VERIFY_TOKEN` del `.env`. Nuestra API debe estar corriendo cuando pulses *Verificar y guardar*: Meta hará un GET de challenge que ya respondemos automáticamente.
4. **Campos de suscripción:** activa al menos `comments`, `messages` y `mentions` (live_comments/message_reactions son opcionales).

## Paso 6 — Túnel HTTPS en desarrollo (ngrok, ya incluido en Laragon)

ngrok requiere una **cuenta gratuita y su authtoken** (una sola vez; sin él falla con `ERR_NGROK_4018`):

1. Crear cuenta en https://dashboard.ngrok.com/signup y copiar el token de https://dashboard.ngrok.com/get-started/your-authtoken
2. Configurarlo y arrancar el túnel:

```powershell
# Laragon trae ngrok en C:\laragon\bin\ngrok
C:\laragon\bin\ngrok\ngrok.exe config add-authtoken TU_TOKEN   # solo la primera vez
C:\laragon\bin\ngrok\ngrok.exe http 3001
```

- Copia la URL pública que te dé (dominios actuales: `https://xxxx.ngrok-free.dev`) y úsala en los pasos 4 y 5 y en `OAUTH_REDIRECT_URI`. También se puede consultar en http://127.0.0.1:4040 con ngrok corriendo.
- **La URL gratuita de ngrok cambia en cada arranque**: si reinicias ngrok, actualiza la Redirect URI y la Callback URL en el panel de Meta y el `.env`. (Cuando haya servidor propio con dominio, esto desaparece.)

## Paso 7 — Añadir la cuenta de Instagram como tester

Mientras la app esté **en modo desarrollo** solo pueden conectarse cuentas autorizadas:

1. **Primero el rol, luego la cuenta.** Si pulsas "Agregar cuenta" (sección 2 de la pantalla de la API) sin haber asignado el rol, Meta devuelve **"Rol de desarrollador insuficiente"**. El orden correcto:
   - **Roles de la app → Roles → Agregar personas → Tester de Instagram** → escribir el @usuario de la cuenta del piloto → enviar invitación.
2. Desde esa cuenta de Instagram (más fácil en instagram.com): Configuración → *Sitio web y permisos* (o *Apps y sitios web*) → **Invitaciones de tester** → aceptar.
3. Volver a **API de Instagram → sección 2 → Agregar cuenta** e iniciar sesión con la cuenta del piloto.

## Paso 8 — Completar el `.env` y conectar

```dotenv
INSTAGRAM_APP_ID=<paso 3>
INSTAGRAM_APP_SECRET=<paso 3>
META_APP_SECRET=<paso 3>
META_VERIFY_TOKEN=<paso 5>
OAUTH_REDIRECT_URI=https://TU-SUBDOMINIO.ngrok-free.app/auth/instagram/callback
WEB_BASE_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=<generar una vez y NO perderla>
```

Generar la clave de cifrado:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Reinicia la API (`npm run dev:api`), abre el dashboard (`npm run dev:web` → http://localhost:3000) y pulsa **Conectar Instagram**. Inicia sesión con la cuenta profesional y acepta los 4 permisos.

> Durante el callback aparecerá **una página de aviso de ngrok** ("You are about to visit..."): es el interstitial del plan gratuito, no un error. Pulsa **Visit Site** y el flujo continúa; solo sale una vez por navegador y no afecta a los webhooks (servidor-a-servidor). Al final vuelves al dashboard con `?connect=ok`.

**Verificación:** `GET http://127.0.0.1:3001/api/social/status` debe mostrar `connected: true`, `via: "oauth"`, `missingScopes: []` y la fecha de vencimiento del token (~60 días; se refresca solo).

> ✅ **Flujo completo verificado el 2026-08-24** con la app del piloto (`PedroAbogadoAduanero-IG`): webhook verificado por Meta vía túnel y OAuth conectado con los 4 scopes.

## Atajo mientras tanto (sin OAuth): token desde el panel

Si quieres probar publicación/DMs antes de montar el túnel, el propio panel genera un token de 60 días:

1. **Instagram → API setup → Generar token** junto a la cuenta conectada.
2. Inicia sesión, copia el token y ponlo en el `.env` como **Opción B**:
   ```dotenv
   INSTAGRAM_ACCESS_TOKEN=<token copiado>
   INSTAGRAM_BUSINESS_ACCOUNT_ID=<user_id>
   ```
3. El `user_id` se obtiene con:
   ```powershell
   curl "https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=EL_TOKEN"
   ```

Este atajo no tiene refresh automático ni cifrado en base de datos: es solo para desarrollo. El flujo definitivo es el OAuth.

---

## App Review (para salir del modo desarrollo)

Con la app en desarrollo todo funciona **solo con las cuentas tester** — suficiente para validar el MVP con el caso piloto. Para que cualquier cliente conecte su cuenta (fase SaaS), hay que pasar **App Review** de Meta solicitando acceso avanzado a los 4 permisos (`instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`), con vídeo de demostración del flujo y política de privacidad publicada. Se documentará cuando lleguemos a esa fase; no bloquea nada del roadmap actual.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| "Rol de desarrollador insuficiente" al agregar cuenta | La cuenta de Instagram no tiene rol de *Tester de Instagram* o no aceptó la invitación (Paso 7) |
| `ERR_NGROK_4018` al arrancar ngrok | Falta configurar el authtoken (Paso 6) |
| Página "You are about to visit..." de ngrok en el callback | Interstitial del plan gratuito: pulsar **Visit Site** y seguir (una vez por navegador) |
| La API arranca "sin DATABASE_URL" teniendo `.env` | Estás en una versión vieja de los scripts; `dev:*` debe llevar `--env-file-if-exists=.env` |
| `redirect_uri mismatch` al conectar | La URI del panel y `OAUTH_REDIRECT_URI` no son idénticas |
| El panel no verifica el webhook | La API no está corriendo, el túnel cambió de URL, o `META_VERIFY_TOKEN` no coincide |
| `invalid_state` en el callback | Pasaron >10 min entre pulsar conectar y autorizar; reintenta |
| Webhook verificado pero no llegan eventos | Faltan los campos de suscripción (comments/messages) o la cuenta no aceptó la invitación de tester |
| `(#10) permission denied` al publicar | El usuario no concedió ese scope; míralo en `/api/social/status` |
