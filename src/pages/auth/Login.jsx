import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function checkUserProfile() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return
    }

    // Check faculty profile first
    const {
      data: faculty,
      error: facultyError,
    } = await supabase
      .from('faculties')
      .select('id, name, college_name, college_email, college_domain')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (facultyError) {
      console.error('Faculty profile lookup failed:', facultyError)
      return
    }

    if (faculty) {
      console.log('Faculty profile exists:', faculty)

      navigate('/faculty/dashboard', {
        replace: true,
      })

      return
    }

    // Check student profile
    const {
      data: student,
      error: studentError,
    } = await supabase
      .from('students')
      .select('id, name, roll_number, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (studentError) {
      console.error('Student profile lookup failed:', studentError)
      return
    }

    if (student) {
      console.log('Student profile exists:', student)

      navigate('/student/dashboard', {
        replace: true,
      })

      return
    }

    // Authenticated user has neither profile
    console.log('Authenticated user has no faculty or student profile')

    navigate('/account/setup', {
      replace: true,
    })
  }

  useEffect(() => {
    checkUserProfile()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    console.log('Login successful')

    await checkUserProfile()

    setLoading(false)
  }

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173/login',
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-8">
          Login
        </h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black text-white py-3 font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>

        </form>

        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t" />

          <span className="px-3 text-sm text-gray-500">
            OR
          </span>

          <div className="flex-grow border-t" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full rounded-lg border py-3 font-medium disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="text-center mt-6 space-y-3">
          <p className="text-gray-600">
            New here?
          </p>

          <div className="flex items-center justify-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="font-medium underline"
            >
              Faculty Registration
            </button>

            <span className="text-gray-400">|</span>

            <button
              type="button"
              onClick={() => navigate('/student/register')}
              className="font-medium underline"
            >
              Student Registration
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

export default Login