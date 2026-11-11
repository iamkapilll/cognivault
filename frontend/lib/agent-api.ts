"use client";

import { API_BASE, ApiError, notifyUnauthorized } from "@/lib/api";

export type Conversation = {
  id: number;
  thread_id: string;
  title: string;
  document_ids: number[];
  created_at: string;
  updated_at: string;
  preview: string | null;
};

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PendingApproval = {
  action: string;
  document_id: number;
  filename: string;
  message: string;
};

export type AgentResult = {
  conversation_id: number;
  thread_id: string;
  status: "completed" | "approval_required";
  answer: string | null;
  pending_approvals: PendingApproval[];
};

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`;

    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function listConversations(): Promise<Conversation[]> {
  return fetch(`${API_BASE}/agent/conversations`, {
    credentials: "same-origin",
    cache: "no-store",
  }).then((response) => parse<Conversation[]>(response));
}

export function getConversation(id: number): Promise<Conversation> {
  return fetch(`${API_BASE}/agent/conversations/${id}`, {
    credentials: "same-origin",
    cache: "no-store",
  }).then((response) => parse<Conversation>(response));
}

export function createConversation(
  documentIds: number[] = [],
): Promise<Conversation> {
  return fetch(
    `${API_BASE}/agent/conversations`,
    json({ document_ids: documentIds }),
  ).then((response) => parse<Conversation>(response));
}

export function renameConversation(
  id: number,
  title: string,
): Promise<Conversation> {
  return fetch(`${API_BASE}/agent/conversations/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((response) => parse<Conversation>(response));
}

export async function deleteConversation(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/conversations/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });

  await parse<{ message: string }>(response);
}

export type ConversationHistory = {
  conversation_id: number;
  messages: StoredMessage[];
  pending_approvals: PendingApproval[];
};

export function getConversationMessages(id: number): Promise<ConversationHistory> {
  return fetch(`${API_BASE}/agent/conversations/${id}/messages`, {
    credentials: "same-origin",
    cache: "no-store",
  }).then((response) => parse<ConversationHistory>(response));
}

export async function sendAgentMessage(
  conversationId: number,
  message: string,
  documentIds: number[] = [],
): Promise<AgentResult> {
  const response = await fetch(
    `${API_BASE}/agent/chat`,
    json({ conversation_id: conversationId, message, document_ids: documentIds }),
  );

  return parse<AgentResult>(response);
}

export async function approveAgentAction(
  conversationId: number,
  decision: "approve" | "reject",
): Promise<AgentResult> {
  const response = await fetch(
    `${API_BASE}/agent/approve`,
    json({ conversation_id: conversationId, decision }),
  );

  return parse<AgentResult>(response);
}

type StreamHandlers = {
  onToken: (text: string) => void;
  onTool: (name: string, status: "started" | "completed") => void;
  onApproval: (approvals: PendingApproval[]) => void;
  onDone: (status: string, answer: string | null) => void;
  onError: (message: string) => void;
};

type StreamEvent =
  | { type: "token"; text: string }
  | { type: "tool"; name: string; status: "started" | "completed" }
  | { type: "approval"; approvals: PendingApproval[] }
  | { type: "done"; status: string; answer: string | null }
  | { type: "error"; message: string };

function handleEvent(raw: string, handlers: StreamHandlers): boolean {
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) return false;

  let event: StreamEvent;

  try {
    event = JSON.parse(data) as StreamEvent;
  } catch {
    return false;
  }

  switch (event.type) {
    case "token":
      handlers.onToken(event.text);
      return false;
    case "tool":
      handlers.onTool(event.name, event.status);
      return false;
    case "approval":
      handlers.onApproval(event.approvals);
      return false;
    case "done":
      handlers.onDone(event.status, event.answer);
      return true;
    case "error":
      handlers.onError(event.message);
      return true;
    default:
      return false;
  }
}

export async function streamAgentChat(
  conversationId: number,
  message: string,
  documentIds: number[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/chat/stream`, {
    ...json({ conversation_id: conversationId, message, document_ids: documentIds }),
    signal,
  });

  if (!response.ok || !response.body) {
    await parse(response);
    throw new ApiError("Streaming failed", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf("\n\n");

      while (separator !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        if (handleEvent(frame, handlers)) {
          await reader.cancel();
          return;
        }

        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
