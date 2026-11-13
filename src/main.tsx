import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { InterruptionProvider } from './context/InterruptionContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <InterruptionProvider>
          <App />
        </InterruptionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
