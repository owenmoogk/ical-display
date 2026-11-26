import type { CalendarSource } from '@ical/shared';
import { parseResponse } from 'hono/client';

import { client } from './client';

const one = client.api.calendars[':owner'][':slug'];
type Ref = { owner: string; slug: string };

export async function listCalendars() {
  return parseResponse(client.api.calendars.$get());
}

export async function createCalendar(input: { slug: string; title: string }) {
  return parseResponse(client.api.calendars.$post({ json: input }));
}

export async function getCalendar(param: Ref) {
  return parseResponse(one.$get({ param }));
}

export async function saveSources(
  param: Ref,
  sources: CalendarSource[],
  revision: number
) {
  return parseResponse(
    one.sources.$put({ param, json: { sources, revision } })
  );
}

export async function updateCalendar(
  param: Ref,
  patch: { slug?: string; title?: string }
) {
  return parseResponse(one.$patch({ param, json: patch }));
}

export async function deleteCalendar(param: Ref) {
  await parseResponse(one.$delete({ param }));
}

export async function setShares(param: Ref, logins: string[]) {
  return parseResponse(one.shares.$put({ param, json: { logins } }));
}
