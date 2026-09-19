# M.A.R.C. — Vinculación Web + Telegram

M.A.R.C. usa una sola cuenta de negocio. La suscripción vive en `marc_subscriptions.user_id`, mientras Web y Telegram son canales de acceso.

## Flujo

1. El usuario compra o activa su plan en la web.
2. En **Configuración → Telegram**, la web solicita `POST /api/telegram/link`.
3. El Worker genera un token aleatorio de un solo uso, guarda únicamente su hash en `marc_link_tokens` y devuelve un deep link de Telegram.
4. Telegram abre el bot con `/start LNK_...`.
5. El webhook valida `X-Telegram-Bot-Api-Secret-Token`, consume el token y crea/actualiza `marc_channel_identities`.
6. Desde ese momento, Telegram resuelve el mismo `user_id`, consulta la misma suscripción, usa el mismo contador de IA y ejecuta las mismas operaciones sobre clientes, inventario y cotizaciones.
7. La conversación de Telegram queda registrada en `marc_conversations.channel = 'TELEGRAM'`; el agente usa además el historial reciente del usuario entre canales.

## Seguridad

El frontend nunca recibe una clave secreta de Supabase. El Worker usa `SUPABASE_PUBLISHABLE_KEY` para llamadas autenticadas de usuarios y una **Supabase Secret Key** para el webhook de Telegram. Supabase recomienda las publishable keys para código que se entrega al navegador y las secret keys solo en componentes backend controlados. La secret key bypassa RLS y no debe llegar al cliente ni al repositorio.

El token de vinculación dura 10 minutos y se guarda como SHA-256. Una vez consumido, `used_at` impide reutilizarlo.

Telegram envía el secreto del webhook en `X-Telegram-Bot-Api-Secret-Token`; el Worker lo valida antes de procesar mensajes.

## Configuración del Worker

Configura el nombre público del bot en `wrangler.toml`:

```toml
TELEGRAM_BOT_USERNAME="TuBotSinArroba"
```

Después guarda los tres secretos fuera del repositorio:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Para `SUPABASE_SECRET_KEY`, usa una **Secret Key** de Supabase (`sb_secret_...`) en lugar de la antigua `service_role` cuando sea posible.

## Webhook de Telegram

Tras desplegar el Worker, configura el webhook. La URL es:

```text
https://TU-DOMINIO-MARC/api/telegram/webhook
```

Ejemplo con Bot API:

```bash
curl -X POST "https://api.telegram.org/botTU_TOKEN/setWebhook" \
  -d "url=https://TU-DOMINIO-MARC/api/telegram/webhook" \
  -d "secret_token=TU_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

Telegram soporta el deep link `https://t.me/<bot>?start=<parameter>`; el parámetro de inicio admite hasta 64 caracteres base64url. También soporta un secreto explícito para webhooks y lo envía en el header `X-Telegram-Bot-Api-Secret-Token`.

## Prueba funcional

Con una cuenta de M.A.R.C.:

- entra a **Configuración**;
- pulsa **Conectar Telegram**;
- abre el enlace generado;
- pulsa **Start** en el bot;
- vuelve a M.A.R.C. y pulsa **Actualizar estado**;
- escribe una consulta en Telegram;
- verifica que clientes, inventario, cotizaciones, suscripción y uso de IA correspondan a la misma cuenta.

## Límite actual

La integración de pago todavía es independiente de este enlace de canal. Cuando se conecte Mercado Pago/otro proveedor en la web y Telegram Stars en Telegram, ambos deberán escribir sobre la misma fila de `marc_subscriptions` y la misma tabla de eventos de pago.
