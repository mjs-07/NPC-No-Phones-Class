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
import StudentRegister from './pages/auth/StudentRegister'
import StudentDashboard from './pages/student/StudentDashboard'
import AccountSetup from './pages/auth/AccountSetup'
import StudentSetup from './pages/student/StudentSetup'
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

        <Route
          path="/student/register"
          element={<StudentRegister />}
        />

        <Route
          path="/student/dashboard"
          element={<StudentDashboard />}
        />

        <Route
          path="/account/setup"
          element={<AccountSetup />}
        />

        <Route
          path="/student/setup"
          element={<StudentSetup />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App