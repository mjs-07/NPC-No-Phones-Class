import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import FacultySetup from './pages/faculty/FacultySetup'
import FacultyDashboard from './pages/faculty/FacultyDashboard'
import { supabase } from './lib/supabase'

function App() {
  console.log('Supabase client:', supabase)

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />
        <Route
          path="/faculty/setup"
          element={<FacultySetup />}
        />

        <Route
          path="/faculty/dashboard"
          element={<FacultyDashboard />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App