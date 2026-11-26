import type {
  CalendarDto,
  CalendarsFile,
  CalendarSummary,
  StoredCalendar,
  UserRef,
} from '@ical/shared';
import {
  LIMITS,
  calendarCreateSchema,
  calendarPatchSchema,
  sharesUpdateSchema,
  sourcesUpdateSchema,
} from '@ical/shared';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';

import { fetchUserByLogin } from '../auth/github';
import type { SessionTools } from '../auth/middleware';
import { LOCAL_TOKEN, devUserId } from '../auth/middleware';
import type { Session } from '../auth/sessions';
import type { Config } from '../config';
import { HttpError, json } from '../http';
import type { CalendarStore, Mutate } from './store';

type Access = 'owner' | 'shared';

function loginOf(file: CalendarsFile, id: number) {
  return file.users[String(id)] ?? `user-${String(id)}`;
}

function accessOf(calendar: StoredCalendar, session: Session): Access | null {
  if (calendar.ownerId === session.githubId) return 'owner';
  if (calendar.sharedWith.includes(session.githubId)) return 'shared';
  return null;
}

/** The calendar at /:owner/:slug, by the owner's current login. */
function findCalendar(file: CalendarsFile, owner: string, slug: string) {
  const ownerKey = owner.toLowerCase();
  const slugKey = slug.toLowerCase();
  return file.calendars.find(
    (calendar) =>
      calendar.slug === slugKey &&
      loginOf(file, calendar.ownerId).toLowerCase() === ownerKey
  );
}

/**
 * The calendar if the caller may see it. Calendars you can't see are a 404,
 * so their names aren't revealed.
 */
function requireCalendar(
  file: CalendarsFile,
  owner: string,
  slug: string,
  session: Session,
  need: Access
) {
  const calendar = findCalendar(file, owner, slug);
  const access = calendar ? accessOf(calendar, session) : null;
  if (!calendar || !access) throw new HttpError(404, 'Calendar not found');
  if (need === 'owner' && access !== 'owner') {
    throw new HttpError(403, 'Only the owner can do that');
  }
  return calendar;
}

function toDto(
  file: CalendarsFile,
  calendar: StoredCalendar,
  session: Session
): CalendarDto {
  return {
    owner: loginOf(file, calendar.ownerId),
    slug: calendar.slug,
    title: calendar.title,
    sources: calendar.sources,
    sharedWith: calendar.sharedWith.map(
      (id): UserRef => ({ id, login: loginOf(file, id) })
    ),
    revision: calendar.revision,
    isOwner: calendar.ownerId === session.githubId,
    updatedAt: calendar.updatedAt,
  };
}

function toSummary(
  file: CalendarsFile,
  calendar: StoredCalendar,
  session: Session
): CalendarSummary {
  return {
    owner: loginOf(file, calendar.ownerId),
    slug: calendar.slug,
    title: calendar.title,
    isOwner: calendar.ownerId === session.githubId,
    sourceCount: calendar.sources.length,
    updatedAt: calendar.updatedAt,
  };
}

function assertSlugFree(
  file: CalendarsFile,
  ownerId: number,
  slug: string,
  exceptId?: string
) {
  const taken = file.calendars.some(
    (c) => c.ownerId === ownerId && c.slug === slug && c.id !== exceptId
  );
  if (taken)
    throw new HttpError(409, `You already have a calendar at /${slug}`);
}

function touch(calendar: StoredCalendar) {
  calendar.revision += 1;
  calendar.updatedAt = new Date().toISOString();
}

