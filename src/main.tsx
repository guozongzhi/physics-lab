import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './design-system/styles/immersive.css'
import './design-system/styles/unified.css'
import './design-system/styles/workspace.css'
import './design-system/styles/student.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
