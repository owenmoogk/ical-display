const env = import.meta.env;

/** Backend origin. In dev, Vite proxies /auth and /api, so it is same-origin. */
export const API_URL =
  env.VITE_API_URL ?? (env.DEV ? '' : 'https://ical.owenmoogk.com');

/** Full link to a saved calendar, e.g. https://owenmoogk.com/ical-display/owen/family */
export function calendarUrl(owner: string, slug: string, embed = false) {
  const base = `${window.location.origin}${env.BASE_URL}${owner}/${slug}`;
  return embed ? `${base}?embed=1` : base;
}
