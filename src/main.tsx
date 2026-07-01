import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installMobileApiIfNeeded } from './mobile/mobileApi'

async function bootstrap() {
  await installMobileApiIfNeeded()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
