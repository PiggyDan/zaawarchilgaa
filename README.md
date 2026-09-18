# Simple Company Travel Form

A React + Vite travel safety form. On submit, the form is emailed to the
company recipients with the uploaded signature embedded in the message.

## Run
```bash
npm install
cp .env.local.example .env.local   # then fill in credentials
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
