/**
 * Auth Hook - Wraps AuthApi
 */

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/auth';
import { normalizeError } from '../lib/errors/appError';
import toast from 'react-hot-toast';

export interface User {
  id: string;
  email: string;
  name?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('accessToken');
  });

  useEffect(() => {
    const handleStorage = () => {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('accessToken');
      setUser(storedUser ? JSON.parse(storedUser) : null);
      setToken(storedToken);
    };
    const interval = setInterval(handleStorage, 500);
    return () => clearInterval(interval);
  }, []);

  return { user, token };
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) => authService.login(credentials),
    onSuccess: () => toast.success('Logged in'),
    onError: (error) => {
      const err = normalizeError(error);
      toast.error(err.message || 'Login failed');
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: { email: string; password: string; name: string }) => authService.register(data),
    onSuccess: () => toast.success('Registration successful'),
    onError: (error) => {
      const err = normalizeError(error);
      toast.error(err.message || 'Registration failed');
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      toast.success('Logged out');
      window.location.href = '/login';
    },
  });
}

export function getAuthUser(): User | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('accessToken');
  return !!token;
}

export function getToken(): string | null {
  return localStorage.getItem('accessToken');
}
