import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Dashboard } from './pages/Dashboard';
import { Messaging } from './pages/Messaging';
import { Webhooks } from './pages/Webhooks';
import { Settings } from './pages/Settings';
import { InstanceDetailsPage } from './components/InstanceDetails';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { GroupsPage } from './pages/GroupsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { AgentsPage } from './pages/AgentsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { WebhookLogsPage } from './pages/WebhookLogsPage';
import { ResellerAPISettings } from './pages/ResellerAPISettings';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { isAuthenticated } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: unknown) => {
        const normalized = error instanceof Error ? error.message : 'Something went wrong';
        toast.error(normalized);
      },
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = isAuthenticated();
  console.log('[ProtectedRoute] isAuthenticated():', auth, 'path:', window.location.pathname);
  if (!auth) {
    console.log('[ProtectedRoute] Redirecting to /login');
    return <Navigate to="/login" replace />;
  }
  console.log('[ProtectedRoute] Rendering protected content');
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
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto p-6 lg:p-10 pt-24 lg:pt-10">
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
        <ErrorBoundary>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/instances" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/instances/:id" element={<ProtectedRoute><InstanceDetailsPage /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messaging /></ProtectedRoute>} />
              <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
              <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
              <Route path="/agents" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
              <Route path="/webhook-logs" element={<ProtectedRoute><WebhookLogsPage /></ProtectedRoute>} />
              <Route path="/webhooks" element={<ProtectedRoute><Webhooks /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/reseller-api" element={<ProtectedRoute><ResellerAPISettings /></ProtectedRoute>} />
            </Routes>
          </Layout>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
