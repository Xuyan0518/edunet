import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner'; // Fix the import

export type UserRole = 'teacher' | 'parent' | null;

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  children?: string[]; // Make children an optional property
}

interface AuthContextType {
  user: User | null;
  role: UserRole;
  login: (email: string, password: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in from localStorage
    const storedUser = localStorage.getItem('educonnect-user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setIsAuthenticated(true);
    }
  }, []);

  const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
    try {
      const res = await fetch('http://localhost:3003/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('educonnect-user', JSON.stringify(data.user));
        toast.success(`Welcome back, ${data.user.name}!`);
        return true;
      } else {
        toast.error(data.error || 'Invalid credentials. Please try again.');
        return false;
      }
    } catch (error) {
      toast.error('Login failed. Please try again.');
      return false;
    }
  }; 

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('educonnect-user');
    toast.success('Logged out successfully.');
    navigate('/login');
  };

  const value = {
    user,
    role: user?.role || null,
    login,
    logout,
    isAuthenticated,
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
