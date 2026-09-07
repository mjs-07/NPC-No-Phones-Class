import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function AccountSetup() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

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
    }

    loadUser()
  }, [navigate])

  function chooseFaculty() {
    navigate('/faculty/setup')
  }

  function chooseStudent() {
    navigate('/student/setup')
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-2">
          Complete Your Account
        </h1>

        <p className="text-center text-gray-600 mb-8">
          Choose how you will use the classroom platform.
        </p>

        <div className="space-y-4">

          <button
            type="button"
            onClick={chooseFaculty}
            className="w-full rounded-xl border p-6 text-left hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">
              Faculty
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              Create and manage classroom sessions.
            </p>
          </button>

          <button
            type="button"
            onClick={chooseStudent}
            className="w-full rounded-xl border p-6 text-left hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">
              Student
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              Join classroom sessions and manage your participation.
            </p>
          </button>

        </div>

      </div>
    </div>
  )
}

export default AccountSetup