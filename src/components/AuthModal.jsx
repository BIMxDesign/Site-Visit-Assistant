import React, { useState } from 'react'
import { X, Mail, Lock, User, Building2, ShieldCheck, ArrowRight } from 'lucide-react'
import { registerUser, loginUser, setSetting } from '../db/database'
import { useAppStore } from '../store/useAppStore'

export default function AuthModal({ initialMode = 'signup', onClose }) {
  const {
    closeAuthModal,
    setCurrentUser,
    navigateToDashboard,
    companyName,
    setCompanyName
  } = useAppStore()

  const [mode, setMode] = useState(initialMode) // 'signup' | 'signin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState(companyName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    if (onClose) onClose()
    else closeAuthModal()
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    setError('')

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setError('Please enter your email address.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }
    if (password.length < 4) {
      setError('Password should be at least 4 characters.')
      return
    }

    setLoading(true)
    try {
      let user = null
      if (mode === 'signup') {
        user = await registerUser({
          email: cleanEmail,
          password,
          name: name.trim(),
          organization: organization.trim(),
        })

        // If user entered organization name and companyName was empty, persist it
        if (organization.trim() && !companyName) {
          await setSetting('companyName', organization.trim())
          setCompanyName(organization.trim())
        }
      } else {
        user = await loginUser({
          email: cleanEmail,
          password,
        })
      }

      setCurrentUser(user)
      handleClose()
      navigateToDashboard()
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 text-white flex items-start justify-between relative overflow-hidden"
          style={{ background: 'var(--brand-header, #1e40af)' }}
        >
          <div className="relative z-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center mb-2.5 shadow-xs">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <h3 className="font-bold text-lg leading-tight">
              {mode === 'signup' ? 'Create User Account' : 'Sign In to SitePunch'}
            </h3>
            <p className="text-xs text-brand-200 mt-1 leading-snug">
              {mode === 'signup'
                ? 'Sign up with your email to manage punch lists, drawings, and observation reports'
                : 'Enter your email & password to access your project dashboard'}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors relative z-10"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-gray-50/70 p-1">
          <button
            type="button"
            onClick={() => { setMode('signup'); setError('') }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError('') }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'signin'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Email input (used as username) */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Mail size={13} className="text-gray-400" />
              Email (Username) *
            </label>
            <input
              type="email"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50/50"
              placeholder="inspector@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); if (error) setError('') }}
              required
            />
          </div>

          {/* Password input */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Lock size={13} className="text-gray-400" />
              Password *
            </label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50/50"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); if (error) setError('') }}
              required
            />
          </div>

          {/* Extra fields for Sign Up */}
          {mode === 'signup' && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <User size={13} className="text-gray-400" />
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50/50"
                  placeholder="e.g. John Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <Building2 size={13} className="text-gray-400" />
                  Organization / Company (Optional)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50/50"
                  placeholder="e.g. Acme Construction Inc."
                  value={organization}
                  onChange={e => setOrganization(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="sitepunch-btn-primary w-full text-white py-3 px-4 rounded-xl font-bold text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'signup'
                      ? 'Sign Up & Go to Dashboard'
                      : 'Sign In & Go to Dashboard'}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {/* Quick toggle at bottom */}
          <div className="text-center pt-1 text-xs text-gray-500">
            {mode === 'signup' ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError('') }}
                  className="text-brand-700 font-bold hover:underline"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError('') }}
                  className="text-brand-700 font-bold hover:underline"
                >
                  Create one now
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
