// Typed fetch wrapper. Attaches the Bearer token, parses JSON, and throws
// an ApiError on any non-2xx response so callers can surface a message.

import { API_URL } from "./config.js";
import { getToken } from "./storage.js";
import type {
  AuthResponse,
  CommentItem,
  Notification,
  PostDetail,
  PostListItem,
  Room,
  VoteResponse,
  VoteValue,
} from "./types.js";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When false, do not attach the Authorization header (e.g. auth endpoints).
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    throw new ApiError(0, `Network request failed: ${reason}`);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    });
  },

  login(input: {
    username: string;
    password: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
  },

  listRooms(): Promise<Room[]> {
    return request<Room[]>("/api/rooms");
  },

  createRoom(input: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Room> {
    return request<Room>("/api/rooms", { method: "POST", body: input });
  },

  listPosts(slug: string): Promise<PostListItem[]> {
    return request<PostListItem[]>(
      `/api/rooms/${encodeURIComponent(slug)}/posts`,
    );
  },

  createPost(
    slug: string,
    input: { title: string; body: string },
  ): Promise<PostListItem> {
    return request<PostListItem>(
      `/api/rooms/${encodeURIComponent(slug)}/posts`,
      { method: "POST", body: input },
    );
  },

  getPost(id: string): Promise<PostDetail> {
    return request<PostDetail>(`/api/posts/${encodeURIComponent(id)}`);
  },

  createComment(
    postId: string,
    input: { body: string; parentCommentId?: string | null },
  ): Promise<CommentItem> {
    return request<CommentItem>(
      `/api/posts/${encodeURIComponent(postId)}/comments`,
      { method: "POST", body: input },
    );
  },

  votePost(postId: string, value: VoteValue): Promise<VoteResponse> {
    return request<VoteResponse>(
      `/api/posts/${encodeURIComponent(postId)}/vote`,
      { method: "POST", body: { value } },
    );
  },

  voteComment(commentId: string, value: VoteValue): Promise<VoteResponse> {
    return request<VoteResponse>(
      `/api/comments/${encodeURIComponent(commentId)}/vote`,
      { method: "POST", body: { value } },
    );
  },

  listNotifications(): Promise<Notification[]> {
    return request<Notification[]>("/api/notifications");
  },
};
