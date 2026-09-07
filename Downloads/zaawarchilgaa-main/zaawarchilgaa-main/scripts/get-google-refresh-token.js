/**
 * One-time helper: exchanges a Google OAuth2 "Desktop app" client for a
 * refresh token that api/_form-mail.js can use to upload PDFs to Drive.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.js
 */
import http from "http";
import { exec } from "child_process";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.\n" +
      "Run as: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.js"
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  // Full drive scope (not drive.file): the target folder already exists and
  // was created outside this app, so the narrower drive.file scope — which
  // only grants access to files the app itself created or the user opened
  // with a picker — would not be able to see it.
  scope: ["https://www.googleapis.com/auth/drive"]
});

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

console.log("Opening browser for Google sign-in. If it doesn't open, visit:\n");
console.log(authUrl, "\n");
openBrowser(authUrl);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) {
    res.writeHead(404);
    return res.end();
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Authorization denied. You can close this tab.");
    console.error("Authorization denied:", error);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Authorized. You can close this tab and return to the terminal.");

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. This usually means the account already " +
          "granted consent before. Remove access at " +
          "https://myaccount.google.com/permissions and run this script again."
      );
      server.close();
      process.exit(1);
    }

    console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("\nAdd that line (plus GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) to .env.local and to your Vercel project env vars.");
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Token exchange failed. Check the terminal.");
    console.error("Token exchange failed:", err.message || err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for the OAuth redirect on ${REDIRECT_URI} ...`);
});
