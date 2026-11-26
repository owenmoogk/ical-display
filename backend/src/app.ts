import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';

import type { SessionTools } from './auth/middleware';
import { authRoutes } from './auth/routes';
import type { SessionStore } from './auth/sessions';
import { calendarRoutes } from './calendars/routes';
import type { CalendarStore } from './calendars/store';
import { createMutator } from './calendars/store';
import type { Config } from './config';
import { APP_VERSION } from './config';
import { HttpError, errorHandler } from './http';

export function createApp(deps: {
  config: Config;
  sessions: SessionStore;
  tools: SessionTools;
  store: CalendarStore;
}) {
  const { config, sessions, tools, store } = deps;
  const mutate = createMutator(store);

  /** Keeps the user's current GitHub login, so /owner/slug links follow renames. */
  const onSignIn = async (githubId: number, login: string) => {
    const { file } = await store.read();
    if (file.users[String(githubId)] === login) return;
    await mutate((current) => {
      current.users[String(githubId)] = login;
      return { file: current, message: `User ${login}`, result: null };
    });
  };

  return (
    new Hono()
      .get('/healthz', (c) => c.json({ ok: true, version: APP_VERSION }))
      // The frontend (owenmoogk.com) and API (ical.) are different origins,
      // and requests carry the session cookie, so the origin must be named.
      .use(cors({ origin: config.frontendOrigin, credentials: true }))
      // Rejects form posts from other sites (they'd carry the cookie too).
      .use(csrf({ origin: config.frontendOrigin }))
      .use(
        bodyLimit({
          maxSize: 64 * 1024,
          onError: () => {
            throw new HttpError(413, 'Request too large');
          },
        })
      )
      .route('/auth', authRoutes(config, sessions, tools, onSignIn))
      .route('/api', calendarRoutes({ config, store, mutate, tools }))
      .notFound((c) => c.json({ error: 'Not found' }, 404))
      .onError(errorHandler)
  );
}

/** The full API's type, for a typed client (`hc<AppType>` from 'hono/client'). */
export type AppType = ReturnType<typeof createApp>;
