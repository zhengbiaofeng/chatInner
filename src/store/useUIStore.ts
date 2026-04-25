import { create } from 'zustand';

type PanelType = 'none' | 'todos' | 'favorites';

interface UIState {
  activePanel: PanelType;
  togglePanel: (panel: PanelType) => void;
  closePanel: () => void;
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
  activeChatTitle: string;
  setActiveChatTitle: (title: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'none',
  togglePanel: (panel) =>
    set((state) => ({ activePanel: state.activePanel === panel ? 'none' : panel })),
  closePanel: () => set({ activePanel: 'none' }),
  unreadCount: 0,
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),
  activeChatTitle: 'GENERAL CHAT_ROOM',
  setActiveChatTitle: (title) => set({ activeChatTitle: title }),
}));
