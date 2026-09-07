import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function StudentSetup() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login', { replace: true })
        return
      }

      setUser(user)

      const suggestedName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        ''

      setName(suggestedName)
    }

    loadUser()
  }, [navigate])

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')

    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    if (!rollNumber.trim()) {
      setError('Roll number is required.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.rpc(
      'complete_student_profile',
      {
        p_name: name,
        p_roll_number: rollNumber,
      }
    )

    if (error) {
      console.error('Student profile completion failed:', error)
      setError(error.message)
      setLoading(false)
      return
    }

    console.log('Student profile created:', data)

    setLoading(false)

    navigate('/student/dashboard', {
      replace: true,
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-2">
          Complete Student Profile
        </h1>

        <p className="text-center text-gray-600 mb-8">
          Complete your profile before continuing.
        </p>

        {user && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >

            <div>
              <label className="block mb-1 font-medium">
                Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="w-full border rounded-lg px-4 py-3"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Roll Number
              </label>

              <input
                type="text"
                value={rollNumber}
                onChange={(event) => setRollNumber(event.target.value)}
                placeholder="Your roll number"
                className="w-full border rounded-lg px-4 py-3"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block mb-1 font-medium">
                Email
              </label>

              <input
                type="email"
                value={user.email || ''}
                disabled
                className="w-full border rounded-lg px-4 py-3 bg-gray-100"
              />
            </div>

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
              {loading
                ? 'Saving...'
                : 'Complete Student Profile'}
            </button>

          </form>
        )}

      </div>
    </div>
  )
}

export default StudentSetup