export function calendarRoutes(deps: {
  config: Config;
  store: CalendarStore;
  mutate: Mutate;
  tools: SessionTools;
}) {
  const { config, store, mutate, tools } = deps;

  /** GitHub username → id. DEV_LOGIN users get the same fake ids as /auth/login. */
  const resolveLogin = async (session: Session, login: string) => {
    if (config.devLogin && session.accessToken === LOCAL_TOKEN) {
      return { id: devUserId(login), login };
    }
    const user = await fetchUserByLogin(session.accessToken, login);
    if (!user) throw new HttpError(400, `No GitHub user named "${login}"`);
    return { id: user.id, login: user.login };
  };

  return (
    new Hono()
      .use(tools.required)

      /** Calendars I own, and ones shared with me. */
      .get('/calendars', async (c) => {
        const session = c.get('session');
        const { file } = await store.read();
        const mine = file.calendars
          .filter((cal) => accessOf(cal, session))
          .map((cal) => toSummary(file, cal, session))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        c.header('Cache-Control', 'no-store');
        return c.json(mine);
      })

      .post('/calendars', json(calendarCreateSchema), async (c) => {
        const session = c.get('session');
        const input = c.req.valid('json');
        const { file, result } = await mutate((current) => {
          const owned = current.calendars.filter(
            (cal) => cal.ownerId === session.githubId
          );
          if (owned.length >= LIMITS.calendarsPerUser) {
            throw new HttpError(
              400,
              `You can have at most ${String(LIMITS.calendarsPerUser)} calendars`
            );
          }
          assertSlugFree(current, session.githubId, input.slug);
          const now = new Date().toISOString();
          const calendar: StoredCalendar = {
            id: nanoid(10),
            ownerId: session.githubId,
            slug: input.slug,
            title: input.title,
            sources: [],
            sharedWith: [],
            revision: 0,
            createdAt: now,
            updatedAt: now,
          };
          current.users[String(session.githubId)] = session.login;
          current.calendars.push(calendar);
          return {
            file: current,
            message: `Create ${session.login}/${calendar.slug}`,
            result: calendar,
          };
        });
        return c.json(toDto(file, result, session), 201);
      })

      .get('/calendars/:owner/:slug', async (c) => {
        const session = c.get('session');
        const { owner, slug } = c.req.param();
        const { file } = await store.read();
        const calendar = requireCalendar(file, owner, slug, session, 'shared');
        c.header('Cache-Control', 'no-store');
        return c.json(toDto(file, calendar, session));
      })

      /** Replaces the list of sources. 409 if someone saved in between. */
      .put(
        '/calendars/:owner/:slug/sources',
        json(sourcesUpdateSchema),
        async (c) => {
          const session = c.get('session');
          const { owner, slug } = c.req.param();
          const { sources, revision } = c.req.valid('json');
          const { file, result } = await mutate((current) => {
            const calendar = requireCalendar(
              current,
              owner,
              slug,
              session,
              'shared'
            );
            if (calendar.revision !== revision) {
              throw new HttpError(
                409,
                'Someone else changed this calendar. Reloaded their changes.'
              );
            }
            calendar.sources = sources;
            touch(calendar);
            return {
              file: current,
              message: `Edit sources of ${owner}/${calendar.slug} (by ${session.login})`,
              result: calendar,
            };
          });
          return c.json(toDto(file, result, session));
        }
      )

      .patch(
        '/calendars/:owner/:slug',
        json(calendarPatchSchema),
        async (c) => {
          const session = c.get('session');
          const { owner, slug } = c.req.param();
          const patch = c.req.valid('json');
          const { file, result } = await mutate((current) => {
            const calendar = requireCalendar(
              current,
              owner,
              slug,
              session,
              'owner'
            );
            if (patch.slug !== undefined && patch.slug !== calendar.slug) {
              assertSlugFree(
                current,
                calendar.ownerId,
                patch.slug,
                calendar.id
              );
              calendar.slug = patch.slug;
            }
            if (patch.title !== undefined) calendar.title = patch.title;
            touch(calendar);
            return {
              file: current,
              message: `Rename ${owner}/${slug} → ${calendar.slug}`,
              result: calendar,
            };
          });
          return c.json(toDto(file, result, session));
        }
      )

      .delete('/calendars/:owner/:slug', async (c) => {
        const session = c.get('session');
        const { owner, slug } = c.req.param();
        await mutate((current) => {
          const calendar = requireCalendar(
            current,
            owner,
            slug,
            session,
            'owner'
          );
          current.calendars = current.calendars.filter(
            (cal) => cal.id !== calendar.id
          );
          return {
            file: current,
            message: `Delete ${owner}/${calendar.slug}`,
            result: null,
          };
        });
        return c.body(null, 204);
      })

      /** Sets who the calendar is shared with, by GitHub username. */
      .put(
        '/calendars/:owner/:slug/shares',
        json(sharesUpdateSchema),
        async (c) => {
          const session = c.get('session');
          const { owner, slug } = c.req.param();
          const { logins } = c.req.valid('json');

          // Check ownership before asking GitHub about anyone.
          requireCalendar(
            (await store.read()).file,
            owner,
            slug,
            session,
            'owner'
          );
          const unique = [
            ...new Map(logins.map((l) => [l.toLowerCase(), l])).values(),
          ];
          const users = await Promise.all(
            unique.map(async (login) => resolveLogin(session, login))
          );

          const { file, result } = await mutate((current) => {
            const calendar = requireCalendar(
              current,
              owner,
              slug,
              session,
              'owner'
            );
            for (const user of users) {
              current.users[String(user.id)] = user.login;
            }
            calendar.sharedWith = users
              .map((user) => user.id)
              .filter((id) => id !== calendar.ownerId);
            touch(calendar);
            return {
              file: current,
              message: `Share ${owner}/${calendar.slug} with ${users.map((u) => u.login).join(', ') || 'nobody'}`,
              result: calendar,
            };
          });
          return c.json(toDto(file, result, session));
        }
      )
  );
}
