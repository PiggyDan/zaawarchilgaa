import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRoute,
  summarize,
  travelWindow,
  warningsFor,
  analyzeRoute,
  handleWeatherRequest,
  getRouteWeather,
  clearWeatherCache,
  PLACES
} from "../api/_route-weather.js";
import { makeForecast, mockFetch } from "./fixtures.js";

const names = (route) => route.stops.map(({ key }) => PLACES[key].name);

// "Now" for these tests: 2026-10-26 10:00 Ulaanbaatar time.
const NOW = Date.parse("2026-10-26T02:00:00Z");
const now = () => NOW;
const okForecast = () => ({
  body: makeForecast({ start: "2026-10-26T02:00:00Z" }),
  headers: { Expires: new Date(NOW + 30 * 60 * 1000).toUTCString(), "Last-Modified": "Mon, 26 Oct 2026 01:30:00 GMT" }
});

beforeEach(() => {
  clearWeatherCache();
  delete process.env.ROUTE_WEATHER_ENABLED;
});

// ---- Route resolution ------------------------------------------------------

test("every route in the form's dropdown resolves to a curated route", () => {
  const options = [
    "Улаанбаатар - Даланзадгад",
    "Улаанбаатар - Цагаанхад",
    "Улаанбаатар - Шивээхүрэн",
    "Улаанбаатар - Гурвантэс",
    "Даланзадгад - Гурвантэс",
    "Даланзадгад - Улаанбаатар",
    "Цагаанхад - Улаанбаатар",
    "Шивээхүрэн - Улаанбаатар",
    "Гурвантэс - Улаанбаатар"
  ];
  for (const option of options) {
    const route = resolveRoute(option);
    assert.equal(route.coverage, "full", option);
    const [from, to] = option.split(" - ");
    assert.equal(names(route)[0], from, option);
    assert.equal(names(route).at(-1), to, option);
  }
});

test("Улаанбаатар → Цагаанхад goes via Мандалговь, Цогт-Овоо, Цогтцэций", () => {
  assert.deepEqual(names(resolveRoute("Улаанбаатар - Цагаанхад")), [
    "Улаанбаатар",
    "Мандалговь",
    "Цогт-Овоо",
    "Цогтцэций",
    "Цагаанхад"
  ]);
});

test("reverse routes reverse the stops and their distances", () => {
  const forward = resolveRoute("Улаанбаатар - Даланзадгад");
  const reverse = resolveRoute("Даланзадгад - Улаанбаатар");
  assert.deepEqual(names(reverse), [...names(forward)].reverse());
  assert.deepEqual(reverse.stops.map((s) => s.km), [0, 124, 304, 577]);
});

test("free-text 'Бусад' directions: reverse curated, hyphenated names, Latin, УБ", () => {
  assert.deepEqual(names(resolveRoute("Гурвантэс - Даланзадгад")), ["Гурвантэс", "Баяндалай", "Даланзадгад"]);
  assert.equal(resolveRoute("УБ-Цагаанхад").coverage, "full");
  assert.equal(resolveRoute("ulaanbaatar → dalanzadgad").coverage, "full");

  const partial = resolveRoute("Даланзадгад - Цогт-Овоо");
  assert.equal(partial.coverage, "partial");
  assert.deepEqual(names(partial), ["Даланзадгад", "Цогт-Овоо"]);
});

test("unknown places give no stops, and short aliases need whole words", () => {
  assert.equal(resolveRoute("Улаангом - Ховд").coverage, "none");
  assert.equal(resolveRoute("").coverage, "none");
  assert.equal(resolveRoute(undefined).coverage, "none");
  // "уб" inside another word must not match Улаанбаатар.
  assert.equal(resolveRoute("Губ").coverage, "none");
});

// ---- Summaries -------------------------------------------------------------

test("travel window is 08:00–20:00 Ulaanbaatar time", () => {
  const window = travelWindow("2026-10-28");
  assert.equal(new Date(window.start).toISOString(), "2026-10-28T00:00:00.000Z");
  assert.equal(new Date(window.end).toISOString(), "2026-10-28T12:00:00.000Z");
  assert.equal(travelWindow("28/10/2026"), null);
});

