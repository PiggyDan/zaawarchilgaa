import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudSun, Loader2 } from "lucide-react";
import {
  ADVICE_TITLE,
  ATTRIBUTION,
  LEVEL_SUMMARY,
  LICENSE_URL,
  NOT_OFFICIAL,
  PARTIAL_COVERAGE,
  WEATHER_DISCLAIMER,
  hasWarnings,
  routeLabel,
  stopLines,
  stopTitle,
  timeLabel
} from "../shared/weather-format.js";

// The server bounds each forecast lookup to a few seconds; this only guards
// against a request that never returns at all.
const CLIENT_TIMEOUT_MS = 15000;

const UNAVAILABLE = "Цаг агаарын мэдээлэл түр боломжгүй байна.";

/**
 * Route weather shown on the success screen. Loads after the form has been
 * accepted, so it never delays or blocks the submission itself. `query`
 * holds only the route and travel date; it is sent in a POST body, never in
 * the URL.
 */
export function WeatherReport({ query }) {
  const [state, setState] = useState({ phase: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    setState({ phase: "loading" });

    fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((weather) => active && setState({ phase: "done", weather }))
      .catch(() => active && setState({ phase: "error" }))
      .finally(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (state.phase === "loading") {
    return (
      <section className="weatherReport" aria-live="polite" aria-busy="true">
        <div className="weatherLoading">
          <Loader2 size={18} className="weatherSpin" />
          <span>Маршрутын цаг агаарын мэдээллийг татаж байна…</span>
        </div>
      </section>
    );
  }

  const weather = state.weather;

  if (weather?.status === "disabled") return null;

  if (state.phase === "error" || !weather || (weather.status === "unavailable" && weather.reason === "error")) {
    return (
      <section className="weatherReport" aria-live="polite">
        <p className="weatherNotice">{UNAVAILABLE}</p>
      </section>
    );
  }

  return (
    <section className="weatherReport" aria-live="polite">
      <header className="weatherHead">
        <CloudSun size={20} />
        <div>
          <h3>Маршрутын дагуух цаг агаар</h3>
          <p className="weatherRoute">{routeLabel(weather)}</p>
          <p className="weatherTime">{timeLabel(weather)}</p>
        </div>
      </header>

      {weather.status === "unavailable" ? (
        <p className="weatherNotice">{weather.message}</p>
      ) : (
        <>
          <div className={`weatherLevel weatherLevel--${weather.level}`} role={weather.level === "normal" ? undefined : "alert"}>
            {weather.level === "normal" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{LEVEL_SUMMARY[weather.level]}</span>
          </div>

          {weather.advice?.length > 0 && (
            <div className="weatherAdvice">
              <strong>{ADVICE_TITLE}</strong>
              <ul>
                {weather.advice.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <ol className="weatherStops">
            {weather.stops.map((stop) => (
              <li key={stop.name} className="weatherStop">
                <div className="weatherStopName">{stopTitle(stop)}</div>
                <dl>
                  {stopLines(stop).map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                {stop.ok && stop.warnings?.length > 0 && (
                  <ul className="weatherWarnings">
                    {stop.warnings.map((warning) => (
                      <li key={warning.text} className={`weatherWarning weatherWarning--${warning.level}`}>
                        <AlertTriangle size={14} />
                        {warning.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="weatherFoot">
        {weather.coverage === "partial" && <p>{PARTIAL_COVERAGE}</p>}
        {hasWarnings(weather) && <p>{NOT_OFFICIAL}</p>}
        <p>{WEATHER_DISCLAIMER}</p>
        <p className="weatherSource">
          {ATTRIBUTION}{" "}
          <a href={LICENSE_URL} target="_blank" rel="noreferrer">
            Лиценз
          </a>
        </p>
      </div>
    </section>
  );
}
