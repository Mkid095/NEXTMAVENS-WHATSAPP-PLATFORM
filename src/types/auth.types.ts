/**
 * Authentication & User Types
 * Types for user accounts, auth state, and org membership
 */

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: string;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
}
