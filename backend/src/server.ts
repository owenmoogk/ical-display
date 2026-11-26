import { serve } from '@hono/node-server';
import { join } from 'node:path';

import { createApp } from './app';
import { createSessionTools } from './auth/middleware';
import { SessionStore } from './auth/sessions';
import { localStore } from './calendars/store';
import { APP_VERSION, loadConfig } from './config';

const config = loadConfig();
const sessions = await SessionStore.open(
  join(config.dataDir, 'sessions.enc'),
  config.sessionKey
);
const tools = createSessionTools(config, sessions);

// calendars.json on this server is the only copy; the data dir is backed up to
// the NAS nightly (homelab repo). It starts empty if the file is missing.
const store = localStore(config.calendarsFile);

const app = createApp({ config, sessions, tools, store });

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.host },
  () => {
    console.log(
      `ical-display backend ${APP_VERSION} on http://${config.host}:${String(config.port)} ` +
        `(file ${config.calendarsFile})`
    );
  }
);

const shutdown = () => {
  server.close();
  void sessions.flush().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
