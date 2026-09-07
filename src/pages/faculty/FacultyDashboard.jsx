import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function FacultyDashboard() {
  const navigate = useNavigate()

  const [faculty, setFaculty] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFacultyProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      const { data, error } = await supabase
        .from('faculties')
        .select(
          'id, name, college_name, college_email, college_domain'
        )
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Faculty profile lookup failed:', error)
        setLoading(false)
        return
      }

      if (!data) {
        navigate('/faculty/setup', { replace: true })
        return
      }

      setFaculty(data)
      setLoading(false)
    }

    loadFacultyProfile()
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

  if (!faculty) {
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
              Faculty Dashboard
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

        <div className="mb-8">
          <h2 className="text-3xl font-bold">
            Welcome, {faculty.name}
          </h2>

          <p className="text-gray-600 mt-2">
            {faculty.college_name}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">

          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Classroom Session
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Start and manage your classroom session.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Students
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Monitor students participating in the session.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Reports
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Generate attendance and session reports.
            </p>
          </div>

        </div>

      </main>

    </div>
  )
}

export default FacultyDashboard