import { useState } from 'react';
import { useUser } from '../context/UserContext.jsx';

export default function Settings() {
  const { userId, logout } = useUser();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText,       setConfirmText]       = useState('');
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/account', {
        method:      'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete account.');
        return;
      }

      // Log out and redirect to login
      await logout();
    } catch (_) {
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your FinSync account</p>
      </div>

      {/* Account Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 font-bold text-lg">
              {userId?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">{userId}</p>
            <p className="text-sm text-gray-400">Your account email</p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border border-red-100">
        <h2 className="text-lg font-semibold text-red-700 mb-1">Danger Zone</h2>
        <p className="text-sm text-gray-500 mb-4">
          These actions are permanent and cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="bg-red-50 rounded-xl p-5 space-y-4">
            <div>
              <p className="font-semibold text-red-800 text-sm mb-1">
                Are you absolutely sure?
              </p>
              <p className="text-red-600 text-sm leading-relaxed">
                This will permanently delete your account and all associated data including:
              </p>
              <ul className="text-red-600 text-sm mt-2 space-y-1 ml-4 list-disc">
                <li>All connected bank accounts (Plaid tokens revoked)</li>
                <li>All property data and financial details</li>
                <li>All balance history and charts</li>
                <li>All AI advisor conversations</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-red-800 mb-1">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2 border border-red-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={loading || confirmText !== 'DELETE'}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                           hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {loading ? 'Deleting…' : 'Permanently delete account'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setConfirmText(''); setError(''); }}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm
                           hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
