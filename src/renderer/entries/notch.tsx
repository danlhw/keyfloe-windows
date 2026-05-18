import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Notch } from '../views/Notch';

const root = createRoot(document.getElementById('root')!);
root.render(<Notch />);
