/**
 * Route weather for the travel-safety form.
 *
 * Resolves the form's "Аялах чиглэл" into towns along the road, fetches each
 * town's forecast for the travel date from MET Norway's Locationforecast API
 * (free, no API key, commercial use allowed under CC BY 4.0 / NLOD 2.0), and
 * summarizes it for the notification email.
 *
 * Never throws: any failure yields a snapshot with status "unavailable", so a
 * weather problem can never block a form submission.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

const MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";

// MET Norway identifies clients by User-Agent and blocks generic ones, so it
// must name the application and a contact address.
const DEFAULT_USER_AGENT = "gkllc-travel-form/1.0 (+https://office.gkllc.mn; it@gkllc.mn)";

// Per-request limit. The whole lookup runs alongside PDF generation, so this
// bounds the delay weather can add to a submission.
const REQUEST_TIMEOUT_MS = 4000;

// The form only records a travel date, not a departure time, so every stop is
// summarized over the same daytime window (Asia/Ulaanbaatar, UTC+8, no DST).
const UB_UTC_OFFSET_HOURS = 8;
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 20;

/**
 * Warning thresholds. Each can be overridden with the environment variable
 * named alongside it, without a code change. These are internal heuristics
 * applied to the forecast, not official hazard criteria.
 */
function thresholds() {
  const num = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && process.env[name] !== "" ? value : fallback;
  };

  // "Moderate" warnings are shown in orange, "serious" ones in red.
  return {
    // Max sustained wind (м/с) over the window.
    strongWind: num("WEATHER_WARN_WIND_MS", 12),
    severeWind: num("WEATHER_WARN_WIND_SERIOUS_MS", 18),
    // Snowfall, as liquid-water equivalent (мм) over the window. Any snow is
    // moderate; this much is serious.
    heavySnow: num("WEATHER_WARN_SNOW_MM", 5),
    // Rainfall (мм) over the window. Any rain is moderate; this much is serious.
    heavyRain: num("WEATHER_WARN_RAIN_MM", 10),
    // Lowest air temperature (°C).
    cold: num("WEATHER_WARN_COLD_MODERATE_C", -15),
    extremeCold: num("WEATHER_WARN_COLD_C", -25),
    // A stop whose low is this many °C below the starting point's low.
    colderThanStart: num("WEATHER_WARN_COLDER_DELTA_C", 6),
    // Highest air temperature (°C).
    heat: num("WEATHER_WARN_HEAT_MODERATE_C", 30),
    extremeHeat: num("WEATHER_WARN_HEAT_C", 35),
    // Highest fog area fraction (%), used as a poor-visibility signal.
    fog: num("WEATHER_WARN_FOG_PCT", 50)
  };
}

/**
 * Coordinates are OpenStreetMap settlement nodes (fetched 2026-10-26).
 * Цагаанхад is the "Цагаан хад" settlement on the paved road to the
 * Гашуунсухайт border crossing; Шивээхүрэн is the border-control point.
 */
export const PLACES = {
  ulaanbaatar: { name: "Улаанбаатар", lat: 47.9185, lon: 106.9177, aliases: ["улаанбаатар", "улаан баатар", "уб", "ulaanbaatar", "ulan bator", "ub"] },
  mandalgovi: { name: "Мандалговь", lat: 45.763, lon: 106.2704, aliases: ["мандалговь", "mandalgovi"] },
  khuld: { name: "Хулд", lat: 45.2219, lon: 105.5579, aliases: ["хулд", "khuld"] },
  tsogtOvoo: { name: "Цогт-Овоо", lat: 44.4218, lon: 105.3207, aliases: ["цогт-овоо", "цогт овоо", "цогтовоо", "tsogt-ovoo", "tsogt ovoo"] },
  dalanzadgad: { name: "Даланзадгад", lat: 43.5717, lon: 104.426, aliases: ["даланзадгад", "dalanzadgad"] },
  tsogttsetsii: { name: "Цогтцэций", lat: 43.7296, lon: 105.5734, aliases: ["цогтцэций", "цогт цэций", "tsogttsetsii"] },
  tsagaankhad: { name: "Цагаанхад", lat: 42.5785, lon: 107.5437, aliases: ["цагаанхад", "цагаан хад", "tsagaankhad", "tsagaan khad"] },
  gashuunsukhait: { name: "Гашуунсухайт", lat: 42.4139, lon: 107.5691, aliases: ["гашуунсухайт", "гашуун сухайт", "gashuunsukhait", "gashuun sukhait"] },
  khanbogd: { name: "Ханбогд", lat: 43.1958, lon: 107.1934, aliases: ["ханбогд", "khanbogd"] },
  bayandalai: { name: "Баяндалай", lat: 43.4674, lon: 103.5104, aliases: ["баяндалай", "bayandalai"] },
  gurvantes: { name: "Гурвантэс", lat: 43.228, lon: 101.0441, aliases: ["гурвантэс", "gurvantes"] },
  shiveekhuren: { name: "Шивээхүрэн", lat: 42.5885, lon: 101.2819, aliases: ["шивээхүрэн", "шивээ хүрэн", "shiveekhuren", "shivee khuren"] }
};