test("hourly precipitation is summed once, not double-counted with next_6_hours", () => {
  const forecast = makeForecast({ start: "2026-10-27T00:00:00Z", values: () => ({ precipPerHour: 0.5, symbol: "lightsnow" }) });
  const summary = summarize(forecast.properties.timeseries, travelWindow("2026-10-27"));
  assert.equal(summary.coveredHours, 12);
  assert.equal(Math.round(summary.precip * 10) / 10, 6);
  assert.equal(summary.condition, "Бага зэргийн цас");
});

test("6-hourly part of the forecast is summarized too", () => {
  const forecast = makeForecast({ start: "2026-10-26T02:00:00Z", values: () => ({ precipPerHour: 1, temp: -5 }) });
  const summary = summarize(forecast.properties.timeseries, travelWindow("2026-11-02"));
  assert.equal(summary.coveredHours, 12);
  assert.equal(summary.precip, 12);
  assert.equal(summary.tempMin, -6);
  assert.equal(summary.tempMax, -4);
});

test("the worst condition in the window is reported", () => {
  const forecast = makeForecast({
    start: "2026-10-27T00:00:00Z",
    values: (t) => ({ symbol: new Date(t).getUTCHours() === 5 ? "heavysnowshowersandthunder_day" : "fair_day" })
  });
  const summary = summarize(forecast.properties.timeseries, travelWindow("2026-10-27"));
  assert.equal(summary.condition, "Их цастай, аянга цахилгаантай");
});

// ---- Warning analysis (shared by email and success page) -------------------

const calm = { windMax: 5, snowPrecip: 0, rainPrecip: 0, tempMin: 2, tempMax: 15, fogMax: 0 };
const okStop = (name, summary) => ({ name, km: 0, ok: true, summary: { ...calm, ...summary } });

test("normal weather: no warnings, level normal, no advice", () => {
  assert.deepEqual(warningsFor(calm), []);
  const result = analyzeRoute([okStop("А", {}), okStop("Б", {})]);
  assert.equal(result.level, "normal");
  assert.deepEqual(result.advice, []);
});

test("winter: a stop much colder than the start gets a cold warning and warm-clothing advice", () => {
  const result = analyzeRoute([
    okStop("Улаанбаатар", { tempMin: -4 }),
    okStop("Мандалговь", { tempMin: -7 }),
    okStop("Цогтцэций", { tempMin: -12 })
  ]);
  assert.deepEqual(result.stops[1].warnings, [], "3°C colder is within the default delta");
  assert.deepEqual(result.stops[2].warnings, [
    { type: "cold", level: "moderate", text: "Гарах цэгээс 8°C хүйтэн (-12°C хүртэл)" }
  ]);
  assert.equal(result.level, "moderate");
  assert.match(result.advice[0], /Дулаан хувцас.*халаалт/);
});

test("winter: absolute cold thresholds give moderate and serious warnings", () => {
  assert.deepEqual(warningsFor({ ...calm, tempMin: -18 }), [{ type: "cold", level: "moderate", text: "Хүйтэн (-18°C хүртэл)" }]);
  assert.deepEqual(warningsFor({ ...calm, tempMin: -31 }), [{ type: "cold", level: "serious", text: "Хэт хүйтэн (-31°C хүртэл)" }]);
});

test("summer: 35°C and above is extreme heat, with water, sun and cooling advice", () => {
  assert.deepEqual(warningsFor({ ...calm, tempMax: 31 }), [{ type: "heat", level: "moderate", text: "Халуун (31°C хүртэл)" }]);
  const result = analyzeRoute([okStop("Даланзадгад", { tempMax: 37 })]);
  assert.deepEqual(result.stops[0].warnings, [{ type: "heat", level: "serious", text: "Хэт халуун (37°C хүртэл)" }]);
  assert.equal(result.level, "serious");
  assert.match(result.advice[0], /ундны ус.*нарнаас.*хөргөлтийн/);
});

test("strong wind: crosswind and load advice; serious above the second threshold", () => {
  assert.equal(warningsFor({ ...calm, windMax: 13 })[0].level, "moderate");
  assert.equal(warningsFor({ ...calm, windMax: 19 })[0].level, "serious");
  const { advice } = analyzeRoute([okStop("Цогт-Овоо", { windMax: 13 })]);
  assert.match(advice[0], /Хажуугийн хүчтэй салхинд.*ачаа/);
});

