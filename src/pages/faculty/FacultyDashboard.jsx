import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function FacultyDashboard() {
  const navigate = useNavigate()

  const [faculty, setFaculty] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startingSession, setStartingSession] = useState(false)
  const [sessionError, setSessionError] = useState('')

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

      // Check whether this faculty already has an active session.
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status, started_at, ended_at')
        .eq('faculty_id', data.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (sessionError) {
        console.error('Active session lookup failed:', sessionError)
      } else {
        setActiveSession(session)
      }

      setLoading(false)
    }

    loadFacultyProfile()
  }, [navigate])

  async function handleStartSession() {
    setStartingSession(true)
    setSessionError('')

    try {
      const { data, error } = await supabase.functions.invoke(
        'create-session',
        {
          method: 'POST',
          body: {},
        }
      )

      if (error) {
        console.error('Create session failed:', error)

        setSessionError(
          error.message || 'Unable to start classroom session.'
        )

        return
      }

      if (!data?.session) {
        setSessionError('Session was not created correctly.')
        return
      }

      setActiveSession(data.session)
    } catch (error) {
      console.error('Unexpected session creation error:', error)

      setSessionError('Unable to start classroom session.')
    } finally {
      setStartingSession(false)
    }
  }

  async function handleTestQr() {
    if (!activeSession) {
      console.error('No active session available.')
      return
    }

    const { data, error } = await supabase.functions.invoke(
      'generate-qr',
      {
        method: 'POST',
        body: {
          session_id: activeSession.id,
        },
      }
    )

    if (error) {
      console.error('Generate QR failed:', error)
      return
    }

    console.log('Generated QR token:', data)
  }

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

          {/* Classroom Session */}
          <div className="rounded-xl border bg-white p-6">

            <h3 className="font-semibold text-lg">
              Classroom Session
            </h3>

            {activeSession ? (
              <div className="mt-4 space-y-3">

                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500" />

                  <span className="font-medium">
                    Session Active
                  </span>
                </div>

                <p className="text-sm text-gray-500">
                  Started at:{' '}
                  {new Date(
                    activeSession.started_at
                  ).toLocaleString()}
                </p>

                <p className="text-xs text-gray-400 break-all">
                  Session ID: {activeSession.id}
                </p>

                <button
                  type="button"
                  onClick={handleTestQr}
                  className="rounded-lg bg-black text-white px-5 py-3 font-medium"
                >
                  Test QR Generation
                </button>

              </div>
            ) : (
              <div className="mt-4">

                <p className="text-sm text-gray-500 mb-4">
                  No active classroom session.
                </p>

                {sessionError && (
                  <p className="text-sm text-red-600 mb-4">
                    {sessionError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={startingSession}
                  className="rounded-lg bg-black text-white px-5 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingSession
                    ? 'Starting...'
                    : 'Start Session'}
                </button>

              </div>
            )}

          </div>

          {/* Students */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="font-semibold text-lg">
              Students
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Monitor students participating in the session.
            </p>
          </div>

          {/* Reports */}
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