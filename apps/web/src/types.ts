// Shared client-side types mirroring the gateway-api REST contract.

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdBy?: string;
  createdAt: string;
}

export interface PostListItem {
  id: string;
  title: string;
  body: string;
  score: number;
  authorUsername: string;
  commentCount: number;
  createdAt: string;
}

export interface PostDetailPost {
  id: string;
  roomId: string;
  authorId: string;
  title: string;
  body: string;
  score: number;
  authorUsername: string;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  body: string;
  score: number;
  authorUsername: string;
  parentCommentId: string | null;
  createdAt: string;
}

export interface PostDetail {
  post: PostDetailPost;
  comments: CommentItem[];
}

export interface VoteResponse {
  score: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: string;
}

export type VoteValue = 1 | -1;

// Chat WebSocket frames exchanged with the realtime service.
// The realtime service keys everything by room SLUG (not id).
export interface ChatJoinFrame {
  type: "join";
  room: string; // room slug
}

export interface ChatOutgoingMessageFrame {
  type: "message";
  room: string; // room slug
  body: string;
}

export interface ChatIncomingMessageFrame {
  type: "message";
  room: string;
  author: { id: string; username: string };
  body: string;
  at: string;
}
