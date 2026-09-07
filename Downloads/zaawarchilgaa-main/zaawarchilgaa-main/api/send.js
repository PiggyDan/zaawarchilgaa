import { sendFormMail } from "./_form-mail.js";

/** Vercel serverless entry point for POST /api/send. */
export default async function handler(req, res) {
  // TEMPORARY diagnostic - remove once the Drive upload issue is confirmed fixed.
  if (req.url && req.url.includes("debugecho9f2e")) {
    return res.status(200).json({ debugEchoV2: true, method: req.method, url: req.url });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload = req.body;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: "Хүсэлтийн өгөгдөл буруу байна." });
    }
  }

  // TEMPORARY diagnostic - remove once the Drive upload issue is confirmed fixed.
  if (req.headers["x-debug-echo"] === "chk-9f2e-drive-debug") {
    return res.status(200).json({
      debugEcho: true,
      payloadType: typeof payload,
      payloadIsNull: payload === null,
      payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
      payload
    });
  }

  const { status, body } = await sendFormMail(payload);

  return res.status(status).json(body);
}
