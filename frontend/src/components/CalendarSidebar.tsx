import {
  ActionIcon,
  Button,
  ColorInput,
  CopyButton,
  Flex,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FiEye, FiEyeOff, FiPlus, FiTrash2 } from 'react-icons/fi';
import { IoCopyOutline } from 'react-icons/io5';
import { MdCheck } from 'react-icons/md';

import { CALENDAR_COLORS } from '../calendar/colors';
import type { CalendarSource, FeedStatus } from '../calendar/types';
import { AddCalendarModal } from './AddCalendarModal';

type CalendarSidebarProps = {
  embedUrl: string;
  hidden: readonly boolean[];
  onAdd: (source: Omit<CalendarSource, 'id'>) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (index: number) => void;
  onUpdate: (id: string, patch: Partial<Omit<CalendarSource, 'id'>>) => void;
  shareUrl: string;
  sources: CalendarSource[];
  statuses: Record<string, FeedStatus | undefined>;
};

export function CalendarSidebar({
  embedUrl,
  hidden,
  onAdd,
  onRemove,
  onToggleVisibility,
  onUpdate,
  shareUrl,
  sources,
  statuses,
}: CalendarSidebarProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Stack gap="md" h="100%">
      <Flex gap={6} justify="space-between">
        <CopyButton value={shareUrl}>
          {({ copied, copy }) => (
            <Button
              variant="light"
              onClick={copy}
              leftSection={copied ? <MdCheck /> : <IoCopyOutline />}
            >
              {copied ? 'Copied' : 'Share link'}
            </Button>
          )}
        </CopyButton>
        <CopyButton value={embedUrl}>
          {({ copied, copy }) => (
            <Button
              variant="subtle"
              onClick={copy}
              leftSection={copied ? <MdCheck /> : <IoCopyOutline />}
            >
              {copied ? 'Copied' : 'Display link'}
            </Button>
          )}
        </CopyButton>
      </Flex>

      <Stack gap="sm" style={{ flex: 1, overflow: 'auto' }}>
        {sources.length === 0 ? (
          <Text size="sm" c="dimmed">
            No calendars yet. Paste a public Google Calendar URL below.
          </Text>
        ) : (
          sources.map((source, index) => {
            const status = statuses[source.id];
            const isHidden = hidden[index];
            const label = source.name.trim() || 'calendar';
            return (
              <Stack key={source.id} gap={4}>
                <Group
                  justify="space-between"
                  wrap="nowrap"
                  align="flex-start"
                  gap={6}
                >
                  <TextInput
                    value={source.name}
                    aria-label={`Name for ${label}`}
                    onChange={(event) => {
                      onUpdate(source.id, { name: event.currentTarget.value });
                    }}
                    style={{ flex: 1, opacity: isHidden ? 0.45 : 1 }}
                  />
                  <ColorInput
                    value={source.color}
                    aria-label={`Color for ${label}`}
                    styles={{
                      input: {
                        color: 'transparent', // Hides the text characters
                        textSelectionColor: 'transparent',
                      },
                    }}
                    onChange={(value) => {
                      onUpdate(source.id, { color: value });
                    }}
                    swatches={CALENDAR_COLORS}
                    swatchesPerRow={5}
                    w={74}
                    style={{ opacity: isHidden ? 0.45 : 1, flexShrink: 0 }}
                  />
                  <Tooltip label={isHidden ? 'Show calendar' : 'Hide calendar'}>
                    <ActionIcon
                      type="button"
                      variant={isHidden ? 'light' : 'subtle'}
                      color={isHidden ? 'gray' : 'blue'}
                      aria-pressed={!isHidden}
                      aria-label={isHidden ? `Show ${label}` : `Hide ${label}`}
                      onClick={() => {
                        onToggleVisibility(index);
                      }}
                    >
                      {isHidden ? <FiEyeOff /> : <FiEye />}
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Remove">
                    <ActionIcon
                      type="button"
                      color="red"
                      variant="subtle"
                      aria-label={`Remove ${label}`}
                      onClick={() => {
                        onRemove(source.id);
                      }}
                    >
                      <FiTrash2 />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                {status?.loading ? (
                  <Text size="xs" c="dimmed">
                    Loading events…
                  </Text>
                ) : null}
                {status?.error ? (
                  <Text size="xs" c="red">
                    {status.error}
                  </Text>
                ) : null}
              </Stack>
            );
          })
        )}
      </Stack>
      <Button leftSection={<FiPlus />} onClick={open} fullWidth>
        Add calendar
      </Button>

      <AddCalendarModal
        opened={opened}
        onClose={close}
        onAdd={onAdd}
        sources={sources}
      />
    </Stack>
  );
}
