import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Messaging } from './pages/Messaging';
import { Webhooks } from './pages/Webhooks';
import { Settings } from './pages/Settings';
import { InstanceDetails } from './pages/InstanceDetails';
import { Login } from './pages/Login';
import { Sidebar } from './components/Sidebar';
import { isAuthenticated } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="min-h-screen flex bg-[#0a0a0a]">
      <Sidebar />
      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 pt-24 lg:pt-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/instances" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/instances/:id" element={<ProtectedRoute><InstanceDetails /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messaging /></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute><Webhooks /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
