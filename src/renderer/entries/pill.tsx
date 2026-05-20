import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Pill } from '../views/Pill';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ThemeProvider } from '../components/ThemeProvider';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary surface="pill">
    <ThemeProvider>
      <Pill />
    </ThemeProvider>
  </ErrorBoundary>,
);
