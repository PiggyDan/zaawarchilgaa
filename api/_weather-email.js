/**
 * Renders a route-weather snapshot (see _route-weather.js) as a section of
 * the notification email, in HTML and plain text. Uses the same table-based,
 * inline-styled markup as the rest of the email so it renders in Gmail and
 * Outlook. Wording and formatting come from shared/weather-format.js, which
 * the success page uses too.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

import {
  ADVICE_TITLE,
  ATTRIBUTION,
  LEVEL_SUMMARY,
  LICENSE_URL,
  NOT_OFFICIAL,
  PARTIAL_COVERAGE,
  WEATHER_DISCLAIMER,
  WEATHER_TITLE,
  hasWarnings,
  routeLabel,
  stopLines,
  stopTitle,
  timeLabel
} from "../shared/weather-format.js";

export { WEATHER_TITLE, WEATHER_DISCLAIMER };

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Orange for moderate, red for serious; text colors pass contrast on white.
const LEVEL_COLORS = {
  serious: { text: "#b91c1c", background: "#fef2f2" },
  moderate: { text: "#c2410c", background: "#fff7ed" },
  normal: { text: "#15803d", background: "#f0fdf4" }
};

export function buildWeatherHtml(weather) {
  if (!weather || weather.status === "disabled") return "";

  const cell = "padding:8px 12px; border:1px solid #e5e7eb;";
  const labelCell = `${cell} background:#f9fafb; width:130px; vertical-align:top;`;
  const row = (label, value) => `
          <tr>
            <td style="${labelCell}">${esc(label)}</td>
            <td style="${cell}">${esc(value)}</td>
          </tr>`;
  const note = (text, color = "#6b7280") =>
    `<p style="margin:8px 0 0; font-size:12px; line-height:1.5; color:${color};">${esc(text)}</p>`;

  const warningRow = (stop) => {
    const serious = stop.warnings.some((w) => w.level === "serious");
    const colors = LEVEL_COLORS[serious ? "serious" : "moderate"];
    const items = stop.warnings
      .map((w) => `<span style="color:${LEVEL_COLORS[w.level].text};">${esc(w.text)}</span>`)
      .join("<br />");
    return `
          <tr>
            <td style="${labelCell} color:${colors.text};">Анхааруулга</td>
            <td style="${cell} background:${colors.background}; font-weight:700;">${items}</td>
          </tr>`;
  };

  const stops = (weather.stops || [])
    .map(
      (stop) => `
          <tr>
            <td colspan="2" style="${cell} background:#f1f5f9; font-weight:700;">${esc(stopTitle(stop))}</td>
          </tr>${stopLines(stop).map(([label, value]) => row(label, value)).join("")}${
            stop.ok && stop.warnings?.length > 0 ? warningRow(stop) : ""
          }`
    )
    .join("");

  const levelRow = weather.level
    ? `
          <tr>
            <td colspan="2" style="${cell} background:${LEVEL_COLORS[weather.level].background}; color:${LEVEL_COLORS[weather.level].text}; font-weight:700;">${esc(LEVEL_SUMMARY[weather.level])}</td>
          </tr>`
    : "";

  const advice = weather.advice?.length
    ? `
          <tr>
            <td style="${labelCell}">${ADVICE_TITLE}</td>
            <td style="${cell} line-height:1.5;">${weather.advice.map(esc).join("<br /><br />")}</td>
          </tr>`
    : "";

  return `
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px; margin-top:20px;">
          <tr>
            <td colspan="2" style="${cell} background:#eef2ff; font-weight:700;">${WEATHER_TITLE}</td>
          </tr>${row("Маршрут", routeLabel(weather))}${row("Хугацаа", timeLabel(weather))}${
            weather.status === "unavailable" ? row("Мэдээлэл", weather.message) : `${levelRow}${advice}${stops}`
          }
        </table>
        ${weather.coverage === "partial" ? note(PARTIAL_COVERAGE, "#92400e") : ""}
        ${hasWarnings(weather) ? note(NOT_OFFICIAL) : ""}
        ${note(WEATHER_DISCLAIMER, "#374151")}
        <p style="margin:4px 0 0; font-size:11px; color:#9ca3af;">${esc(ATTRIBUTION)} <a href="${LICENSE_URL}" style="color:#9ca3af;">Лиценз</a></p>`;
}

export function buildWeatherText(weather) {
  if (!weather || weather.status === "disabled") return "";

  const lines = [WEATHER_TITLE, "", `Маршрут: ${routeLabel(weather)}`, `Хугацаа: ${timeLabel(weather)}`, ""];

  if (weather.status === "unavailable") {
    lines.push(weather.message, "");
  } else {
    if (weather.level) lines.push(LEVEL_SUMMARY[weather.level], "");
    if (weather.advice?.length) {
      lines.push(`${ADVICE_TITLE}:`);
      weather.advice.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
    for (const stop of weather.stops) {
      lines.push(stopTitle(stop));
      stopLines(stop).forEach(([label, value]) => lines.push(`- ${label}: ${value}`));
      if (stop.ok && stop.warnings?.length > 0) {
        lines.push(`- Анхааруулга: ${stop.warnings.map((w) => w.text).join("; ")}`);
      }
      lines.push("");
    }
  }

  if (weather.coverage === "partial") lines.push(PARTIAL_COVERAGE);
  lines.push(WEATHER_DISCLAIMER, ATTRIBUTION);

  return lines.join("\n");
}
