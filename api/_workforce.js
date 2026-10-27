/**
 * Sends each submitted traveller to GKK Workforce (workforce.gkllc.mn) so employee
 * statuses update automatically. Runs after the email and Drive PDF succeed.
 *
 * It never throws and never changes the form's response: if Workforce is unreachable or
 * not configured, the form behaves exactly as before. Only the minimum is sent — phone and
 * name (Workforce identifies the employee by phone + name against Odoo), company, route and
 * travel date. No signatures, positions or PDFs.
 *
 * Requests are HMAC-signed (see GKK Workforce docs/INTEGRATIONS.md):
 *   X-GKK-Signature = hex(HMAC_SHA256(secret, `${timestamp}.${nonce}.${rawBody}`))
 *
 * Files prefixed with "_" are not routed by Vercel.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const TIMEOUT_MS = 5000;

/** "Улаанбаатар - Цагаанхад" (or the free-text "Бусад" direction) → { origin, destination }. */
export function parseRoute(form) {
  const text = (form.direction === "Бусад" ? form.otherDirection : form.direction) || "";
  const split = (re) => text.split(re).map((p) => p.trim()).filter(Boolean);
  // Spaced dashes / arrows first, so hyphenated names such as "Улаан-Уул" stay whole.
  let parts = split(/\s+[-–—]\s+|\s*(?:→|->)\s*/);
  if (parts.length < 2) parts = split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    return { origin: parts[0], destination: parts[parts.length - 1] };
  }
  // Unparseable: Workforce sends it to HR as an unknown place rather than guessing.
  return { origin: "Тодорхойгүй", destination: text.trim() || "Тодорхойгүй" };
}

export function buildEvents(form, employees, { submissionId, submittedAt }) {
  const { origin, destination } = parseRoute(form);
  return employees.map((employee, index) => ({
    eventId: `${submissionId}-${index + 1}`,
    submittedAt,
    employee: {
      phone: employee.phone?.replace(/\D/g, "") || undefined,
      fullName: employee.name?.trim() || undefined,
      companyName: form.company || undefined
    },
    origin,
    destination,
    departureDate: form.travelDate
  }));
}

function sign(secret, timestamp, nonce, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

/**
 * Posts one event per traveller. Resolves to a short summary; never rejects.
 * @returns {Promise<{ sent: number, failed: number, skipped?: string }>}
 */
export async function notifyWorkforce(form, employees, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = env.WORKFORCE_URL;
  const keyId = env.WORKFORCE_KEY_ID;
  const secret = env.WORKFORCE_SECRET;
  if (!url || !keyId || !secret) {
    return { sent: 0, failed: 0, skipped: "not_configured" };
  }

  const events = buildEvents(form, employees, {
    submissionId: options.submissionId ?? randomUUID(),
    submittedAt: (options.now ?? new Date()).toISOString()
  });

  const results = await Promise.allSettled(
    events.map(async (event) => {
      const body = JSON.stringify(event);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(16).toString("hex");
      const res = await fetchImpl(new URL("/api/integrations/office/travel-events", url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GKK-Key-Id": keyId,
          "X-GKK-Timestamp": timestamp,
          "X-GKK-Nonce": nonce,
          "X-GKK-Signature": sign(secret, timestamp, nonce, body)
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      // 202 accepted, 200 duplicate (safe retry) — anything else is logged for IT.
      if (res.status !== 202 && res.status !== 200) {
        throw new Error(`Workforce HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.error("[api/send] Workforce notify failed:", f.reason?.message ?? f.reason);
  return { sent: results.length - failed.length, failed: failed.length };
}
