import { createRoot } from 'react-dom/client'
import './styles/core/variables.css'
import './styles/core/reset.css'
import './styles/components/buttons.css'
import './styles/components/forms.css'
import './styles/components/badges.css'
import './styles/index.css'
import './styles/layout/main-layout.css'
import './styles/layout/prejoin.css'
import './styles/layout/theme-overrides.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext'
import { ContextProvider } from './SocketContext'
import AppDialog from './components/AppDialog.jsx'

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ContextProvider>
      <App />
      <AppDialog />
    </ContextProvider>
  </AuthProvider>,
)

