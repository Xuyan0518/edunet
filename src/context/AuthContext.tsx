import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner'; // Fix the import
import { buildApiUrl } from '@/config/api';
import { getAuthToken, saveAuthToken, removeAuthToken } from '@/utils/auth';
import { parseStoredUser } from '@/utils/authSession';

export type UserRole = 'teacher' | 'parent' | null;

interface User {
  id: string;
  name: string;
  email?: string | null;
  role: UserRole;
  status?: string;
  authProvider?: string;
  children?: string[]; // Make children an optional property
}

export type ProviderLoginResult = {
  success: boolean;
  status?: 'pending_approval' | 'account_rejected';
  error?: string;
  user?: User;
};

interface AuthContextType {
  user: User | null;
  role: UserRole;
  login: (email: string, password: string, role: UserRole) => Promise<boolean>;
  loginWithGoogle: (credential: string, role: Exclude<UserRole, null>) => Promise<ProviderLoginResult>;
  logout: () => void;
  updateUser: (user: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => parseStoredUser<User>(
    localStorage.getItem('edunet-user'),
    getAuthToken(),
  ));
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && localStorage.getItem('edunet-user')) {
      localStorage.removeItem('edunet-user');
    }
  }, [user]);

  const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
    try {
      const res = await fetch(buildApiUrl('login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        localStorage.setItem('edunet-user', JSON.stringify(data.user));
        
        // Save token if provided
        if (data.token) {
          saveAuthToken(data.token);
        }
        
        toast.success(`Welcome back, ${data.user.name}!`);
        return true;
      } else {
        // Handle specific error cases
        if (data.status === 'pending_approval') {
          toast.error('Your account is pending admin approval. You will be notified once approved.');
        } else {
          toast.error(data.error || 'Invalid credentials. Please try again.');
        }
        return false;
      }
    } catch (error) {
      toast.error('Login failed. Please try again.');
      return false;
    }
  }; 

  const loginWithGoogle = async (
    credential: string,
    role: Exclude<UserRole, null>,
  ): Promise<ProviderLoginResult> => {
    try {
      const res = await fetch(buildApiUrl('auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, role }),
      });
      const data = await res.json();

      if (res.ok && data.user && data.token) {
        setUser(data.user);
        localStorage.setItem('edunet-user', JSON.stringify(data.user));
        saveAuthToken(data.token);
        return { success: true, user: data.user };
      }

      if (data.status === 'pending_approval' || data.code === 'account_rejected') {
        return {
          success: false,
          status: data.code === 'account_rejected' ? 'account_rejected' : 'pending_approval',
          error: data.error,
          user: data.user,
        };
      }

      return { success: false, error: data.error || 'Google sign-in failed.' };
    } catch {
      return { success: false, error: 'Google sign-in failed. Please try again.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('edunet-user');
    removeAuthToken();
    toast.success('Logged out successfully.');
    navigate('/login');
  };

  const updateUser = (nextUser: User) => {
    setUser(nextUser);
    localStorage.setItem('edunet-user', JSON.stringify(nextUser));
  };

  const value = {
    user,
    role: user?.role || null,
    login,
    loginWithGoogle,
    logout,
    updateUser,
    isAuthenticated: Boolean(user && getAuthToken()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
