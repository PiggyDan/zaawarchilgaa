/** Builds MET Locationforecast-shaped responses for tests. */

const HOUR = 60 * 60 * 1000;

/**
 * Hourly entries for `hourlyCount` hours from `start`, then 6-hourly entries
 * up to `days` days, mirroring MET's real layout. `values(t)` may override
 * temperature, wind, precipitation per hour and symbol for a given time.
 */
export function makeForecast({ start, hourlyCount = 60, days = 9, values = () => ({}) }) {
  const timeseries = [];
  const first = Date.parse(start);
  const last = first + days * 24 * HOUR;

  let t = first;
  for (let i = 0; i < hourlyCount; i++, t += HOUR) {
    timeseries.push(entry(t, 1, values(t)));
  }
  // Align to the 6-hour grid like MET does.
  while (new Date(t).getUTCHours() % 6 !== 0) t += HOUR;
  for (; t <= last; t += 6 * HOUR) {
    timeseries.push(entry(t, 6, values(t)));
  }
  return { type: "Feature", properties: { timeseries } };
}

function entry(t, periodHours, v) {
  const temp = v.temp ?? 2;
  const precipPerHour = v.precipPerHour ?? 0;
  const symbol = v.symbol ?? "clearsky_day";
  const period = {
    summary: { symbol_code: symbol },
    details: {
      precipitation_amount: precipPerHour * periodHours,
      ...(periodHours === 6 ? { air_temperature_min: temp - 1, air_temperature_max: temp + 1 } : {})
    }
  };

  return {
    time: new Date(t).toISOString().replace(".000", ""),
    data: {
      instant: {
        details: {
          air_temperature: temp,
          apparent_air_temperature: v.feels ?? temp - 2,
          wind_speed: v.wind ?? 4,
          fog_area_fraction: v.fog ?? 0
        }
      },
      ...(periodHours === 1 ? { next_1_hours: period } : {}),
      next_6_hours: periodHours === 6 ? period : { summary: { symbol_code: symbol }, details: { precipitation_amount: precipPerHour * 6 } }
    }
  };
}

/** A fetch stand-in that answers with `body` and records each call. */
export function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const result = await respond(url, options, calls.length);
    const { status = 200, body = null, headers = {} } = result;
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => lower[name.toLowerCase()] ?? null },
      json: async () => body
    };
  };
  return { fetchImpl, calls };
}
