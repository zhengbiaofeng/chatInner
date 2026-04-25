import { create } from 'zustand';
import { Channel } from '@/types';

type PanelType = 'none' | 'todos' | 'favorites';

interface UIState {
  activePanel: PanelType;
  togglePanel: (panel: PanelType) => void;
  closePanel: () => void;
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
  activeChannel: Channel;
  setActiveChannel: (channel: Channel) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'none',
  togglePanel: (panel) =>
    set((state) => ({ activePanel: state.activePanel === panel ? 'none' : panel })),
  closePanel: () => set({ activePanel: 'none' }),
  unreadCount: 0,
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),
  activeChannel: { id: 'general', name: '总台 (GENERAL)', type: 'public', creatorId: 'system', createdAt: 0 },
  setActiveChannel: (channel) => set({ activeChannel: channel }),
}));
