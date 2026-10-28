// C-158: the real weather, for a city set on the site (the user, 2026-10-18: "A city set on the site"). Open-Meteo answers
// without an account: its geocoding names the city's place, its forecast the weather there now. Only the city and its
// place are kept ("weather.city"); the weather now is kept as "weather.now" (context.ts reads it), fetched every fifteen
// minutes while a city is set. Node's own fetch; the phone hosting alone has no weather of its own.
import type { Store } from "./store.js";
import { skyOf, type Weather } from "./context.js";

export interface Place { name: string; country: string; latitude: number; longitude: number }
const GEO = "https://geocoding-api.open-meteo.com/v1/search", NOW = "https://api.open-meteo.com/v1/forecast";

export function weatherPlace(store: Store): Place | null {
  try { return JSON.parse(store.getSetting("weather.city") ?? "null"); } catch { return null; }
}

// a city by its name -- the first place Open-Meteo knows by it -- kept, and its weather fetched at once; "" forgets it
export async function setWeatherCity(store: Store, name: string, get: typeof fetch = fetch): Promise<Place | null> {
  if (!name.trim()) { store.setSetting("weather.city", null); store.setSetting("weather.now", null); return null; }
  const r = await get(`${GEO}?name=${encodeURIComponent(name.trim())}&count=1&language=en&format=json`);
  const p = (await r.json() as { results?: Place[] }).results?.[0];
  if (!p) throw new Error(`no place called ${name}`);
  const place = { name: p.name, country: p.country, latitude: p.latitude, longitude: p.longitude };
  store.setSetting("weather.city", JSON.stringify(place));
  await refreshWeather(store, get);
  return place;
}

export async function refreshWeather(store: Store, get: typeof fetch = fetch): Promise<Weather | null> {
  const p = weatherPlace(store);
  if (!p) return null;
  const r = await get(`${NOW}?latitude=${p.latitude}&longitude=${p.longitude}&current=weather_code,temperature_2m`);
  const c = (await r.json() as { current?: { weather_code: number; temperature_2m: number } }).current;
  if (!c) return null;
  const w: Weather = { kind: skyOf(c.weather_code), code: c.weather_code, tempC: Math.round(c.temperature_2m), city: p.name, at: new Date().toISOString() };
  store.setSetting("weather.now", JSON.stringify(w));
  return w;
}

// every fifteen minutes while a city is set (the server's own clock; nothing is fetched without a city)
export function weatherLoop(store: Store): () => void {
  const tick = () => { refreshWeather(store).catch(() => {}); };
  tick();
  const t = setInterval(tick, 15 * 60000);
  (t as { unref?: () => void }).unref?.();                     // never what keeps the process running (a number on the phone)
  return () => clearInterval(t);
}
