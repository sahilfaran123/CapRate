import { useState } from 'react';
import { useUser } from '../context/UserContext.jsx';

// ── Field component defined OUTSIDE Login to prevent re-mount on every keystroke ──
function Field({ name, label, type = 'text', placeholder, hint, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'current-password' : name}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                   transition-colors"
        required
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const API = '/api/auth';

export default function Login() {
  const { login }    = useUser();
  const [mode, setMode]       = useState('login');    // 'login' | 'register' | 'reset'
  const [form, setForm]       = useState({ email: '', password: '', confirmPassword: '', name: '' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/login`, {
        method:      'POST',
        credentials: 'include',           // Send/receive cookies
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      // Store email for display purposes only — auth is via HTTP-only cookie
      login(data.user.email);
    } catch (_) {
      setError('Unable to connect to server. Make sure it is running.');
    } finally {
      setLoading(false);
    }
  };

  // ── Register ───────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(form.password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }
    if (!/\d/.test(form.password)) {
      setError('Password must contain at least one number');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/register`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          email:    form.email,
          password: form.password,
          name:     form.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      login(data.user.email);
    } catch (_) {
      setError('Unable to connect to server. Make sure it is running.');
    } finally {
      setLoading(false);
    }
  };

  // ── Password Reset Request ─────────────────────────────────────────────────
  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/request-reset`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email }),
      });
      const data = await res.json();
      setSuccess(data.message || 'If an account exists, a reset link has been sent.');
    } catch (_) {
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  // handleChange defined above handles all field updates

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
            <span className="text-white font-bold text-2xl">FS</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">FinSync</h1>
          <p className="text-gray-500 mt-2 text-sm">Your complete financial picture</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">

          {/* ── Login Form ── */}
          {mode === 'login' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
              <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <Field name="email"    label="Email address" type="email"    placeholder="you@example.com" value={form.email}    onChange={handleChange} />
                <Field name="password" label="Password"      type="password" placeholder="••••••••"        value={form.password} onChange={handleChange} />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium
                             hover:bg-indigo-700 transition-colors disabled:opacity-50
                             disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  onClick={() => { setMode('reset'); setError(''); }}
                  className="text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
                >
                  Create account →
                </button>
              </div>
            </>
          )}

          {/* ── Register Form ── */}
          {mode === 'register' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Create account</h2>
              <p className="text-sm text-gray-500 mb-6">Get started with FinSync</p>

              <form onSubmit={handleRegister} className="space-y-4">
                <Field name="name"            label="Full name"        type="text"     placeholder="Sahil Faran"                              value={form.name}            onChange={handleChange} />
                <Field name="email"           label="Email address"    type="email"    placeholder="you@example.com"                          value={form.email}           onChange={handleChange} />
                <Field
                  name="password"
                  label="Password"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  hint="At least 8 characters with one uppercase letter and one number"
                  value={form.password}
                  onChange={handleChange}
                />
                <Field name="confirmPassword" label="Confirm password" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={handleChange} />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium
                             hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <div className="mt-4 text-center text-sm">
                <span className="text-gray-500">Already have an account? </span>
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Sign in
                </button>
              </div>
            </>
          )}

          {/* ── Password Reset Form ── */}
          {mode === 'reset' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Reset password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email and we'll send a reset link
              </p>

              {success ? (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-4 text-center">
                  {success}
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <Field name="email" label="Email address" type="email" placeholder="you@example.com" value={form.email} onChange={handleChange} />

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium
                               hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}

              <div className="mt-4 text-center text-sm">
                <button
                  onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}
        </div>

        {/* Feature bullets */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🏦', label: 'Banking'     },
            { icon: '📈', label: 'Investments' },
            { icon: '🏠', label: 'Real Estate' },
          ].map(f => (
            <div key={f.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="text-xs font-medium text-gray-600">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
