import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: it double-invokes effects in dev, which creates two
// overlapping epub.js renditions in the same container (broken pagination,
// theme/font controls acting on the wrong instance).
createRoot(document.getElementById('root')!).render(<App />)
