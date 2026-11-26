import type { CalendarSource } from './types';

const TRAILING_QUALIFIER = /\s*\([^)]*\)\s*$/u;

export type LegendGroup = {
  colors: string[];
  indices: number[];
  label: string;
  names: string[];
};

export type VisibilityState = 'mixed' | 'off' | 'on';

/**
 * Person label used to collapse a legend chip.
 * "Owen (School)" and "Owen (Personal)" share "Owen"; exact names stay as-is.
 */
function personKey(name: string): string {
  let base = name.trim();
  if (!base) {
    return '';
  }

  let next = base.replace(TRAILING_QUALIFIER, '').trim();
  while (next.length > 0 && next !== base) {
    base = next;
    next = base.replace(TRAILING_QUALIFIER, '').trim();
  }

  return base;
}

export function buildLegendGroups(sources: CalendarSource[]): LegendGroup[] {
  const groups: LegendGroup[] = [];
  const byKey = new Map<string, LegendGroup>();

  for (const [index, source] of sources.entries()) {
    const name = source.name.trim() || source.url;
    const key = personKey(name) || name;
    const existing = byKey.get(key);

    if (!existing) {
      const group: LegendGroup = {
        colors: [source.color],
        indices: [index],
        label: name,
        names: [name],
      };
      byKey.set(key, group);
      groups.push(group);
      continue;
    }

    existing.indices.push(index);
    if (!existing.names.includes(name)) {
      existing.names.push(name);
    }
    if (!existing.colors.includes(source.color)) {
      existing.colors.push(source.color);
    }
  }

  return groups.map((group) => {
    if (group.names.length < 2) {
      return group;
    }

    const key = personKey(group.names[0] ?? group.label);
    return {
      ...group,
      label: key || group.label,
    };
  });
}

export function visibilityState(
  indices: readonly number[],
  hidden: readonly boolean[]
): VisibilityState {
  let hiddenCount = 0;
  for (const index of indices) {
    if (hidden[index]) {
      hiddenCount += 1;
    }
  }

  if (hiddenCount === 0) {
    return 'on';
  }
  if (hiddenCount === indices.length) {
    return 'off';
  }
  return 'mixed';
}

export function legendTooltip(group: LegendGroup): string | null {
  if (group.names.length > 1) {
    return group.names.join(', ');
  }
  if (group.indices.length > 1) {
    return `${String(group.indices.length)} calendars`;
  }
  return null;
}

export function legendAriaLabel(group: LegendGroup): string {
  if (group.names.length > 1) {
    return `${group.label}: ${group.names.join(', ')}`;
  }
  if (group.indices.length > 1) {
    return `${group.label}, ${String(group.indices.length)} calendars`;
  }
  return group.label;
}

export function anyHidden(
  sourcesLength: number,
  hidden: readonly boolean[]
): boolean {
  for (let index = 0; index < sourcesLength; index += 1) {
    if (hidden[index]) {
      return true;
    }
  }
  return false;
}
