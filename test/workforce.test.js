import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildEvents, notifyWorkforce, parseRoute } from "../api/_workforce.js";

const form = (direction, otherDirection = "") => ({
  company: "Цагаанхад Мөнхийн Их ХХК",
  travelDate: "2026-10-29",
  direction,
  otherDirection
});
const employees = [
  { name: "Долгион Тест", code: "tk0026", position: "Инженер", phone: "99000000" },
  { name: "Бат Болд", code: "GK0101", position: "Жолооч", phone: "88000000" }
];

test("parseRoute reads the fixed route list", () => {
  assert.deepEqual(parseRoute(form("Улаанбаатар - Цагаанхад")), { origin: "Улаанбаатар", destination: "Цагаанхад" });
  assert.deepEqual(parseRoute(form("Цагаанхад - Улаанбаатар")), { origin: "Цагаанхад", destination: "Улаанбаатар" });
});

test("parseRoute reads free-text 'Бусад' routes and keeps hyphenated names whole", () => {
  assert.deepEqual(parseRoute(form("Бусад", "Цагаанхад - Гурвантэс")), { origin: "Цагаанхад", destination: "Гурвантэс" });
  assert.deepEqual(parseRoute(form("Бусад", "Цагаанхад → Гурвантэс")), { origin: "Цагаанхад", destination: "Гурвантэс" });
  assert.deepEqual(parseRoute(form("Бусад", "Улаан-Уул - Цагаанхад")), { origin: "Улаан-Уул", destination: "Цагаанхад" });
  assert.deepEqual(parseRoute(form("Бусад", "Цагаанхад-Гурвантэс")), { origin: "Цагаанхад", destination: "Гурвантэс" });
});

test("an unparseable route is passed on as unknown (HR decides), never guessed", () => {
  assert.deepEqual(parseRoute(form("Бусад", "Говь руу")), { origin: "Тодорхойгүй", destination: "Говь руу" });
});

test("one event per traveller, with only the minimum data", () => {
  const events = buildEvents(form("Улаанбаатар - Цагаанхад"), employees, {
    submissionId: "sub-1",
    submittedAt: "2026-10-27T03:00:00.000Z"
  });
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    eventId: "sub-1-1",
    submittedAt: "2026-10-27T03:00:00.000Z",
    employee: { employeeCode: "TK0026", fullName: "Долгион Тест", companyName: "Цагаанхад Мөнхийн Их ХХК" },
    origin: "Улаанбаатар",
    destination: "Цагаанхад",
    departureDate: "2026-10-29"
  });
  assert.equal(events[1].eventId, "sub-1-2");
  assert.ok(!JSON.stringify(events).includes("99000000"), "no phone numbers");
});

test("not configured: nothing is sent", async () => {
  let calls = 0;
  const r = await notifyWorkforce(form("Улаанбаатар - Цагаанхад"), employees, { env: {}, fetchImpl: async () => calls++ });
  assert.deepEqual(r, { sent: 0, failed: 0, skipped: "not_configured" });
  assert.equal(calls, 0);
});

test("requests are signed the way Workforce verifies them", async () => {
  const secret = "s".repeat(40);
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    return { status: 202, text: async () => "" };
  };
  const r = await notifyWorkforce(form("Улаанбаатар - Цагаанхад"), employees, {
    env: { WORKFORCE_URL: "https://workforce.example", WORKFORCE_KEY_ID: "office-1", WORKFORCE_SECRET: secret },
    fetchImpl
  });
  assert.deepEqual(r, { sent: 2, failed: 0 });
  for (const { url, init } of seen) {
    assert.equal(url, "https://workforce.example/api/integrations/office/travel-events");
    const h = init.headers;
    const expected = createHmac("sha256", secret).update(`${h["X-GKK-Timestamp"]}.${h["X-GKK-Nonce"]}.${init.body}`).digest("hex");
    assert.equal(h["X-GKK-Signature"], expected);
    assert.equal(h["X-GKK-Key-Id"], "office-1");
  }
  assert.notEqual(seen[0].init.headers["X-GKK-Nonce"], seen[1].init.headers["X-GKK-Nonce"], "nonces are single-use");
});

test("a duplicate (200) counts as delivered; errors are counted, never thrown", async () => {
  const env = { WORKFORCE_URL: "https://w.example", WORKFORCE_KEY_ID: "k", WORKFORCE_SECRET: "s".repeat(40) };
  const statuses = [200, 500];
  const r = await notifyWorkforce(form("Улаанбаатар - Цагаанхад"), employees, {
    env,
    fetchImpl: async () => ({ status: statuses.shift(), text: async () => "boom" })
  });
  assert.deepEqual(r, { sent: 1, failed: 1 });
  const r2 = await notifyWorkforce(form("Улаанбаатар - Цагаанхад"), employees, {
    env,
    fetchImpl: async () => {
      throw new Error("timeout");
    }
  });
  assert.deepEqual(r2, { sent: 0, failed: 2 });
});
