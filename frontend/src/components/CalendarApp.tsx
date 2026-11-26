import type { CalendarDto, CalendarSource } from '@ical/shared';
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Burger,
  Button,
  Flex,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { addDays, endOfMonth, startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { FiArrowLeft, FiSettings } from 'react-icons/fi';
import { IoRefresh } from 'react-icons/io5';
import { Link, useParams, useSearchParams } from 'react-router';

import { getCalendar, saveSources } from '@api/calendars';
import { errorMessage, errorStatus } from '@api/client';
import { calendarUrl } from '@global/config';
import { useSession } from '@global/session';

import { nextCalendarColor } from '../calendar/colors';
import type { CalendarRange } from '../calendar/types';
import { useIcalEvents, useRefreshKey } from '../calendar/useIcalEvents';
import { anyHidden } from '../calendar/visibility';
import { CalendarSettingsModal } from './CalendarSettingsModal';
import { CalendarSidebar } from './CalendarSidebar';
import { CalendarView } from './CalendarView';
import { SignInButton, UserMenu } from './UserMenu';

/** Text edits (names, colors) are saved after this pause; adds/removes at once. */
const TYPING_DELAY = 600;

function initialRange(): CalendarRange {
  const now = new Date();
  return {
    start: addDays(startOfMonth(now), -7),
    end: addDays(endOfMonth(now), 7),
  };
}

function newSourceId() {
  return Math.random().toString(36).slice(2, 12);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/**
 * Saves the sources list after a pause, one request at a time. Each save sends
 * the revision it was based on; a 409 means someone else saved first.
 */
function useSourceSaver(
  ref: { owner: string; slug: string },
  revision: React.RefObject<number>,
  onSaved: (calendar: CalendarDto) => void,
  onConflict: () => void
) {
  const pending = useRef<CalendarSource[] | null>(null);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const { owner, slug } = ref;

  const flush = useCallback(async () => {
    if (saving.current || !pending.current) return;
    const next = pending.current;
    pending.current = null;
    saving.current = true;
    try {
      const saved = await saveSources({ owner, slug }, next, revision.current);
      revision.current = saved.revision;
      onSaved(saved);
    } catch (error) {
      pending.current = null;
      notifications.show({ color: 'red', message: errorMessage(error) });
      onConflict();
    } finally {
      saving.current = false;
      // Edits made while this save was in flight are saved next.
      const queued = pending.current as CalendarSource[] | null;
      if (queued) {
        void flush();
      } else {
        setDirty(false);
      }
    }
  }, [owner, slug, revision, onSaved, onConflict]);

  const schedule = useCallback(
    (sources: CalendarSource[], delay: number) => {
      pending.current = sources;
      setDirty(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [flush]
  );

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return { schedule, dirty };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Stack align="center" justify="center" h="100vh" ta="center" p="md">
      {children}
    </Stack>
  );
}

export function CalendarApp() {
  const { owner = '', slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const embed = ['1', 'true'].includes(searchParams.get('embed') ?? '');
  const { session, me } = useSession();

  const [navbarOpened, { toggle, close }] = useDisclosure(false);
  const [settingsOpened, settings] = useDisclosure(false);
  const [range, setRange] = useState<CalendarRange>(initialRange);
  const { refresh, refreshKey } = useRefreshKey();

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [calendar, setCalendar] = useState<CalendarDto | null>(null);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const revision = useRef(0);
  // Visibility is per-viewer session state on purpose; it is never saved.
  const [hidden, setHidden] = useState<readonly boolean[]>([]);

  const reload = useCallback(async () => {
    try {
      const fresh = await getCalendar({ owner, slug });
      revision.current = fresh.revision;
      setCalendar(fresh);
      setSources(fresh.sources);
      setLoad({ status: 'ready' });
    } catch (error) {
      const status = errorStatus(error);
      setLoad(
        status === 404 || status === 401
          ? { status: 'notFound' }
          : { status: 'error', message: errorMessage(error) }
      );
    }
  }, [owner, slug]);

  useEffect(() => {
    if (!me) return;
    setLoad({ status: 'loading' });
    void reload();
  }, [me, reload]);

  // Saves of the sources keep the local list (it may have newer edits).
  const onSaved = useCallback((saved: CalendarDto) => setCalendar(saved), []);
  const onConflict = useCallback(() => void reload(), [reload]);
  const saver = useSourceSaver({ owner, slug }, revision, onSaved, onConflict);

  /** Settings changes (title, link, sharing) also bump the revision. */
  const onSettingsChange = useCallback((next: CalendarDto) => {
    revision.current = next.revision;
    setCalendar(next);
  }, []);

  const updateSources = (next: CalendarSource[], delay = 0) => {
    setSources(next);
    saver.schedule(next, delay);
  };

  const { events, statuses } = useIcalEvents(sources, range, refreshKey);
  const visibleEvents = useMemo(() => {
    if (!anyHidden(sources.length, hidden)) {
      return events;
    }
    const visibleIds = new Set(
      sources.filter((_, index) => !hidden[index]).map((source) => source.id)
    );
    return events.filter((event) => visibleIds.has(event.sourceId));
  }, [events, hidden, sources]);

  const toggleIndices = (indices: number[]): void => {
    setHidden((current) => {
      const flags = sources.map((_, index) => Boolean(current[index]));
      const shouldHide = indices.every((index) => !flags[index]);
      for (const index of indices) {
        flags[index] = shouldHide;
      }
      return flags;
    });
  };

  if (session.status === 'loading') {
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  }
  if (session.status === 'offline') {
    return (
      <Centered>
        <Title order={3}>Server unavailable</Title>
        <Text c="dimmed">
          The calendar server can't be reached right now. Try again later.
        </Text>
      </Centered>
    );
  }
  if (!me) {
    return (
      <Centered>
        <Title order={3}>Sign in to view this calendar</Title>
        <Text c="dimmed" maw={420}>
          Calendars are private to their owner and the people they share them
          with.
        </Text>
        <SignInButton size="md" />
      </Centered>
    );
  }
  if (load.status === 'loading') {
    return (
      <Centered>
        <Loader />
      </Centered>
    );
  }
  if (load.status !== 'ready' || !calendar) {
    return (
      <Centered>
        <Title order={3}>
          {load.status === 'error' ? 'Something went wrong' : 'Not found'}
        </Title>
        <Text c="dimmed" maw={420}>
          {load.status === 'error'
            ? load.message
            : `There's no calendar at ${owner}/${slug}, or it isn't shared with ${me.login}.`}
        </Text>
        <Anchor component={Link} to="/">
          Your calendars
        </Anchor>
      </Centered>
    );
  }

  return (
    <>
      <Helmet>
        <title>{calendar.title} - Shared Calendars</title>
      </Helmet>
      <AppShell
        header={{ height: embed ? 0 : 56 }}
        navbar={{
          width: 400,
          breakpoint: 'md',
          collapsed: { mobile: !navbarOpened, desktop: embed },
        }}
        padding={0}
      >
        {!embed && (
          <AppShell.Header>
            <Group h="100%" px="md" justify="space-between" wrap="nowrap">
              <Group wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
                <Burger
                  opened={navbarOpened}
                  onClick={toggle}
                  hiddenFrom="md"
                  size="sm"
                />
                <Tooltip label="Your calendars">
                  <ActionIcon
                    component={Link}
                    to="/"
                    variant="subtle"
                    aria-label="Your calendars"
                  >
                    <FiArrowLeft size="1.2em" />
                  </ActionIcon>
                </Tooltip>
                <Title
                  order={3}
                  m={0}
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {calendar.title}
                </Title>
                {!calendar.isOwner && (
                  <Text size="sm" c="dimmed" visibleFrom="sm">
                    by {calendar.owner}
                  </Text>
                )}
                {saver.dirty && (
                  <Text size="xs" c="dimmed">
                    Saving…
                  </Text>
                )}
              </Group>
              <Group gap="sm" wrap="nowrap">
                {calendar.isOwner && (
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<FiSettings />}
                    onClick={settings.open}
                  >
                    Share & settings
                  </Button>
                )}
                <ActionIcon
                  variant="subtle"
                  onClick={refresh}
                  aria-label="Refresh calendars"
                >
                  <IoRefresh size="1.2em" />
                </ActionIcon>
                <UserMenu />
              </Group>
            </Group>
          </AppShell.Header>
        )}

        {!embed && (
          <AppShell.Navbar p="md">
            <CalendarSidebar
              sources={sources}
              hidden={hidden}
              statuses={statuses}
              shareUrl={calendarUrl(calendar.owner, calendar.slug)}
              embedUrl={calendarUrl(calendar.owner, calendar.slug, true)}
              onAdd={(source) => {
                updateSources([
                  ...sources,
                  {
                    ...source,
                    id: newSourceId(),
                    color:
                      source.color ||
                      nextCalendarColor(sources.map((item) => item.color)),
                  },
                ]);
                close();
              }}
              onRemove={(id) => {
                const index = sources.findIndex((source) => source.id === id);
                if (index !== -1) {
                  setHidden((current) =>
                    current.filter((_, flagIndex) => flagIndex !== index)
                  );
                }
                updateSources(sources.filter((source) => source.id !== id));
              }}
              onToggleVisibility={(index) => {
                toggleIndices([index]);
              }}
              onUpdate={(id, patch) => {
                updateSources(
                  sources.map((source) =>
                    source.id === id ? { ...source, ...patch } : source
                  ),
                  TYPING_DELAY
                );
              }}
            />
          </AppShell.Navbar>
        )}

        <AppShell.Main>
          <Flex
            direction="column"
            h={embed ? '100vh' : 'calc(100vh - 56px)'}
            p="md"
          >
            {sources.length === 0 ? (
              <Box m="auto" ta="center" maw={480}>
                <Title order={2}>Add calendars to get started</Title>
                <Text c="dimmed">
                  Use the sidebar to paste public Google Calendar links for each
                  person. Changes are saved for everyone who has access.
                  {calendar.isOwner &&
                    ' Use "Share & settings" to let others see and edit it.'}
                </Text>
              </Box>
            ) : (
              <CalendarView
                events={visibleEvents}
                sources={sources}
                hidden={hidden}
                onRangeChange={setRange}
                onShowAll={() => setHidden([])}
                onToggleSources={toggleIndices}
              />
            )}
          </Flex>
        </AppShell.Main>
      </AppShell>
      {settingsOpened && (
        <CalendarSettingsModal
          calendar={calendar}
          opened
          onClose={settings.close}
          onChange={onSettingsChange}
        />
      )}
    </>
  );
}
