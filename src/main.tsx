import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import appConfig from '../apps/mobile/app.json';

declare global {
  interface Window {
    MoroboothBundleVersion?: string;
  }
}

const bundleVersion =
  (appConfig as any)?.expo?.extra?.bundleVersion ?? (appConfig as any)?.expo?.version ?? 'dev';

if (typeof window !== 'undefined') {
  window.MoroboothBundleVersion = bundleVersion;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
