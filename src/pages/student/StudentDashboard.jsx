import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function StudentDashboard() {
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStudentProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data, error } = await supabase
        .from('students')
        .select('id, name, roll_number, email')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Student profile lookup failed:', error)
        setLoading(false)
        return
      }

      if (!data) {
        navigate('/login', { replace: true })
        return
      }

      setStudent(data)
      setLoading(false)
    }

    loadStudentProfile()
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!student) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div>
            <h1 className="text-xl font-bold">
              Classroom Compliance
            </h1>

            <p className="text-sm text-gray-500">
              Student Portal
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border px-4 py-2 font-medium hover:bg-gray-100"
          >
            Logout
          </button>

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        <h2 className="text-3xl font-bold">
          Welcome, {student.name}
        </h2>

        <p className="text-gray-600 mt-2">
          Roll Number: {student.roll_number}
        </p>

      </main>

    </div>
  )
}

export default StudentDashboard