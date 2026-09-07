import { useState } from 'react'
import { supabase } from '../../lib/supabase'

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    collegeName: '',
    collegeEmail: '',
    password: '',
    confirmPassword: '',
  })

  const [error, setError] = useState('')

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

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.collegeEmail,
        password: formData.password,
        options: {
          data: {
            account_type: 'faculty',
            name: formData.name,
            college_name: formData.collegeName,
          },
        },
      })

      if (error) {
        if (error.message.toLowerCase().includes('password')) {
          setError(
            'Password must contain lowercase, uppercase, digits and special case'
          )
        } else {
          setError(error.message)
        }

        return
      }

      console.log('Signup successful:', data)

    } catch (error) {
      setError('Something went wrong. Please try again.')
      console.error(error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">
          Faculty Registration
        </h1>

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
            required
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            type="text"
            name="collegeName"
            placeholder="College Name"
            value={formData.collegeName}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            type="email"
            name="collegeEmail"
            placeholder="College Email"
            value={formData.collegeEmail}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength={8}
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            minLength={8}
            className="w-full border rounded-lg px-4 py-3"
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-black text-white py-3 font-medium"
          >
            Create Faculty Account
          </button>
        </form>
      </div>
    </div>
  )
}

export default Register