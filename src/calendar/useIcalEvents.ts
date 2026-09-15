import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchGoogleCalendarEvents } from './fetchIcal';
import type {
  CalendarEvent,
  CalendarRange,
  CalendarSource,
  FeedStatus,
} from './types';

export function useIcalEvents(
  sources: CalendarSource[],
  range: CalendarRange,
  refreshKey: number
): {
  events: CalendarEvent[];
  statuses: Record<string, FeedStatus>;
} {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, FeedStatus>>({});

  const sourcesJson = JSON.stringify(sources);
  const currentSources = useMemo(
    () => JSON.parse(sourcesJson) as CalendarSource[],
    [sourcesJson]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadFeeds(): Promise<void> {
      if (currentSources.length === 0) {
        setEvents([]);
        setStatuses({});
        return;
      }

      // Mark all current sources as loading
      setStatuses(
        Object.fromEntries(
          currentSources.map((source) => [source.id, { loading: true }])
        )
      );

      const nextEvents: CalendarEvent[] = [];
      const nextStatuses: Record<string, FeedStatus> = {};

      // Fetch all calendars in parallel.
      await Promise.all(
        currentSources.map(async (source) => {
          try {
            const fetchedEvents = await fetchGoogleCalendarEvents(
              source,
              range,
              controller.signal
            );
            if (!cancelled) {
              nextEvents.push(...fetchedEvents);
              nextStatuses[source.id] = { loading: false };
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
            if (!cancelled) {
              nextStatuses[source.id] = {
                loading: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to load feed',
              };
            }
          }
        })
      );

      if (cancelled) return;

      // A single atomic update keeps all calendar results in sync.
      setEvents(nextEvents);
      setStatuses(nextStatuses);
    }

    void loadFeeds();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentSources, range, refreshKey]);

  return { events, statuses };
}

export function useRefreshKey(intervalMs = 5 * 60 * 1000): {
  refresh: () => void;
  refreshKey: number;
} {
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return { refresh, refreshKey };
}
