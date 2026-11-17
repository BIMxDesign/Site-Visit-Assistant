import React, { useState } from 'react'
import { X, Mail, Lock, User, Building2, ShieldCheck, ArrowRight } from 'lucide-react'
import { registerUser, loginUser, setSetting } from '../db/database'
import { useAppStore } from '../store/useAppStore'
import {
  signUpWithFirebase,
  signInWithFirebase,
  signInWithGoogleFirebase,
  isFirebaseConfigured,
} from '../services/firebase'

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
      if (isFirebaseConfigured()) {
        if (mode === 'signup') {
          user = await signUpWithFirebase({
            email: cleanEmail,
            password,
            name: name.trim(),
            organization: organization.trim(),
          })
          try {
            await registerUser({
              email: cleanEmail,
              password,
              name: name.trim(),
              organization: organization.trim(),
            })
          } catch {}
        } else {
          user = await signInWithFirebase({
            email: cleanEmail,
            password,
          })
          try {
            await loginUser({
              email: cleanEmail,
              password,
            })
          } catch {}
        }
      } else {
        if (mode === 'signup') {
          user = await registerUser({
            email: cleanEmail,
            password,
            name: name.trim(),
            organization: organization.trim(),
          })
        } else {
          user = await loginUser({
            email: cleanEmail,
            password,
          })
        }
      }

      if (organization.trim() && !companyName) {
        await setSetting('companyName', organization.trim())
        setCompanyName(organization.trim())
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

  async function handleGoogleSignIn() {
    setError('')
    setLoading(true)
    try {
      const user = await signInWithGoogleFirebase()
      setCurrentUser(user)
      handleClose()
      navigateToDashboard()
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.')
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
              {mode === 'signup' ? 'Create User Account' : 'Sign In to Site Visit Assistant'}
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
              className="sitepunch-btn-primary w-full text-white py-3 px-4 rounded-xl font-bold text-sm shadow-md hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
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

          {/* Optional Google Sign-In when Firebase is connected */}
          {isFirebaseConfigured() && (
            <div className="pt-0.5">
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-3 text-[11px] text-gray-400 font-medium uppercase">Or</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-4 rounded-xl font-semibold text-xs shadow-2xs transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          )}

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
