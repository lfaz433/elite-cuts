import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import './styles/index.css'
import './styles/tailwind.css'
import './styles/theme.css'

const databaseFreePreviewPaths = new Set([
  '/freelancer-preview',
  '/client-preview',
  '/brand-preview',
  '/book/amine-fade-studio',
]);

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function bootstrap() {
  if (databaseFreePreviewPaths.has(window.location.pathname)) {
    const { default: PreviewApp } = await import('./app/PreviewApp');
    root.render(<React.StrictMode><PreviewApp /></React.StrictMode>);
    return;
  }

  const [{ default: App }, { TenantProvider }] = await Promise.all([
    import('./app/App'),
    import('./app/components/context/TenantContext'),
  ]);
  root.render(<React.StrictMode><TenantProvider><App /></TenantProvider></React.StrictMode>);
}

void bootstrap();
