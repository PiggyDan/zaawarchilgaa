/**
 * Display text for a route-weather snapshot (see api/_route-weather.js).
 * Shared by the notification email (server) and the success page (browser),
 * so both show exactly the same values and wording. No Node or DOM APIs.
 */

export const WEATHER_TITLE = "МАРШРУТЫН ДАГУУХ ЦАГ АГААРЫН МЭДЭЭЛЭЛ";

export const WEATHER_DISCLAIMER =
  "Цаг агаарын мэдээлэл нь урьдчилсан төлөв бөгөөд замын нөхцөл байдлыг холбогдох эх сурвалжаас нэмж шалгана уу.";

export const ATTRIBUTION =
  "Эх сурвалж: MET Norway (api.met.no), CC BY 4.0. Өгөгдлийг аялах өдрийн хураангуй болгон боловсруулав.";

export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

export const NOT_OFFICIAL = "Анхааруулга нь урьдчилсан мэдээнд үндэслэсэн бөгөөд албан ёсны сэрэмжлүүлэг биш.";

export const PARTIAL_COVERAGE =
  "Энэ чиглэлийн замын маршрут бүртгэлгүй тул зөвхөн нэр дурдсан байршлуудын мэдээллийг харуулав. Замын дундах цэгүүд хамрагдаагүй.";

export const ADVICE_TITLE = "Аяллын бэлтгэл";

export const LEVEL_SUMMARY = {
  serious: "Аюултай цаг агаарын эрсдэлтэй. Аяллаа сайтар бэлтгэнэ үү.",
  moderate: "Анхаарах шаардлагатай цаг агаар төлөвтэй.",
  normal: "Онцгой эрсдэлтэй цаг агаар төлөвлөгдөөгүй байна."
};

export function formatTemp(value) {
  const rounded = Math.round(value);
  // Avoid "-0°C" for values like -0.3.
  if (rounded === 0) return "0°C";
  return `${rounded > 0 ? "+" : ""}${rounded}°C`;
}

export function formatTempRange(min, max) {
  const low = formatTemp(min);
  const high = formatTemp(max);
  return low === high ? low : `${low} … ${high}`;
}

export function formatPrecip(mm) {
  const rounded = Math.round(mm * 10) / 10;
  return `${rounded < 0.1 ? 0 : rounded} мм`;
}

export function routeLabel(weather) {
  if (weather.stops?.length >= 2) return weather.stops.map((stop) => stop.name).join(" → ");
  return weather.directionText;
}

export function timeLabel(weather) {
  return `${weather.travelDate}, ${weather.windowLabel} (Улаанбаатарын цагаар)`;
}

export function stopTitle(stop) {
  return stop.km > 0 ? `${stop.name} (~${stop.km} км)` : stop.name;
}

/** Label/value pairs for one stop. */
export function stopLines(stop) {
  if (!stop.ok) {
    return [
      [
        "Мэдээлэл",
        stop.reason === "out_of_range"
          ? "Аялах өдрийн урьдчилсан мэдээ хараахан гараагүй байна."
          : "Мэдээлэл авах боломжгүй байна."
      ]
    ];
  }

  const { summary } = stop;
  const lines = [["Температур", formatTempRange(summary.tempMin, summary.tempMax)]];

  if (summary.feelsMin !== null && summary.feelsMin <= summary.tempMin - 3) {
    lines.push(["Мэдрэгдэх", `${formatTemp(summary.feelsMin)} хүртэл`]);
  }

  lines.push(["Цаг агаар", summary.condition || "-"]);
  lines.push(["Салхи", summary.windMax === null ? "-" : `${Math.round(summary.windMax)} м/с хүртэл`]);
  lines.push(["Хур тунадас", formatPrecip(summary.precip)]);

  if (summary.coveredHours < summary.windowHours) {
    lines.push(["Тайлбар", "Тухайн өдрийн мэдээ хэсэгчилсэн байна."]);
  }

  return lines;
}

export const hasWarnings = (weather) =>
  (weather.stops || []).some((stop) => stop.ok && stop.warnings?.length > 0);
