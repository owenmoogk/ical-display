import { z } from 'zod';

/** Limits, since anyone with a GitHub account can sign in. */
export const LIMITS = {
  calendarsPerUser: 25,
  sourcesPerCalendar: 50,
  sharesPerCalendar: 25,
  urlLength: 2048,
  nameLength: 100,
} as const;

/** URL-safe calendar name: lowercase letters, digits and single dashes. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Name is required')
  .max(48, 'At most 48 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use letters, numbers and dashes (e.g. family-calendar)'
  );

/** GitHub logins: alphanumerics and single dashes, up to 39 characters. */
export const loginSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, {
    message: 'Not a valid GitHub username',
  });

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Color must be a hex color');

export const sourceSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().max(LIMITS.nameLength),
  url: z.string().trim().min(1).max(LIMITS.urlLength),
  color: colorSchema,
});
export type CalendarSource = z.infer<typeof sourceSchema>;

export const storedCalendarSchema = z.object({
  id: z.string(),
  /** GitHub user id of the owner (ids survive username changes). */
  ownerId: z.number().int(),
  slug: slugSchema,
  title: z.string().max(LIMITS.nameLength),
  sources: z.array(sourceSchema).max(LIMITS.sourcesPerCalendar),
  /** GitHub user ids that can view and edit the sources. */
  sharedWith: z.array(z.number().int()).max(LIMITS.sharesPerCalendar),
  /** Bumped on every save; edits send it back to catch concurrent changes. */
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoredCalendar = z.infer<typeof storedCalendarSchema>;

export const calendarsFileSchema = z.object({
  version: z.literal(1),
  /** GitHub user id (as a string key) → current login, updated at each sign-in. */
  users: z.record(z.string(), z.string()),
  calendars: z.array(storedCalendarSchema),
});
export type CalendarsFile = z.infer<typeof calendarsFileSchema>;

export function emptyCalendarsFile(): CalendarsFile {
  return { version: 1, users: {}, calendars: [] };
}

/* ---------- API shapes ---------- */

export type UserRef = { id: number; login: string };

/** A calendar as the API returns it. */
export type CalendarDto = {
  owner: string;
  slug: string;
  title: string;
  sources: CalendarSource[];
  sharedWith: UserRef[];
  revision: number;
  isOwner: boolean;
  updatedAt: string;
};

/** One row in "my calendars" / "shared with me". */
export type CalendarSummary = {
  owner: string;
  slug: string;
  title: string;
  isOwner: boolean;
  sourceCount: number;
  updatedAt: string;
};

export type Me = {
  id: number;
  login: string;
  name?: string;
  avatarUrl: string;
};

export const calendarCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(LIMITS.nameLength),
});

export const calendarPatchSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(LIMITS.nameLength).optional(),
});

export const sourcesUpdateSchema = z.object({
  sources: z.array(sourceSchema).max(LIMITS.sourcesPerCalendar),
  revision: z.number().int().nonnegative(),
});

export const sharesUpdateSchema = z.object({
  logins: z.array(loginSchema).max(LIMITS.sharesPerCalendar),
});

/** Suggests a slug for a title: "Owen's Family" → "owens-family". */
export function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}
