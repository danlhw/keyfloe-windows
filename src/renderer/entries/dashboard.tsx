import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Dashboard } from '../views/Dashboard';

const root = createRoot(document.getElementById('root')!);
root.render(<Dashboard />);
