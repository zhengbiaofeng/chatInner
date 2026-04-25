export type Role = 'admin' | 'user';

// =======================
// Data Models (DB Schema)
// =======================

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: number;
}

export interface UserPublic {
  id: string;
  username: string;
  role: Role;
  createdAt: number;
}

export interface Channel {
  id: string;
  name: string;
  type: 'public' | 'private';
  creatorId: string;
  createdAt: number;
}

export interface DbAttachment {
  id: string;
  originalName: string;
  storedName: string;
  mime: string;
  size: number;
  uploaderId: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  isImage: boolean;
  url: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  userId: string;
  username: string;
  text: string;
  sticker: string;
  attachments: Attachment[];
  createdAt: number;
}

export interface Todo {
  id: string;
  content: string;
  completed: boolean;
  creatorId: string;
  creatorName: string;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: number;
  completedAt: number | null;
}

export interface FavoriteSingle {
  id: string;
  userId: string;
  type: 'single';
  message: ChatMessage;
  createdAt: number;
}

export interface FavoriteCollection {
  id: string;
  userId: string;
  type: 'collection';
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export type Favorite = FavoriteSingle | FavoriteCollection;

export interface DbSchema {
  users: User[];
  channels: Channel[];
  messages: ChatMessage[];
  attachments: DbAttachment[];
  todos: Todo[];
  favorites: Favorite[];
}

// =======================
// API Contracts
// =======================

export interface LoginResponse {
  token: string;
  user: UserPublic;
}

export interface ErrorResponse {
  error: string;
}

// Request & Response Types for Todos
export interface CreateTodoRequest {
  content: string;
  assigneeId?: string;
}

export interface UpdateTodoRequest {
  completed: boolean;
}

// Request & Response Types for Favorites
export interface CreateFavoriteRequest {
  messageId?: string;
  messageIds?: string[];
  title?: string;
}

// Request Types for Users
export interface CreateUserRequest {
  username: string;
  password?: string; // Default '123456'
  role?: Role;
}

export interface UpdatePasswordRequest {
  oldPassword?: string;
  newPassword?: string;
}

// Socket.io Types
export interface ServerToClientEvents {
  'server:hello': (data: { user: UserPublic; room: string }) => void;
  'chat:message': (message: ChatMessage) => void;
  'collection_updated': () => void;
  'notification:new': (message: ChatMessage) => void;
  'channel:users': (data: { roomId: string; users: UserPublic[] }) => void;
}

export interface ClientToServerEvents {
  'channel:join': (roomId: string, callback?: (response: { ok: boolean; error?: string }) => void) => void;
  'channel:leave': (roomId: string) => void;
  'chat:message': (
    payload: { roomId: string; text?: string; sticker?: string; attachmentIds?: string[] },
    callback?: (response: { ok: boolean; error?: string }) => void
  ) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  user: UserPublic;
}
