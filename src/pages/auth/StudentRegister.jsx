import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function StudentRegister() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    rollNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setMessage('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          account_type: 'student',
          name: formData.name,
          roll_number: formData.rollNumber,
        },
      },
    })

    if (error) {
        console.error('Student signup failed:', error)
        if (error.message.toLowerCase().includes('password')) {
            setError(
            'Password must contain lowercase, uppercase, digits and special case'
            )
        } else {
            setError(error.message)
        }
        setLoading(false)
        return
    }

    console.log('Student signup successful:', data)

    setMessage(
      'Registration successful. Please check your email to confirm your account.'
    )

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-2">
          Student Registration
        </h1>

        <p className="text-center text-gray-600 mb-8">
          Create your student account
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >

          <input
            type="text"
            name="name"
            placeholder="Full Name"
            value={formData.name}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          <input
            type="text"
            name="rollNumber"
            placeholder="Roll Number"
            value={formData.rollNumber}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            disabled={loading}
            required
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm text-green-600">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black text-white py-3 font-medium disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>

        </form>

        <p className="text-center mt-6">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-medium underline"
          >
            Login
          </button>
        </p>

      </div>
    </div>
  )
}

export default StudentRegister