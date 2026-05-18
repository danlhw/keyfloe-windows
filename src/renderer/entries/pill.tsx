import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Pill } from '../views/Pill';
import { ErrorBoundary } from '../components/ErrorBoundary';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary surface="pill">
    <Pill />
  </ErrorBoundary>,
);
