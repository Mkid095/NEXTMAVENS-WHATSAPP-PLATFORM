import React, { useState } from 'react';
import { useLogin } from '../hooks/useAuth';
import { Zap, Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    console.log('[Login] Submit clicked', { email });
    try {
      console.log('[Login] Calling mutateAsync...');
      const data = await login.mutateAsync({ email, password });
      console.log('[Login] mutateAsync resolved, storing tokens...');
      // Store auth data immediately before navigation
      localStorage.setItem('accessToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      console.log('[Login] Tokens stored, navigating to /');
      navigate('/');
    } catch (err: any) {
      console.error('[Login] mutateAsync failed:', err);
      setError(err.response?.data?.message || 'Invalid email or password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 mb-6">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
          <p className="text-zinc-500 mt-2">Sign in to your MAVENS account</p>
        </div>

        <div className="card bg-zinc-900/50 backdrop-blur-xl border-zinc-800 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="input w-full pl-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-sm font-medium text-zinc-400">Password</label>
                <button type="button" className="text-xs text-emerald-500 hover:underline">Forgot password?</button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="password"
                  required
                  placeholder="••••••••"
                  className="input w-full pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={login.isPending}
              className="btn-primary w-full py-4 text-lg font-bold shadow-lg shadow-emerald-500/20"
            >
              {login.isPending ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-emerald-500 font-semibold hover:underline">Create one</Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-zinc-600 text-xs">
            © 2026 MAVENS WhatsApp API. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
