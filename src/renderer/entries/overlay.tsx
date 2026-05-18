import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import { Overlay } from '../views/Overlay';

const root = createRoot(document.getElementById('root')!);
root.render(<Overlay />);
