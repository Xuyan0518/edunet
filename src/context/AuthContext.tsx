import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SessionController, type SessionUser, type SessionState } from '@/features/auth/session';
import { SESSION_EXPIRED } from '@/services/http';
export type UserRole = SessionUser['role'] | null;
interface AuthContextType {
    user: SessionUser | null;
    role: UserRole;
    status: SessionState['status'];
    isAuthenticated: boolean;
    login: (email: string, password: string, role: UserRole) => Promise<boolean>;
    socialLogin: () => Promise<boolean>;
    reviewerLogin: (account: string, password: string) => Promise<boolean>;
    logout: () => void;
    retry: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    updateUser: (user: SessionUser) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider = ({ children }: {
    children: React.ReactNode;
}) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [controller] = useState(() => new SessionController(localStorage, () => { void queryClient.cancelQueries(); queryClient.clear(); }));
    const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
    useEffect(() => {
        void controller.restore();
        const expired = (event: Event) => {
            if ((event as CustomEvent).detail === localStorage.getItem('edunet-token'))
                controller.clear();
        };
        const changed = (event: StorageEvent) => { if (event.key === 'edunet-token' || event.key === 'adminToken' || event.key === null)
            void controller.restore(); };
        window.addEventListener(SESSION_EXPIRED, expired);
        window.addEventListener('storage', changed);
        return () => { window.removeEventListener(SESSION_EXPIRED, expired); window.removeEventListener('storage', changed); };
    }, [controller]);
    const value: AuthContextType = {
        ...state, role: state.user?.role ?? null, isAuthenticated: state.status === 'authenticated',
        login: (email, password, role) => controller.login(role === 'admin' ? 'admin/login' : 'login', { email, password, role: role || '' }),
        socialLogin: () => controller.login('auth/web/session', {}),
        reviewerLogin: (account, password) => controller.login('auth/reviewer-login', { username: account, password }),
        logout: () => { controller.clear(); navigate('/login', { replace: true }); },
        retry: controller.restore, refreshProfile: controller.refreshProfile,
        updateUser: () => { void controller.refreshProfile(); },
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context)
        throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