test("snow and rain advise checking road conditions and vehicle readiness", () => {
  const { advice } = analyzeRoute([okStop("А", { snowPrecip: 1 }), okStop("Б", { rainPrecip: 2 })]);
  assert.equal(advice.length, 2);
  advice.forEach((item) => assert.match(item, /Замын нөхцөл байдлыг урьдчилан лавлаж/));
});

test("multiple risks: every warning listed, level is the worst, advice de-duplicated", () => {
  const result = analyzeRoute([
    okStop("А", { windMax: 14, snowPrecip: 6, tempMin: -30, fogMax: 80 }),
    okStop("Б", { windMax: 13 })
  ]);
  assert.deepEqual(
    result.stops[0].warnings.map((w) => [w.type, w.level]),
    [["wind", "moderate"], ["snow", "serious"], ["cold", "serious"], ["fog", "moderate"]]
  );
  assert.equal(result.level, "serious");
  assert.equal(result.advice.length, 4, "wind advice appears once though two stops are windy");
});

test("warning thresholds are configurable through environment variables", () => {
  process.env.WEATHER_WARN_WIND_MS = "20";
  process.env.WEATHER_WARN_HEAT_C = "40";
  process.env.WEATHER_WARN_HEAT_MODERATE_C = "38";
  try {
    assert.deepEqual(warningsFor({ ...calm, windMax: 14, tempMax: 36 }), []);
  } finally {
    delete process.env.WEATHER_WARN_WIND_MS;
    delete process.env.WEATHER_WARN_HEAT_C;
    delete process.env.WEATHER_WARN_HEAT_MODERATE_C;
  }
});

// ---- /api/weather request handling -----------------------------------------

test("weather endpoint returns the same snapshot shape the email uses", async () => {
  const { fetchImpl } = mockFetch(okForecast);
  const { status, body } = await handleWeatherRequest(
    { direction: "Улаанбаатар - Даланзадгад", otherDirection: "", travelDate: "2026-10-27" },
    { fetchImpl, now }
  );
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.level, "normal");
  assert.ok(Array.isArray(body.advice));
  assert.equal(body.stops.length, 4);
});

