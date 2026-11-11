"use client";

import { API_BASE, ApiError } from "@/lib/api";

export type AuthUser = {
  id: number;
  email: string;
  is_active: boolean;
  created_at: string;
};

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);

    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`;

    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return handle<AuthUser>(response);
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return handle<AuthUser>(response);
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: "same-origin",
    cache: "no-store",
  });

  return handle<AuthUser>(response);
}

export async function logoutUser(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
  });

  await handle<{ message: string }>(response);
}

export async function logoutAllSessions(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout-all`, {
    method: "POST",
    credentials: "same-origin",
  });

  await handle<{ message: string }>(response);
}
