import {
  Box,
  Button,
  Modal,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { addDays, format, getDay, parse, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { useMemo, useState } from 'react';
import type { View } from 'react-big-calendar';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '@mantine/core/styles.css';

import { getReadableTextColor } from '../calendar/colors';
import type {
  CalendarEvent,
  CalendarRange,
  CalendarSource,
} from '../calendar/types';
import type { VisibilityState } from '../calendar/visibility';
import {
  anyHidden,
  buildLegendGroups,
  legendAriaLabel,
  legendTooltip,
  visibilityState,
} from '../calendar/visibility';

import classes from './CalendarView.module.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

function rangeFromValue(
  value: Date[] | { end: Date; start: Date }
): CalendarRange {
  if (Array.isArray(value)) {
    const start = value[0] ?? new Date();
    const end = addDays(value[value.length - 1] ?? start, 1);
    return { start, end };
  }
  return { start: value.start, end: value.end };
}

function ariaPressed(state: VisibilityState): boolean | 'mixed' {
  if (state === 'on') {
    return true;
  }
  if (state === 'off') {
    return false;
  }
  return 'mixed';
}

type CalendarViewProps = {
  events: CalendarEvent[];
  hidden: readonly boolean[];
  onRangeChange: (range: CalendarRange) => void;
  onShowAll: () => void;
  onToggleSources: (indices: number[]) => void;
  sources: CalendarSource[];
};

export function CalendarView({
  events,
  hidden,
  onRangeChange,
  onShowAll,
  onToggleSources,
  sources,
}: CalendarViewProps) {
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const groups = useMemo(() => buildLegendGroups(sources), [sources]);
  const showAll = anyHidden(sources.length, hidden);

  const eventPropGetter = useMemo(
    () => (event: CalendarEvent) => ({
      style: {
        backgroundColor: event.color,
        borderColor: event.color,
        color: getReadableTextColor(event.color),
      },
    }),
    []
  );

  return (
    <Box className={classes.wrapper}>
      <Box className={classes.calendar}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onRangeChange={(value) => {
            onRangeChange(rangeFromValue(value));
          }}
          onSelectEvent={setSelected}
          eventPropGetter={eventPropGetter}
          popup
          dayLayoutAlgorithm="no-overlap"
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          allDayAccessor="allDay"
          views={['month', 'week', 'day', 'agenda']}
        />
      </Box>
      {sources.length > 0 && (
        <Box
          className={classes.legend}
          role="group"
          aria-label="Show or hide calendars"
        >
          {groups.map((group) => {
            const state = visibilityState(group.indices, hidden);
            const tooltip = legendTooltip(group);
            return (
              <Tooltip
                key={group.indices.join('-')}
                label={tooltip ?? group.label}
                disabled={tooltip === null}
                openDelay={300}
              >
                <UnstyledButton
                  type="button"
                  className={classes.legendItem}
                  data-state={state}
                  aria-pressed={ariaPressed(state)}
                  aria-label={legendAriaLabel(group)}
                  onClick={() => {
                    onToggleSources(group.indices);
                  }}
                >
                  <span className={classes.swatches}>
                    {group.colors.map((color) => (
                      <span
                        key={color}
                        className={classes.swatch}
                        style={
                          state === 'off'
                            ? {
                                backgroundColor: 'transparent',
                                boxShadow: `inset 0 0 0 1.5px ${color}`,
                              }
                            : { backgroundColor: color }
                        }
                      />
                    ))}
                  </span>
                  <Text
                    component="span"
                    size="sm"
                    td={state === 'off' ? 'line-through' : undefined}
                    c={state === 'on' ? undefined : 'dimmed'}
                  >
                    {group.label}
                  </Text>
                </UnstyledButton>
              </Tooltip>
            );
          })}
          {showAll ? (
            <Button
              type="button"
              variant="subtle"
              size="compact-xs"
              color="gray"
              onClick={onShowAll}
            >
              Show all
            </Button>
          ) : null}
        </Box>
      )}
      <Modal
        opened={selected !== null}
        onClose={() => {
          setSelected(null);
        }}
        title={selected?.title}
      >
        {selected && (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              {selected.calendarName}
            </Text>
            <Text size="sm">
              {selected.allDay
                ? format(selected.start, 'PP')
                : `${format(selected.start, 'PPp')} – ${format(selected.end, 'PPp')}`}
            </Text>
            {selected.location ? (
              <Text size="sm" mt="xs">
                {selected.location}
              </Text>
            ) : null}
            {selected.description ? (
              <Text size="sm" mt="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {selected.description}
              </Text>
            ) : null}
          </>
        )}
      </Modal>
    </Box>
  );
}
