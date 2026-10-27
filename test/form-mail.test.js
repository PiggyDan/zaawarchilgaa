/**
 * Runs the real submission handler with nodemailer and googleapis replaced by
 * in-memory fakes, so no email is sent and nothing is uploaded.
 * Requires --experimental-test-module-mocks (see the "test" npm script).
 */
import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeForecast } from "./fixtures.js";

const sent = [];
const uploads = [];

mock.module("nodemailer", {
  exports: {
    default: {
      createTransport: () => ({
        sendMail: async (message) => {
          sent.push(message);
          return { messageId: `test-${sent.length}` };
        }
      })
    }
  }
});

mock.module("googleapis", {
  exports: {
    google: {
      auth: { OAuth2: class { setCredentials() {} } },
      drive: () => ({
        files: {
          list: async () => ({ data: { files: [{ id: "folder" }] } }),
          create: async (request) => {
            uploads.push(request);
            return { data: { id: "drive-file" } };
          }
        }
      })
    }
  }
});

Object.assign(process.env, {
  SMTP_HOST: "smtp.test.invalid",
  SMTP_USER: "test@test.invalid",
  SMTP_PASS: "test",
  GOOGLE_CLIENT_ID: "test",
  GOOGLE_CLIENT_SECRET: "test",
  GOOGLE_REFRESH_TOKEN: "test",
  GOOGLE_DRIVE_FOLDER_ID: "test"
});
delete process.env.MAIL_TO;
// GKK Workforce hand-off is off unless a test turns it on.
for (const k of ["WORKFORCE_URL", "WORKFORCE_KEY_ID", "WORKFORCE_SECRET"]) delete process.env[k];

const { sendFormMail } = await import("../api/_form-mail.js");
const { clearWeatherCache } = await import("../api/_route-weather.js");

// 1x1 transparent PNG.
const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function tomorrowInUlaanbaatar() {
  const t = new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

const payload = (direction) => ({
  form: {
    company: "Говьхангайн Хөдөлмөр ХХК",
    department: "IT",
    travelDate: tomorrowInUlaanbaatar(),
    direction,
    otherDirection: "",
    transport: "Байгууллагын унаагаар",
    driver: "Бат 88000000",
    vehicle: "Toyota Land Cruiser 200, 00-00 УБА"
  },
  employees: [{ name: "Тест Ажилтан", position: "Инженер", phone: "99000000" }],
  signature: SIGNATURE
});

const realFetch = globalThis.fetch;
let weatherRequests = 0;

beforeEach(() => {
  sent.length = 0;
  uploads.length = 0;
  weatherRequests = 0;
  clearWeatherCache();
});

after(() => {
  globalThis.fetch = realFetch;
});

function serveForecast() {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/api\.met\.no\//, "only MET Norway is contacted");
    weatherRequests++;
    const start = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => makeForecast({ start, values: () => ({ wind: 14, symbol: "lightsnow_day", precipPerHour: 0.2 }) })
    };
  };
}

test("a submission sends exactly one email, to the unchanged recipients, with the weather section", async () => {
  serveForecast();
  const result = await sendFormMail(payload("Улаанбаатар - Цагаанхад"));

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(sent.length, 1, "no extra emails");
  assert.deepEqual(sent[0].to, ["it@gkllc.mn", "admin@gkllc.mn", "share@gkllc.mn"]);
  assert.equal(uploads.length, 1, "Drive archive still runs");
  assert.equal(weatherRequests, 5);

  const { html, text, subject } = sent[0];
  assert.match(subject, /^Аяллын зааварчилгаа \| /, "subject unchanged");
  for (const content of [html, text]) {
    assert.match(content, /МАРШРУТЫН ДАГУУХ ЦАГ АГААРЫН МЭДЭЭЛЭЛ/);
    assert.match(content, /Улаанбаатар → Мандалговь → Цогт-Овоо → Цогтцэций → Цагаанхад/);
    assert.match(content, /Хүчтэй салхи \(14 м\/с хүртэл\)/);
    assert.match(content, /урьдчилсан төлөв бөгөөд замын нөхцөл байдлыг холбогдох эх сурвалжаас нэмж шалгана уу/);
  }
  // Original content is still there, ahead of the weather section.
  assert.ok(html.indexOf("Гарын үсэг") < html.indexOf("МАРШРУТЫН ДАГУУХ"));
  assert.match(html, /Тест Ажилтан/);
});

