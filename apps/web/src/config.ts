// Runtime configuration read from Vite's import.meta.env with sane defaults.

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const WS_URL: string =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
