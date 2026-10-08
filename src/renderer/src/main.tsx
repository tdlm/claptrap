import '@fontsource/bangers'
import './styles.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { installMockApi } from './mock'

installMockApi()

const { Permissions } = await import('./pages/Permissions')
const { SettingsPage } = await import('./pages/Settings')

function useRoute(): string {
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, ''))
  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#\/?/, ''))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

function App() {
  const route = useRoute()
  return (
    <>
      <div className="titlebar" />
      {route === 'permissions' ? <Permissions /> : <SettingsPage />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
