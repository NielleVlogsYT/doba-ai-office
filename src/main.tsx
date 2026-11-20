import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './styles.css'

// No StrictMode here: its development double-mount disposes the react-three-fiber
// canvas root and the remount reuses the dead root, so the 3D floor never configures
// (the canvas freezes at 300x150 with no scene). The app renders identically without it.
createRoot(document.getElementById('root')!).render(<App />)
