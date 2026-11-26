import type { CalendarSummary } from '@ical/shared';
import { slugify, slugSchema } from '@ical/shared';
import {
  Alert,
  Anchor,
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { FiPlus } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router';

import { createCalendar, listCalendars } from '@api/calendars';
import { errorMessage } from '@api/client';
import { useSession } from '@global/session';

import { SignInButton, UserMenu } from './UserMenu';

/** Old links kept everything in the URL (#/?cals=...); that format is gone. */
const isLegacyLink = window.location.hash.includes('cals=');

function NewCalendarModal({
  opened,
  onClose,
  owner,
}: {
  opened: boolean;
  onClose: () => void;
  owner: string;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveSlug = slugEdited ? slug : slugify(title);
  const slugCheck = slugSchema.safeParse(effectiveSlug);
  const slugError =
    effectiveSlug && !slugCheck.success
      ? slugCheck.error.issues[0]?.message
      : undefined;

  const submit = async () => {
    if (!title.trim() || !slugCheck.success) return;
    setSaving(true);
    setError(null);
    try {
      const calendar = await createCalendar({
        title: title.trim(),
        slug: slugCheck.data,
      });
      onClose();
      void navigate(`/${calendar.owner}/${calendar.slug}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New calendar" centered>
      <Stack gap="sm">
        <TextInput
          label="Title"
          placeholder="Family"
          value={title}
          data-autofocus
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <TextInput
          label="Link"
          description={`${window.location.host}${import.meta.env.BASE_URL}${owner}/${effectiveSlug || '…'}`}
          value={effectiveSlug}
          error={slugError}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={saving}
            disabled={!title.trim() || !slugCheck.success}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CalendarList({
  title,
  calendars,
}: {
  title: string;
  calendars: CalendarSummary[];
}) {
  if (calendars.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={4}>{title}</Title>
      {calendars.map((cal) => (
        <Card
          key={`${cal.owner}/${cal.slug}`}
          component={Link}
          to={`/${cal.owner}/${cal.slug}`}
          withBorder
          padding="sm"
        >
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={0}>
              <Text fw={600}>{cal.title}</Text>
              <Text size="xs" c="dimmed">
                {cal.owner}/{cal.slug}
              </Text>
            </Stack>
            <Badge variant="light" color="gray">
              {cal.sourceCount} {cal.sourceCount === 1 ? 'feed' : 'feeds'}
            </Badge>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

export function HomePage() {
  const { session, me } = useSession();
  const [calendars, setCalendars] = useState<CalendarSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, { open, close }] = useDisclosure(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    listCalendars().then(
      (list) => {
        if (!cancelled) setCalendars(list);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [me]);

  let body;
  if (session.status === 'loading') {
    body = <Loader m="auto" />;
  } else if (session.status === 'offline') {
    body = (
      <Alert color="gray" title="Server unavailable">
        The calendar server can't be reached right now. Try again later.
      </Alert>
    );
  } else if (!me) {
    body = (
      <Stack align="center" ta="center" gap="md" mt="xl">
        <Title order={2}>Share calendars with your people</Title>
        <Text c="dimmed" maw={480}>
          Put several public Google Calendars in one color-coded view, save it
          under a short link, and share it with friends by GitHub username so
          they can view and edit it too.
        </Text>
        <SignInButton size="md" />
      </Stack>
    );
  } else {
    const mine = calendars?.filter((cal) => cal.isOwner) ?? [];
    const shared = calendars?.filter((cal) => !cal.isOwner) ?? [];
    body = (
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Your calendars</Title>
          <Button leftSection={<FiPlus />} onClick={open}>
            New calendar
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        {calendars === null && !error && <Loader />}
        {calendars?.length === 0 && (
          <Text c="dimmed">
            No calendars yet. Create one, or ask a friend to share theirs with{' '}
            <b>{me.login}</b>.
          </Text>
        )}
        <CalendarList title="Mine" calendars={mine} />
        <CalendarList title="Shared with me" calendars={shared} />
        <NewCalendarModal opened={creating} onClose={close} owner={me.login} />
      </Stack>
    );
  }

  return (
    <>
      <Helmet>
        <title>Shared Calendars</title>
      </Helmet>
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Anchor component={Link} to="/" c="inherit" underline="never">
              <Title order={3} m={0}>
                Shared Calendars
              </Title>
            </Anchor>
            <UserMenu />
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Container size="sm" py="md">
            <Stack gap="lg">
              {isLegacyLink && (
                <Alert color="yellow" title="This link format is gone">
                  Calendars are now saved on the server instead of in the link.
                  Sign in and create a calendar to set it up again.
                </Alert>
              )}
              {body}
            </Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </>
  );
}
