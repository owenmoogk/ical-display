import type { CalendarEvent, CalendarRange, CalendarSource } from './types';

const GOOGLE_API_KEY = 'AIzaSyBQ9865FeBx6huQBxUlQ083XyP8giU1G-A';

interface GoogleCalendarEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarEventTime;
  end?: GoogleCalendarEventTime;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

function extractCalendarId(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  const icalMatch = trimmed.match(/\/ical\/([^/]+)\//);
  if (icalMatch) {
    return decodeURIComponent(icalMatch[1]);
  }

  const cidMatch = trimmed.match(/[?&]cid=([^&]+)/);
  if (cidMatch) {
    return decodeURIComponent(cidMatch[1]);
  }

  return trimmed;
}

function toDate(value: GoogleCalendarEventTime | undefined): Date | null {
  if (value?.dateTime) return new Date(value.dateTime);
  if (value?.date) return new Date(`${value.date}T00:00:00`);
  return null;
}

function toCalendarEvent(
  item: GoogleCalendarEvent,
  source: CalendarSource
): CalendarEvent | null {
  const start = toDate(item.start);
  const end = toDate(item.end);

  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null;
  }

  return {
    id: `${source.id}-${item.id}`,
    title: item.summary || 'Busy',
    start,
    end,
    allDay: Boolean(item.start?.date),
    color: source.color,
    calendarName: source.name,
    description: item.description || '',
    location: item.location || '',
    sourceId: source.id,
  };
}

export async function fetchGoogleCalendarEvents(
  source: CalendarSource,
  range: CalendarRange,
  signal?: AbortSignal
): Promise<CalendarEvent[]> {
  if (range.start >= range.end) {
    throw new Error('Invalid calendar range');
  }

  const calendarId = extractCalendarId(source.url);
  if (!calendarId) {
    throw new Error('Enter a valid Google Calendar ID or URL');
  }

  let allItems: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined = undefined;

  // Loop to handle API pagination so no events are ever dropped
  do {
    const params = new URLSearchParams({
      key: GOOGLE_API_KEY,
      maxResults: '2500',
      orderBy: 'startTime',
      singleEvents: 'true',
      timeMax: range.end.toISOString(),
      timeMin: range.start.toISOString(),
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?${params.toString()}`;

    const response = await fetch(apiUrl, { signal });

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        throw new Error(
          'Calendar not found or access denied. Ensure the calendar is set to "Make available to public" in Google Calendar settings.'
        );
      }
      throw new Error(
        `Google API request failed (${response.status.toString()})`
      );
    }

    const data = (await response.json()) as GoogleCalendarEventsResponse;
    if (data.items) {
      allItems = allItems.concat(data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allItems.flatMap((item) => {
    if (item.status === 'cancelled') return [];
    const event = toCalendarEvent(item, source);
    return event ? [event] : [];
  });
}
