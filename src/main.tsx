import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { TenantProvider } from './app/components/context/TenantContext'
import './styles/globals.css'
import './styles/index.css'
import './styles/tailwind.css'
import './styles/theme.css'
import { Toaster } from 'sonner'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TenantProvider>
      <App />
    </TenantProvider>
  </React.StrictMode>,
)
