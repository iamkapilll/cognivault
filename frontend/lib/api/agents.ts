import { API_BASE, ApiError, notifyUnauthorized } from "@/lib/api";
import type {
  AgentConfiguration,
  AgentConfigurationMetadata,
  AgentPayload,
  AgentUpdatePayload,
} from "@/types/agents";

type AgentListResponse = { agents: AgentConfiguration[]; total: number };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : response.status === 401
          ? "Your session expired. Please sign in again."
          : `Request failed (${response.status})`;

    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function listAgents(): Promise<AgentConfiguration[]> {
  const response = await request<AgentListResponse>("/agents");
  return response.agents;
}

export function getAgentConfigurationMetadata(): Promise<AgentConfigurationMetadata> {
  return request<AgentConfigurationMetadata>("/agents/metadata");
}

export function getAgent(id: number): Promise<AgentConfiguration> {
  return request<AgentConfiguration>(`/agents/${id}`);
}

export function createAgent(payload: AgentPayload): Promise<AgentConfiguration> {
  return request<AgentConfiguration>("/agents", jsonRequest("POST", payload));
}

export function updateAgent(
  id: number,
  payload: AgentUpdatePayload,
): Promise<AgentConfiguration> {
  return request<AgentConfiguration>(
    `/agents/${id}`,
    jsonRequest("PATCH", payload),
  );
}

export function deleteAgent(id: number): Promise<void> {
  return request<void>(`/agents/${id}`, { method: "DELETE" });
}
