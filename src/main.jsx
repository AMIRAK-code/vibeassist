import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// First, so an expired email link is noticed before the Supabase client reads the URL
import './lib/authErrors'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
