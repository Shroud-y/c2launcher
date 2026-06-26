import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredThemeId } from './theme'
import './styles/global.css'

// Paint the saved color scheme before first render (no flash of default).
applyTheme(getStoredThemeId())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
