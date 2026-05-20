import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Notch } from '../views/Notch';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ThemeProvider } from '../components/ThemeProvider';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary surface="notch">
    <ThemeProvider>
      <Notch />
    </ThemeProvider>
  </ErrorBoundary>,
);
