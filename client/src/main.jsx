import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/kook-layout.css'
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

