import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Overlay } from '../views/Overlay';
import { ErrorBoundary } from '../components/ErrorBoundary';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary surface="overlay">
    <Overlay />
  </ErrorBoundary>,
);
