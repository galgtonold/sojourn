// Server-only: a daily weather summary for the day(s) a post's photos were
// taken, so the AI can ground descriptions in the real conditions (sun, rain,
// temperature) instead of guessing. Uses Open-Meteo — free, no API key. Best
// effort: any failure returns null and the dossier simply omits the weather.
import "server-only";

export type WeatherDay = {
  date: string; // YYYY-MM-DD
  label: string; // short German description
  tMax: number | null;
  tMin: number | null;
  precipMm: number | null;
};

// WMO weather interpretation codes → short German labels.
function describeWeather(code: number): string {
  if (code === 0) return "klar";
  if (code === 1) return "überwiegend klar";
  if (code === 2) return "teils bewölkt";
  if (code === 3) return "bedeckt";
  if (code === 45 || code === 48) return "neblig";
  if (code >= 51 && code <= 55) return "Nieselregen";
  if (code === 56 || code === 57) return "gefrierender Nieselregen";
  if (code === 61) return "leichter Regen";
  if (code === 63) return "Regen";
  if (code === 65) return "starker Regen";
  if (code === 66 || code === 67) return "gefrierender Regen";
  if (code === 71) return "leichter Schneefall";
  if (code === 73) return "Schneefall";
  if (code === 75) return "starker Schneefall";
  if (code === 77) return "Schneegriesel";
  if (code >= 80 && code <= 82) return "Regenschauer";
  if (code === 85 || code === 86) return "Schneeschauer";
  if (code === 95) return "Gewitter";
  if (code === 96 || code === 99) return "Gewitter mit Hagel";
  return "wechselhaft";
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Daily weather for a single representative location over an inclusive date
// range. The post is localized, so one point stands in for the whole outing.
export async function dailyWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<WeatherDay[] | null> {
  try {
    // The forecast endpoint covers the recent past (~92 days) and the near
    // future; the archive (ERA5) covers everything older. Pick by how old the
    // last day is so a ride from this week and one from last year both resolve.
    const end = new Date(`${endDate}T00:00:00Z`);
    const ageDays = (Date.now() - end.getTime()) / 86_400_000;
    const base =
      ageDays > 80
        ? "https://archive-api.open-meteo.com/v1/archive"
        : "https://api.open-meteo.com/v1/forecast";
    const url =
      `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&start_date=${startDate}&end_date=${endDate}` +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
      "&timezone=auto";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
      };
    };
    const d = j.daily;
    if (!d?.time?.length) return null;
    return d.time.map((date, i) => ({
      date,
      label: describeWeather(Number(d.weather_code?.[i])),
      tMax: num(d.temperature_2m_max?.[i]),
      tMin: num(d.temperature_2m_min?.[i]),
      precipMm: num(d.precipitation_sum?.[i]),
    }));
  } catch {
    return null;
  }
}