test("weather endpoint rejects missing fields and ignores anything but route and date", async () => {
  assert.equal((await handleWeatherRequest(null)).status, 400);
  assert.equal((await handleWeatherRequest({ direction: "Улаанбаатар - Даланзадгад" })).status, 400);

  const { fetchImpl } = mockFetch(okForecast);
  const { body } = await handleWeatherRequest(
    { direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-27", employees: [{ name: "Нууц" }], signature: "data:..." },
    { fetchImpl, now }
  );
  assert.doesNotMatch(JSON.stringify(body), /Нууц|signature/);
});

test("API failures are tagged so the success page can say 'temporarily unavailable'", async () => {
  const weather = await getRouteWeather(
    { direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-27" },
    { fetchImpl: async () => { throw new TypeError("fetch failed"); }, now }
  );
  assert.equal(weather.reason, "error");
});

// ---- End-to-end with a mocked API -------------------------------------------

test("returns a forecast for every stop on the route", async () => {
  const { fetchImpl, calls } = mockFetch(okForecast);
  const weather = await getRouteWeather({ direction: "Улаанбаатар - Цагаанхад", travelDate: "2026-10-27" }, { fetchImpl, now });

  assert.equal(weather.status, "ok");
  assert.equal(weather.coverage, "full");
  assert.equal(weather.stops.length, 5);
  assert.ok(weather.stops.every((stop) => stop.ok));
  assert.equal(calls.length, 5);
});

test("requests carry only coordinates (max 4 decimals) and an identifying User-Agent", async () => {
  const { fetchImpl, calls } = mockFetch(okForecast);
  await getRouteWeather(
    { direction: "Бусад", otherDirection: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" },
    { fetchImpl, now }
  );

  for (const { url, options } of calls) {
    const query = new URL(url).searchParams;
    assert.deepEqual([...query.keys()], ["lat", "lon"]);
    assert.match(query.get("lat"), /^\d+\.\d{1,4}$/);
    assert.match(options.headers["User-Agent"], /gkllc/);
  }
});

test("forecasts are cached until Expires, then revalidated with If-Modified-Since", async () => {
  let clock = NOW;
  const { fetchImpl, calls } = mockFetch((url, options) =>
    options.headers["If-Modified-Since"] ? { status: 304, headers: { Expires: new Date(clock + 60 * 60 * 1000).toUTCString() } } : okForecast()
  );
  const form = { direction: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" };

  await getRouteWeather(form, { fetchImpl, now: () => clock });
  await getRouteWeather(form, { fetchImpl, now: () => clock });
  assert.equal(calls.length, 3, "second submission is served from cache");

  clock += 31 * 60 * 1000;
  const weather = await getRouteWeather(form, { fetchImpl, now: () => clock });
  assert.equal(calls.length, 6);
  assert.equal(weather.status, "ok", "304 reuses the cached body");
});

test("concurrent submissions share one request per location", async () => {
  const { fetchImpl, calls } = mockFetch(okForecast);
  const form = { direction: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" };
  await Promise.all([getRouteWeather(form, { fetchImpl, now }), getRouteWeather(form, { fetchImpl, now })]);
  assert.equal(calls.length, 3);
});

test("API errors and rate limits leave the rest of the route intact", async () => {
  const { fetchImpl } = mockFetch((url, options, n) => (n === 2 ? { status: 429 } : okForecast()));
  const weather = await getRouteWeather({ direction: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" }, { fetchImpl, now });

  assert.equal(weather.status, "partial");
  assert.deepEqual(weather.stops.map((s) => s.ok), [true, false, true]);
});

test("a rate limit falls back to a stale cached forecast", async () => {
  let clock = NOW;
  let limited = false;
  const { fetchImpl } = mockFetch(() => (limited ? { status: 429 } : okForecast()));
  const form = { direction: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" };

  await getRouteWeather(form, { fetchImpl, now: () => clock });
  clock += 2 * 60 * 60 * 1000;
  limited = true;
  const weather = await getRouteWeather(form, { fetchImpl, now: () => clock });
  assert.equal(weather.status, "ok");
});

test("a hung API times out and the snapshot reports unavailable", { timeout: 10000 }, async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));

  const started = Date.now();
  const weather = await getRouteWeather({ direction: "Даланзадгад - Гурвантэс", travelDate: "2026-10-27" }, { fetchImpl, now });

  assert.ok(Date.now() - started < 6000, "bounded by the request timeout");
  assert.equal(weather.status, "unavailable");
  assert.match(weather.message, /татаж чадсангүй/);
});

test("network failure and malformed responses never throw", async () => {
  const failing = await getRouteWeather(
    { direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-27" },
    { fetchImpl: async () => { throw new TypeError("fetch failed"); }, now }
  );
  assert.equal(failing.status, "unavailable");

  const { fetchImpl } = mockFetch(() => ({ body: { nope: true } }));
  const malformed = await getRouteWeather({ direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-27" }, { fetchImpl, now });
  assert.equal(malformed.status, "unavailable");
});

test("dates beyond the forecast range, in the past, or malformed are reported clearly", async () => {
  const { fetchImpl, calls } = mockFetch(okForecast);

  const future = await getRouteWeather({ direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-11-20" }, { fetchImpl, now });
  assert.equal(future.status, "unavailable");
  assert.match(future.message, /хэтэрсэн/);

  const before = calls.length;
  const past = await getRouteWeather({ direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-20" }, { fetchImpl, now });
  assert.match(past.message, /өнгөрсөн/);
  const bad = await getRouteWeather({ direction: "Улаанбаатар - Даланзадгад", travelDate: "garbage" }, { fetchImpl, now });
  assert.match(bad.message, /буруу/);
  assert.equal(calls.length, before, "no API calls for past or malformed dates");
});

test("unknown route makes no API calls", async () => {
  const { fetchImpl, calls } = mockFetch(okForecast);
  const weather = await getRouteWeather({ direction: "Бусад", otherDirection: "Ховд - Улаангом", travelDate: "2026-10-27" }, { fetchImpl, now });
  assert.equal(weather.status, "unavailable");
  assert.equal(weather.coverage, "none");
  assert.equal(calls.length, 0);
});

test("ROUTE_WEATHER_ENABLED=false switches the feature off", async () => {
  process.env.ROUTE_WEATHER_ENABLED = "false";
  const { fetchImpl, calls } = mockFetch(okForecast);
  const weather = await getRouteWeather({ direction: "Улаанбаатар - Даланзадгад", travelDate: "2026-10-27" }, { fetchImpl, now });
  assert.equal(weather.status, "disabled");
  assert.equal(calls.length, 0);
});
