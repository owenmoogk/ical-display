import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter as Router } from 'react-router-dom';

import App from './App';
import { mantineCssVariableResolver } from './cssVariableResolver';
import { SessionProvider } from './global/session';
import './main.css';
import { mantineTheme } from './theme';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <MantineProvider
        defaultColorScheme="light"
        theme={mantineTheme}
        cssVariablesResolver={mantineCssVariableResolver}
      >
        <Notifications position="bottom-right" />
        <HelmetProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </HelmetProvider>
      </MantineProvider>
    </Router>
  </StrictMode>
);
