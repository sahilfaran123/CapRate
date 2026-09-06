import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProvider, useUser } from './context/UserContext.jsx';
import Navbar         from './components/Navbar.jsx';
import Dashboard      from './pages/Dashboard.jsx';
import Analysis       from './pages/Analysis.jsx';
import Advisor        from './pages/Advisor.jsx';
import Settings       from './pages/Settings.jsx';
import RealEstate     from './pages/RealEstate.jsx';
import DealAnalyzer   from './pages/DealAnalyzer.jsx';
import Login          from './pages/Login.jsx';
import ResetPassword  from './pages/ResetPassword.jsx';
import ErrorBoundary  from './components/ErrorBoundary.jsx';

function AppRoutes() {
  const { userId, loading } = useUser();
  const { pathname }        = useLocation();
  const isAdvisor           = pathname === '/advisor';

  // Show spinner while checking session cookie
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  // Not logged in — show login page or reset password page
  if (!userId) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*"              element={<Login />} />
      </Routes>
    );
  }

  // Logged in — show app
  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <Navbar />
      <div className={isAdvisor ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
        {isAdvisor ? (
          <Routes>
            <Route path="/advisor" element={<Advisor />} />
            <Route path="*"        element={<Navigate to="/advisor" replace />} />
          </Routes>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/analysis"      element={<Analysis />} />
              <Route path="/real-estate"   element={<RealEstate />} />
              <Route path="/deal-analyzer" element={<DealAnalyzer />} />
              <Route path="/settings"      element={<Settings />} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fullPage>
      <UserProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </UserProvider>
    </ErrorBoundary>
  );
}
