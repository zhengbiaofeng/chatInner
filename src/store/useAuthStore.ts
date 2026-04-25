import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserPublic } from '@/types';

interface AuthState {
  token: string | null;
  user: UserPublic | null;
  login: (token: string, user: UserPublic) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