/**
 * Curated weather stops for the form's routes, in driving order with
 * approximate road distance (км) from the start. Verified against
 * OpenStreetMap road data via OSRM on 2026-10-26: every stop lies within
 * 1 km of the computed driving route. Reverse routes reuse these in reverse.
 */
export const ROUTES = [
  {
    stops: [["ulaanbaatar", 0], ["mandalgovi", 273], ["tsogtOvoo", 453], ["dalanzadgad", 577]]
  },
  {
    stops: [["ulaanbaatar", 0], ["mandalgovi", 273], ["tsogtOvoo", 453], ["tsogttsetsii", 535], ["tsagaankhad", 762]]
  },
  {
    stops: [["ulaanbaatar", 0], ["mandalgovi", 273], ["tsogtOvoo", 453], ["dalanzadgad", 577], ["bayandalai", 659], ["shiveekhuren", 924]]
  },
  {
    stops: [["ulaanbaatar", 0], ["mandalgovi", 273], ["tsogtOvoo", 453], ["dalanzadgad", 577], ["bayandalai", 659], ["gurvantes", 915]]
  },
  {
    stops: [["dalanzadgad", 0], ["bayandalai", 83], ["gurvantes", 338]]
  }
];

const isLetter = (char) => Boolean(char) && /\p{L}/u.test(char);

/** Finds known places in free text, in the order they appear. */
function findPlaces(text) {
  const haystack = String(text || "").toLowerCase();
  const found = [];

  for (const [key, place] of Object.entries(PLACES)) {
    for (const alias of place.aliases) {
      let index = haystack.indexOf(alias);
      while (index !== -1) {
        const before = haystack[index - 1];
        const after = haystack[index + alias.length];
        // Whole-word match only, so "уб" does not match inside another word.
        if (!isLetter(before) && !isLetter(after)) {
          found.push({ key, index, length: alias.length });
        }
        index = haystack.indexOf(alias, index + 1);
      }
    }
  }

  // Drop matches nested inside a longer one (e.g. "цогт овоо" vs "овоо").
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const ordered = [];
  let end = -1;
  for (const match of found) {
    if (match.index < end) continue;
    end = match.index + match.length;
    if (ordered[ordered.length - 1] !== match.key) ordered.push(match.key);
  }
  return ordered;
}

/**
 * Turns the form's direction text into weather stops.
 * coverage: "full" for a curated route, "partial" when only the named
 * places are known, "none" when no place is recognized.
 */
export function resolveRoute(directionText) {
  const keys = findPlaces(directionText);

  if (keys.length >= 2) {
    const from = keys[0];
    const to = keys[keys.length - 1];

    for (const route of ROUTES) {
      const first = route.stops[0][0];
      const last = route.stops[route.stops.length - 1][0];
      const total = route.stops[route.stops.length - 1][1];

      if (first === from && last === to) {
        return { coverage: "full", stops: route.stops.map(([key, km]) => ({ key, km })) };
      }
      if (first === to && last === from) {
        return {
          coverage: "full",
          stops: [...route.stops].reverse().map(([key, km]) => ({ key, km: total - km }))
        };
      }
    }
  }

  if (keys.length === 0) return { coverage: "none", stops: [] };

  return { coverage: "partial", stops: keys.map((key) => ({ key, km: null })) };
}

