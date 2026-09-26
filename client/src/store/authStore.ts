import { create } from 'zustand';
import type { User } from '@/types';
import { advanceSessionEpoch } from '@/services/sessionEpoch';

interface AuthState {
  user: User | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  isLoggedIn: boolean;
  setAuth: (user: User) => void;
  markAnonymous: () => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

// 旧版本曾把长期 Bearer token 持久化到 localStorage。加载新会话实现时只清理
// 这些已废弃的认证副本；“记住用户名”等非凭据偏好不受影响。
if (typeof window !== 'undefined') {
  localStorage.removeItem('token');
  localStorage.removeItem('customerToken');
  localStorage.removeItem('customer');
  localStorage.removeItem('jewelry-auth');
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'unknown',
  isLoggedIn: false,

  setAuth: (user: User) => {
    advanceSessionEpoch('admin');
    set({ user, status: 'authenticated', isLoggedIn: true });
  },
  markAnonymous: () => {
    advanceSessionEpoch('admin');
    set({ user: null, status: 'anonymous', isLoggedIn: false });
  },
  logout: () => {
    advanceSessionEpoch('admin');
    set({ user: null, status: 'anonymous', isLoggedIn: false });
  },

  updateUser: (userData: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...userData } : null,
    }));
  },
}));