test("the form still submits when the weather API is down", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const result = await sendFormMail(payload("Улаанбаатар - Даланзадгад"));

  assert.equal(result.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /Цаг агаарын мэдээллийг одоогоор татаж чадсангүй/);
});

test("invalid submissions are still rejected before any weather lookup", async () => {
  serveForecast();
  const bad = payload("Улаанбаатар - Даланзадгад");
  bad.form.department = "";
  const result = await sendFormMail(bad);

  assert.equal(result.status, 400);
  assert.equal(sent.length, 0);
  assert.equal(weatherRequests, 0);
});

test("user-entered direction text is HTML-escaped in the weather section", async () => {
  serveForecast();
  const data = payload("Бусад");
  data.form.otherDirection = "<b>Ховд</b>";
  await sendFormMail(data);

  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].html, /<b>Ховд<\/b>/);
  assert.match(sent[0].html, /&lt;b&gt;Ховд&lt;\/b&gt;/);
});

test("the PDF attachment includes the weather section when weather is available", async () => {
  const { buildPdfBuffer } = await import("../api/_form-mail.js");
  const data = payload("Улаанбаатар - Цагаанхад");
  const signature = { buffer: Buffer.from(SIGNATURE.split(",")[1], "base64") };

  serveForecast();
  const { getRouteWeather } = await import("../api/_route-weather.js");
  const weather = await getRouteWeather(data.form);
  assert.equal(weather.status, "ok");

  const without = await buildPdfBuffer(data.form, data.employees, signature, null);
  const withWeather = await buildPdfBuffer(data.form, data.employees, signature, weather);
  const unavailable = await buildPdfBuffer(data.form, data.employees, signature, { ...weather, status: "unavailable", message: "x", stops: [] });

  const pages = (pdf) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages(withWeather) > pages(without), "weather adds content to the PDF");
  assert.ok(unavailable.length > without.length, "an unavailable note is still printed");

  // The email's attachment is built with the same weather.
  await sendFormMail(data);
  const attached = sent[0].attachments.find((a) => a.contentType === "application/pdf");
  assert.ok(pages(attached.content) > pages(without));
});

test("Workforce not configured: the form works exactly as before", async () => {
  serveForecast();
  const { status, body } = await sendFormMail(payload("Улаанбаатар - Цагаанхад"));
  assert.equal(status, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual(body.workforce, { sent: 0, failed: 0, skipped: "not_configured" });
});

test("Workforce down: the email and PDF still succeed and the employee sees success", async () => {
  Object.assign(process.env, {
    WORKFORCE_URL: "https://workforce.test.invalid",
    WORKFORCE_KEY_ID: "office-1",
    WORKFORCE_SECRET: "s".repeat(40)
  });
  const workforceCalls = [];
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://workforce.test.invalid")) {
      workforceCalls.push(String(url));
      throw new Error("ECONNREFUSED");
    }
    return { status: 503, ok: false, headers: { get: () => null }, json: async () => ({}) };
  };
  try {
    const { status, body } = await sendFormMail(payload("Улаанбаатар - Цагаанхад"));
    assert.equal(status, 200);
    assert.equal(sent.length, 1);
    assert.equal(uploads.length, 1);
    assert.equal(workforceCalls.length, 1);
    assert.deepEqual(body.workforce, { sent: 0, failed: 1 });
  } finally {
    for (const k of ["WORKFORCE_URL", "WORKFORCE_KEY_ID", "WORKFORCE_SECRET"]) delete process.env[k];
  }
});
