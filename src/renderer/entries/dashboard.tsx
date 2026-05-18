import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Dashboard } from '../views/Dashboard';
import { ErrorBoundary } from '../components/ErrorBoundary';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary surface="dashboard">
    <Dashboard />
  </ErrorBoundary>,
);
