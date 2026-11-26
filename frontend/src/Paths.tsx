import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { CalendarApp } from './components/CalendarApp';
import { HomePage } from './components/HomePage';
import './main.css';
import NotFoundPage from '@components/NotFoundPage';

export type PathList = {
  path: string;
  element: ReactNode;
  children?: PathList[];
};

export const paths: PathList[] = [
  { path: '/', element: <HomePage /> },
  { path: '/404', element: <NotFoundPage /> },
  // e.g. /ical-display/owenmoogk/family
  { path: '/:owner/:slug', element: <CalendarApp /> },
  { path: '*', element: <Navigate to="/404" /> },
];
