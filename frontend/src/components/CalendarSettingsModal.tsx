import type { CalendarDto } from '@ical/shared';
import { LIMITS, loginSchema, slugSchema } from '@ical/shared';
import {
  ActionIcon,
  Avatar,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { FiTrash2, FiUserPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router';

import { deleteCalendar, setShares, updateCalendar } from '@api/calendars';
import { errorMessage } from '@api/client';

type Props = {
  calendar: CalendarDto;
  opened: boolean;
  onClose: () => void;
  onChange: (calendar: CalendarDto) => void;
};

function avatarUrl(login: string) {
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`;
}

function ShareList({ calendar, onChange }: Omit<Props, 'opened' | 'onClose'>) {
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = { owner: calendar.owner, slug: calendar.slug };
  const current = calendar.sharedWith.map((user) => user.login);

  const save = async (logins: string[]) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await setShares(ref, logins));
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const parsed = loginSchema.safeParse(login);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Not a valid username');
      return;
    }
    if (await save([...current, parsed.data])) setLogin('');
  };

  return (
    <Stack gap="xs">
      <Title order={5}>Shared with</Title>
      <Text size="xs" c="dimmed">
        People you add can view this calendar and add, remove and recolor its
        feeds after signing in with GitHub.
      </Text>
      {calendar.sharedWith.length === 0 && (
        <Text size="sm" c="dimmed">
          Only you.
        </Text>
      )}
      {calendar.sharedWith.map((user) => (
        <Group key={user.id} justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Avatar src={avatarUrl(user.login)} size="sm" radius="xl" />
            <Text size="sm">{user.login}</Text>
          </Group>
          <ActionIcon
            color="red"
            variant="subtle"
            disabled={busy}
            aria-label={`Stop sharing with ${user.login}`}
            onClick={() =>
              void save(current.filter((name) => name !== user.login))
            }
          >
            <FiTrash2 />
          </ActionIcon>
        </Group>
      ))}
      {calendar.sharedWith.length < LIMITS.sharesPerCalendar && (
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <TextInput
            placeholder="GitHub username"
            value={login}
            error={error}
            style={{ flex: 1 }}
            onChange={(event) => setLogin(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add();
            }}
          />
          <Button
            leftSection={<FiUserPlus />}
            loading={busy}
            disabled={!login.trim()}
            onClick={() => void add()}
          >
            Share
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export function CalendarSettingsModal({
  calendar,
  opened,
  onClose,
  onChange,
}: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(calendar.title);
  const [slug, setSlug] = useState(calendar.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = { owner: calendar.owner, slug: calendar.slug };

  const slugCheck = slugSchema.safeParse(slug);
  const changed =
    title.trim() !== calendar.title ||
    (slugCheck.success && slugCheck.data !== calendar.slug);

  const saveDetails = async () => {
    if (!slugCheck.success || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateCalendar(ref, {
        title: title.trim(),
        slug: slugCheck.data,
      });
      onChange(next);
      if (next.slug !== calendar.slug) {
        void navigate(`/${next.owner}/${next.slug}`, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCalendar(ref);
      notifications.show({ message: `Deleted "${calendar.title}"` });
      void navigate('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Calendar settings" centered>
      <Stack gap="md">
        <Stack gap="xs">
          <TextInput
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <TextInput
            label="Link"
            description={`…/${calendar.owner}/${slug}`}
            value={slug}
            error={
              slug && !slugCheck.success
                ? slugCheck.error.issues[0]?.message
                : undefined
            }
            onChange={(event) => setSlug(event.currentTarget.value)}
          />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              onClick={() => void saveDetails()}
              disabled={!changed || !slugCheck.success || !title.trim()}
              loading={busy}
            >
              Save
            </Button>
          </Group>
        </Stack>

        <Divider />
        <ShareList calendar={calendar} onChange={onChange} />

        <Divider />
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Deleting can't be undone.
          </Text>
          {confirmDelete ? (
            <Group gap="xs">
              <Button variant="subtle" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button color="red" loading={busy} onClick={() => void remove()}>
                Delete for everyone
              </Button>
            </Group>
          ) : (
            <Button
              color="red"
              variant="light"
              onClick={() => setConfirmDelete(true)}
            >
              Delete calendar
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
