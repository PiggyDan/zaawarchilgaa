# Simple Company Travel Form

A React + Vite travel safety form. On submit, the form is emailed to the
company recipients with the uploaded signature embedded in the message.

## Run
```bash
npm install
# create .env.local with the variables listed below (never commit it)
npm run dev
```

## Email delivery

Submitting POSTs to `/api/send`, which mails the form to:

- it@gkllc.mn
- admin@gkllc.mn
- share@gkllc.mn

Override the list with `MAIL_TO` (comma-separated) if needed.

The signature image is sent both as an inline image in the email body and as
an attachment (`garyn-useg.*`), so it stays visible even in clients that block
inline images.

### Providers

Configured in `.env.local`:

- **Company SMTP** (default) — `gkllc.mn` mail is hosted by mail.mn, so
  `SMTP_HOST=smtp.mail.mn` on port 587 (STARTTLS). Use `smtp.mail.mn`
  rather than `smtp.gkllc.mn`: they are the same server, but the
  certificate only covers `*.mail.mn`, so the `gkllc.mn` name fails TLS
  hostname verification. Fill in `SMTP_USER` and `SMTP_PASS` with the
  mailbox that sends the form. If port 587 is blocked on the network, use
  `SMTP_PORT=465` with `SMTP_SECURE=true`.
- **Resend** (fallback) — used only when `SMTP_HOST` is empty. Requires the
  `gkllc.mn` domain to be verified in Resend.

Set the same variables in the Vercel project settings for production;
`.env.local` is not deployed.

## Files

- `api/_form-mail.js` — validation, email template, delivery
- `api/send.js` — Vercel serverless entry point
- `vite.config.js` — serves the same handler locally during `npm run dev`

## Google Drive archive

The root app requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_DRIVE_FOLDER_ID on the server. After email delivery, it saves a PDF under YYYY.MM/MM.DD using the travel date. Successful API responses include driveFileId. Upload failures return an error; missing settings are rejected before sending email.

The PDF uses assets/fonts/NotoSans-Regular.ttf for Mongolian text. Configure the same variables in .env.local for development. Run npm run get:google-token with Google client variables set to generate a refresh token.

## Route weather

The notification email includes a **МАРШРУТЫН ДАГУУХ ЦАГ АГААРЫН МЭДЭЭЛЭЛ**
section: a forecast for the main towns along the selected route on the travel
date (08:00–20:00, Ulaanbaatar time). Employees do nothing extra.

The success screen shows the same report right after submission. It loads
separately via `POST /api/weather` (route and date only, in the request body),
so it never delays the submission. Warnings are colored orange (moderate) or
red (serious) and come with Mongolian preparation advice. If the lookup fails,
the screen shows "Цаг агаарын мэдээлэл түр боломжгүй байна."

- `api/_route-weather.js`: place coordinates, curated routes, MET Norway
  client (timeout, caching, Expires/If-Modified-Since), daily summary, warnings
- `api/_weather-email.js`: the email section (HTML and plain text)
- `api/weather.js`: `POST /api/weather` for the success screen
- `shared/weather-format.js`: wording and number formatting shared by the
  email and the success screen
- `src/WeatherReport.jsx`: the success-screen report

Data comes from [MET Norway Locationforecast](https://api.met.no/). It is free,
needs no API key, and allows commercial use under CC BY 4.0 / NLOD 2.0 with the
attribution shown in the email. Forecasts reach about 9 days ahead; later
travel dates get a "not yet available" note.

Routes in the form's dropdown map to curated stops verified against
OpenStreetMap road data (reverse directions are handled automatically). Free
text ("Бусад") is matched against known places; unknown routes show only the
named places, marked as incomplete coverage. To add a route, add its places to
`PLACES` and its stops to `ROUTES` in `api/_route-weather.js`.

Weather never blocks a submission: on timeout, API errors or unknown routes,
the email is sent with a short "unavailable" note instead.

Optional environment variables (defaults in brackets):

- `ROUTE_WEATHER_ENABLED`: set to `false` to turn the section off
- `WEATHER_USER_AGENT`: identification sent to MET Norway
- Warning thresholds (internal heuristics, not official alerts):
  - wind: `WEATHER_WARN_WIND_MS` [12] moderate, `WEATHER_WARN_WIND_SERIOUS_MS` [18] serious
  - snow: any snow is moderate, `WEATHER_WARN_SNOW_MM` [5] serious
  - rain: any rain is moderate, `WEATHER_WARN_RAIN_MM` [10] serious
  - cold: `WEATHER_WARN_COLD_MODERATE_C` [-15] moderate, `WEATHER_WARN_COLD_C` [-25] serious;
    a stop `WEATHER_WARN_COLDER_DELTA_C` [6] °C colder than the starting point (and below 0°C) is moderate
  - heat: `WEATHER_WARN_HEAT_MODERATE_C` [30] moderate, `WEATHER_WARN_HEAT_C` [35] serious
  - fog: `WEATHER_WARN_FOG_PCT` [50] moderate

Test with `npm test` (no email is sent). Preview a route with live data:
`node scripts/preview-route-weather.js "Улаанбаатар - Цагаанхад" 2026-10-28 preview.html`.
