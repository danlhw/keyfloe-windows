import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Pill } from '../views/Pill';

const root = createRoot(document.getElementById('root')!);
root.render(<Pill />);