// ---- Forecast fetching -----------------------------------------------------

// Warm serverless instances reuse responses until MET's Expires time, as its
// terms of service require; concurrent lookups for one point share a request.
const cache = new Map();
const inFlight = new Map();

export function clearWeatherCache() {
  cache.clear();
  inFlight.clear();
}

async function fetchForecast(place, { fetchImpl, now }) {
  // MET rejects coordinates with more than 4 decimals.
  const lat = place.lat.toFixed(4);
  const lon = place.lon.toFixed(4);
  const cacheKey = `${lat},${lon}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now()) return cached.body;

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = {
        "User-Agent": process.env.WEATHER_USER_AGENT || DEFAULT_USER_AGENT,
        Accept: "application/json"
      };
      if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

      const response = await fetchImpl(`${MET_URL}?lat=${lat}&lon=${lon}`, {
        headers,
        signal: controller.signal
      });

      const expiresHeader = Date.parse(response.headers.get("expires") || "");
      const expires = Number.isFinite(expiresHeader) ? expiresHeader : now() + 30 * 60 * 1000;

      if (response.status === 304 && cached) {
        cache.set(cacheKey, { ...cached, expires });
        return cached.body;
      }

      if (!response.ok) {
        // Rate-limited or down: a stale forecast beats none at all.
        if (cached) return cached.body;
        throw new Error(`MET Norway HTTP ${response.status}`);
      }

      const body = await response.json();
      if (!Array.isArray(body?.properties?.timeseries)) {
        throw new Error("MET Norway: unexpected response shape");
      }

      cache.set(cacheKey, { body, expires, lastModified: response.headers.get("last-modified") });
      return body;
    } catch (error) {
      if (cached) return cached.body;
      throw error;
    } finally {
      clearTimeout(timer);
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}

// ---- Summaries -------------------------------------------------------------

/**
 * MET symbol codes (without the _day/_night/_polartwilight suffix) mapped to
 * Mongolian, with a severity rank used to pick the most significant
 * condition across the window.
 */
const CONDITIONS = {
  clearsky: ["Цэлмэг", 0],
  fair: ["Багавтар үүлтэй", 1],
  partlycloudy: ["Үүлшинэ", 2],
  cloudy: ["Үүлэрхэг", 3],
  fog: ["Манантай", 6],
  lightrainshowers: ["Бага зэргийн аадар бороо", 10],
  lightrain: ["Бага зэргийн бороо", 10],
  rainshowers: ["Аадар бороо", 12],
  rain: ["Бороотой", 12],
  heavyrainshowers: ["Хүчтэй аадар бороо", 14],
  heavyrain: ["Хүчтэй бороо", 14],
  lightsleetshowers: ["Бага зэргийн хур тунадас (бороо, цас)", 15],
  lightsleet: ["Бага зэргийн хур тунадас (бороо, цас)", 15],
  sleetshowers: ["Хур тунадас (бороо, цас холилдсон)", 16],
  sleet: ["Хур тунадас (бороо, цас холилдсон)", 16],
  heavysleetshowers: ["Их хур тунадас (бороо, цас холилдсон)", 18],
  heavysleet: ["Их хур тунадас (бороо, цас холилдсон)", 18],
  lightsnowshowers: ["Бага зэргийн цас", 17],
  lightsnow: ["Бага зэргийн цас", 17],
  snowshowers: ["Цастай", 19],
  snow: ["Цастай", 19],
  heavysnowshowers: ["Их цастай", 21],
  heavysnow: ["Их цастай", 21]
};

function describeSymbol(symbolCode) {
  const base = String(symbolCode || "").replace(/_(day|night|polartwilight)$/, "");
  const thunder = base.includes("andthunder");
  const [label, rank] = CONDITIONS[base.replace("andthunder", "")] || [null, -1];
  if (!label) return { label: null, rank: -1, snow: false, rain: false };

  return {
    label: thunder ? `${label}, аянга цахилгаантай` : label,
    rank: thunder ? rank + 2 : rank,
    snow: /snow|sleet/.test(base),
    rain: /rain|sleet/.test(base)
  };
}

const HOUR = 60 * 60 * 1000;

/** UTC bounds of the daytime window on the travel date, Ulaanbaatar time. */
export function travelWindow(travelDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(travelDate || "");
  if (!match) return null;
  const [, year, month, day] = match.map(Number);

  return {
    start: Date.UTC(year, month - 1, day, WINDOW_START_HOUR - UB_UTC_OFFSET_HOURS),
    end: Date.UTC(year, month - 1, day, WINDOW_END_HOUR - UB_UTC_OFFSET_HOURS)
  };
}

/**
 * Summarizes a MET timeseries over [start, end). Each entry's next_1_hours
 * or next_6_hours block covers the gap to the next entry (hourly for the
 * first ~2.5 days, 6-hourly after), so precipitation is never double-counted.
 */
export function summarize(timeseries, { start, end }) {
  const entries = timeseries
    .map((entry) => ({ ...entry, t: Date.parse(entry.time) }))
    .filter((entry) => Number.isFinite(entry.t))
    .sort((a, b) => a.t - b.t);

  let tempMin = Infinity;
  let tempMax = -Infinity;
  let feelsMin = Infinity;
  let windMax = -Infinity;
  let fogMax = 0;
  let precip = 0;
  let snowPrecip = 0;
  let rainPrecip = 0;
  let covered = 0;
  let worst = { label: null, rank: -1 };

  entries.forEach((entry, index) => {
    const instant = entry.data?.instant?.details || {};

    // Instants are point readings, so the window's closing hour counts too.
    if (entry.t >= start && entry.t <= end) {
      if (Number.isFinite(instant.air_temperature)) {
        tempMin = Math.min(tempMin, instant.air_temperature);
        tempMax = Math.max(tempMax, instant.air_temperature);
      }
      if (Number.isFinite(instant.apparent_air_temperature)) {
        feelsMin = Math.min(feelsMin, instant.apparent_air_temperature);
      }
      if (Number.isFinite(instant.wind_speed)) windMax = Math.max(windMax, instant.wind_speed);
      if (Number.isFinite(instant.fog_area_fraction)) fogMax = Math.max(fogMax, instant.fog_area_fraction);
    }

    if (entry.t < start || entry.t >= end) return;

    const next = entries[index + 1];
    const gapHours = next ? (next.t - entry.t) / HOUR : entry.data?.next_1_hours ? 1 : 6;
    const period = gapHours <= 1 && entry.data?.next_1_hours ? entry.data.next_1_hours : entry.data?.next_6_hours;
    if (!period) return;

    const periodHours = period === entry.data.next_1_hours ? 1 : 6;
    const overlapHours = Math.min(gapHours, periodHours, (end - entry.t) / HOUR);
    covered += overlapHours;

    const details = period.details || {};
    if (Number.isFinite(details.air_temperature_min)) tempMin = Math.min(tempMin, details.air_temperature_min);
    if (Number.isFinite(details.air_temperature_max)) tempMax = Math.max(tempMax, details.air_temperature_max);

    const condition = describeSymbol(period.summary?.symbol_code);
    if (condition.rank > worst.rank) worst = condition;

    const amount = (details.precipitation_amount || 0) * (overlapHours / periodHours);
    precip += amount;
    if (condition.snow) snowPrecip += amount;
    else if (condition.rain) rainPrecip += amount;
  });

  if (covered === 0 || !Number.isFinite(tempMin)) return null;

  return {
    tempMin,
    tempMax,
    feelsMin: Number.isFinite(feelsMin) ? feelsMin : null,
    windMax: Number.isFinite(windMax) ? windMax : null,
    fogMax,
    precip,
    snowPrecip,
    rainPrecip,
    condition: worst.label,
    coveredHours: covered,
    windowHours: (end - start) / HOUR
  };
}

// Preparation advice per warning type, shown once per route however many
// stops trigger it.
const ADVICE = {
  cold: "Дулаан хувцас, малгай, бээлий, нэмэлт хөнжил авч, машины халаалт болон хөлдөлтийн эсрэг шингэнийг шалгана уу.",
  heat: "Хангалттай ундны ус авч, нарнаас хамгаалах хэрэгсэл хэрэглэн, машины хөргөлтийн систем болон агааржуулагчийг шалгана уу.",
  wind: "Хажуугийн хүчтэй салхинд хурдаа сааруулж, ачаа болон тээшний бэхэлгээг шалгана уу. Шороон шуурга болвол зогсож хүлээнэ үү.",
  snow: "Замын нөхцөл байдлыг урьдчилан лавлаж, дугуй, гэрэл, тоормос зэрэг тээврийн хэрэгслийн бэлэн байдлыг шалгана уу.",
  rain: "Замын нөхцөл байдлыг урьдчилан лавлаж, хурдаа тохируулна уу. Үерийн ус, сайр гатлахаас болгоомжилно уу.",
  fog: "Үзэгдэх орчин муудвал гэрлээ асааж, хурдаа сааруулан, урд явж буй машинаас хол зай барина уу."
};

const ADVICE_ORDER = ["cold", "heat", "wind", "snow", "rain", "fog"];

/**
 * Forecast-based caution flags for one stop, in Mongolian. Not official
 * alerts. Each is { type, level: "moderate" | "serious", text }.
 * startTempMin is the route's starting point low, for "much colder than
 * where you set off" warnings; pass null for the start itself.
 */
export function warningsFor(summary, { limits = thresholds(), startTempMin = null } = {}) {
  const warnings = [];
  const add = (type, level, text) => warnings.push({ type, level, text });
  const round1 = (value) => Math.round(value * 10) / 10;

  if (summary.windMax !== null && summary.windMax >= limits.strongWind) {
    add("wind", summary.windMax >= limits.severeWind ? "serious" : "moderate", `Хүчтэй салхи (${Math.round(summary.windMax)} м/с хүртэл)`);
  }
  if (summary.snowPrecip >= limits.heavySnow) {
    add("snow", "serious", `Их цас (${round1(summary.snowPrecip)} мм)`);
  } else if (summary.snowPrecip > 0.1) {
    add("snow", "moderate", "Цас орох төлөвтэй, зам хальтиргаатай байж болзошгүй");
  }
  if (summary.rainPrecip >= limits.heavyRain) {
    add("rain", "serious", `Их бороо (${round1(summary.rainPrecip)} мм)`);
  } else if (summary.rainPrecip > 0.1) {
    add("rain", "moderate", "Бороо орох төлөвтэй");
  }
  if (summary.tempMin <= limits.extremeCold) {
    add("cold", "serious", `Хэт хүйтэн (${Math.round(summary.tempMin)}°C хүртэл)`);
  } else if (summary.tempMin <= limits.cold) {
    add("cold", "moderate", `Хүйтэн (${Math.round(summary.tempMin)}°C хүртэл)`);
  } else if (startTempMin !== null && summary.tempMin <= 0 && startTempMin - summary.tempMin >= limits.colderThanStart) {
    add("cold", "moderate", `Гарах цэгээс ${Math.round(startTempMin - summary.tempMin)}°C хүйтэн (${Math.round(summary.tempMin)}°C хүртэл)`);
  }
  if (summary.tempMax >= limits.extremeHeat) {
    add("heat", "serious", `Хэт халуун (${Math.round(summary.tempMax)}°C хүртэл)`);
  } else if (summary.tempMax >= limits.heat) {
    add("heat", "moderate", `Халуун (${Math.round(summary.tempMax)}°C хүртэл)`);
  }
  if (summary.fogMax >= limits.fog) {
    add("fog", "moderate", "Манан, үзэгдэх орчин муудах магадлалтай");
  }

  return warnings;
}

/**
 * Adds warnings to each forecast stop and derives the route's overall risk
 * level and preparation advice. This one analysis feeds both the email and
 * the success page.
 */
export function analyzeRoute(stops, limits = thresholds()) {
  const start = stops[0]?.ok ? stops[0].summary.tempMin : null;

  const analyzed = stops.map((stop, index) =>
    stop.ok
      ? { ...stop, warnings: warningsFor(stop.summary, { limits, startTempMin: index === 0 ? null : start }) }
      : stop
  );

  const all = analyzed.flatMap((stop) => stop.warnings || []);
  const level = all.some((w) => w.level === "serious") ? "serious" : all.length > 0 ? "moderate" : "normal";
  const types = new Set(all.map((w) => w.type));
  const advice = ADVICE_ORDER.filter((type) => types.has(type)).map((type) => ADVICE[type]);

  return { stops: analyzed, level, advice };
}

/**
 * Builds the weather snapshot for a submitted form. Options exist for tests:
 * fetchImpl replaces global fetch, now() replaces Date.now().
 */
export async function getRouteWeather(form, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const directionText = form?.direction === "Бусад" ? form?.otherDirection : form?.direction;
  const base = {
    directionText: directionText || "",
    travelDate: form?.travelDate || "",
    windowLabel: `${String(WINDOW_START_HOUR).padStart(2, "0")}:00–${WINDOW_END_HOUR}:00`,
    generatedAt: new Date(now()).toISOString(),
    stops: []
  };

  try {
    if (String(process.env.ROUTE_WEATHER_ENABLED || "").toLowerCase() === "false") {
      return { ...base, status: "disabled" };
    }

    const route = resolveRoute(directionText);
    const window = travelWindow(form?.travelDate);

    // `reason` lets the success page tell a temporary outage ("error") apart
    // from a lookup that can never succeed for this route or date.
    if (route.coverage === "none") {
      return { ...base, status: "unavailable", reason: "route", coverage: "none", message: "Маршрутын байршлыг тодорхойлж чадсангүй." };
    }
    if (!window) {
      return { ...base, status: "unavailable", reason: "date", coverage: route.coverage, message: "Аялах өдөр буруу форматтай байна." };
    }
    if (window.end <= now()) {
      return { ...base, status: "unavailable", reason: "past", coverage: route.coverage, message: "Аялах өдөр өнгөрсөн тул урьдчилсан мэдээ гаргах боломжгүй." };
    }

    const stops = await Promise.all(
      route.stops.map(async ({ key, km }) => {
        const place = PLACES[key];
        const stop = { name: place.name, km };

        try {
          const body = await fetchForecast(place, { fetchImpl, now });
          const summary = summarize(body.properties.timeseries, window);
          if (!summary) {
            return { ...stop, ok: false, reason: "out_of_range" };
          }
          return { ...stop, ok: true, summary };
        } catch (error) {
          console.warn(`[route-weather] ${place.name}: ${error.name === "AbortError" ? "timeout" : error.message}`);
          return { ...stop, ok: false, reason: "error" };
        }
      })
    );

    const okCount = stops.filter((stop) => stop.ok).length;
    const allOutOfRange = stops.every((stop) => stop.reason === "out_of_range");

    if (okCount === 0) {
      return {
        ...base,
        status: "unavailable",
        reason: allOutOfRange ? "out_of_range" : "error",
        coverage: route.coverage,
        stops,
        message: allOutOfRange
          ? "Аялах өдөр урьдчилсан мэдээний хугацаанаас (ойролцоогоор 9 хоног) хэтэрсэн байна."
          : "Цаг агаарын мэдээллийг одоогоор татаж чадсангүй."
      };
    }

    const analysis = analyzeRoute(stops);

    return {
      ...base,
      status: okCount === stops.length ? "ok" : "partial",
      coverage: route.coverage,
      stops: analysis.stops,
      level: analysis.level,
      advice: analysis.advice
    };
  } catch (error) {
    console.warn("[route-weather] failed:", error.message);
    return { ...base, status: "unavailable", reason: "error", message: "Цаг агаарын мэдээллийг одоогоор татаж чадсангүй." };
  }
}

const MAX_FIELD_LENGTH = 200;

/**
 * Handles POST /api/weather from the success page. Accepts only the route and
 * travel date (in the body, never the URL) and returns the same snapshot the
 * email uses. Returns a { status, body } pair the HTTP layer can send as-is.
 */
export async function handleWeatherRequest(payload, options) {
  const field = (name) => {
    const value = payload?.[name];
    return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
  };

  const form = {
    direction: field("direction"),
    otherDirection: field("otherDirection"),
    travelDate: field("travelDate")
  };

  if (!form.direction || !form.travelDate) {
    return { status: 400, body: { error: "Маршрут болон аялах өдөр шаардлагатай." } };
  }

  return { status: 200, body: await getRouteWeather(form, options) };
}
