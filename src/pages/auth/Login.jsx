import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const checkUserProfile = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return
    }

    const { data: faculty, error: facultyError } = await supabase
      .from('faculties')
      .select('id, name, college_name, college_email, college_domain')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (facultyError) {
      console.error('Faculty profile lookup failed:', facultyError)
      setError('Unable to load your faculty profile. Please try again.')
      return
    }

    if (faculty) {
      navigate('/faculty/dashboard', { replace: true })
      return
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, name, roll_number, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (studentError) {
      console.error('Student profile lookup failed:', studentError)
      setError('Unable to load your student profile. Please try again.')
      return
    }

    if (student) {
      navigate('/student/dashboard', { replace: true })
      return
    }

    navigate('/account/setup', { replace: true })
  }, [navigate])

  useEffect(() => {
    checkUserProfile()
  }, [checkUserProfile])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    await checkUserProfile()
    setLoading(false)
  }

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#E9EDE5] px-4 py-12 text-[#26332D]">
      <div className="w-full max-w-md rounded-3xl border border-[#B9BDB3] bg-[#F7F4EA] p-8 shadow-xl shadow-[#26332D]/10 sm:p-10">
        <Link to="/" className="mb-8 inline-block text-sm font-medium text-[#68785B] hover:text-[#26332D]">
          ← Back to NPC
        </Link>

        <div className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#B66E52]">
            No Phones, Class
          </p>
          <h1 className="text-3xl font-bold">Login</h1>
          <p className="mt-2 text-sm text-[#26332D]/65">
            Sign in to continue to your classroom portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[#B9BDB3] bg-white/70 px-4 py-3 outline-none transition focus:border-[#68785B] focus:ring-2 focus:ring-[#68785B]/20"
            disabled={loading}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-[#B9BDB3] bg-white/70 px-4 py-3 outline-none transition focus:border-[#68785B] focus:ring-2 focus:ring-[#68785B]/20"
            disabled={loading}
            required
          />

          {error && (
            <p className="rounded-lg bg-[#B66E52]/10 px-3 py-2 text-sm text-[#9A4933]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#26332D] py-3 font-semibold text-[#F7F4EA] transition hover:bg-[#3A4A40] disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#B9BDB3]" />
          <span className="text-xs font-medium text-[#26332D]/50">OR</span>
          <div className="h-px flex-1 bg-[#B9BDB3]" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full rounded-xl border border-[#B9BDB3] bg-white/50 py-3 font-semibold transition hover:bg-white disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="mt-7 text-center">
          <p className="text-sm text-[#26332D]/65">New here?</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="font-semibold text-[#526247] underline underline-offset-4 hover:text-[#26332D]"
            >
              Faculty Registration
            </button>
            <span className="text-[#B9BDB3]">|</span>
            <button
              type="button"
              onClick={() => navigate('/student/register')}
              className="font-semibold text-[#526247] underline underline-offset-4 hover:text-[#26332D]"
            >
              Student Registration
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default Login