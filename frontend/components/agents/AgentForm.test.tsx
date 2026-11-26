import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentForm from "@/components/agents/AgentForm";

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  getAgent: vi.fn(),
  getAgentConfigurationMetadata: vi.fn(),
  push: vi.fn(),
  routerPush: vi.fn(),
  updateAgent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.routerPush }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/lib/api/agents", () => ({
  createAgent: mocks.createAgent,
  getAgent: mocks.getAgent,
  getAgentConfigurationMetadata: mocks.getAgentConfigurationMetadata,
  updateAgent: mocks.updateAgent,
}));

const metadata = {
  providers: [
    { provider: "groq", display_name: "Groq", available: true, availability_status: "available", models: [{ model_name: "openai/gpt-oss-20b", supports_tool_calling: true, temperature_min: 0, temperature_max: 2 }] },
    { provider: "anthropic", display_name: "Anthropic", available: true, availability_status: "available", models: [{ model_name: "claude-haiku-4-5-20251001", supports_tool_calling: true, temperature_min: 0, temperature_max: 1 }] },
    { provider: "openai", display_name: "OpenAI", available: false, availability_status: "missing_configuration", models: [{ model_name: "gpt-5.6-sol", supports_tool_calling: true, temperature_min: 0, temperature_max: 2 }] },
  ],
  tools: [
    { name: "search_documents", display_name: "Search documents", description: "Search owned files", category: "knowledge_retrieval", risk_level: "low", effect: "read_only", requires_authenticated_user: true, requires_human_approval: false, requires_memory: false, available: true, availability_status: "available" },
    { name: "search_web", display_name: "Search the web", description: "Search current web sources", category: "web_research", risk_level: "medium", effect: "read_only", requires_authenticated_user: true, requires_human_approval: false, requires_memory: false, available: true, availability_status: "available" },
    { name: "generate_research_report", display_name: "Generate a research report", description: "Create a report from findings", category: "web_research", risk_level: "high", effect: "read_only", requires_authenticated_user: true, requires_human_approval: true, requires_memory: true, available: true, availability_status: "available" },
    { name: "delete_document", display_name: "Delete a document", description: "Permanently remove a file", category: "document_management", risk_level: "destructive", effect: "side_effecting", requires_authenticated_user: true, requires_human_approval: true, requires_memory: true, available: true, availability_status: "available" },
  ],
  default_model_provider: "groq",
  default_model_name: "openai/gpt-oss-20b",
  default_temperature: 0.2,
};

const savedAgent = {
  id: 12,
  user_id: 8,
  name: "Saved analyst",
  description: "Review internal reports",
  system_prompt: "Use owned project documents as evidence.",
  model_provider: "groq",
  model_name: "openai/gpt-oss-20b",
  temperature: 0.4,
  enabled_tools: ["search_documents"],
  memory_enabled: true,
  human_approval_required: false,
  is_active: true,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-02T00:00:00Z",
};

describe("AgentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAgentConfigurationMetadata.mockResolvedValue(metadata);
    mocks.getAgent.mockResolvedValue(savedAgent);
    mocks.createAgent.mockResolvedValue({ ...savedAgent, id: 19, name: "New research partner" });
    mocks.updateAgent.mockImplementation(async (_id: number, payload: object) => ({ ...savedAgent, ...payload }));
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("validates required fields before making a create request", async () => {
    render(<AgentForm mode="create" />);
    await screen.findByLabelText("Agent name");

    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    expect(await screen.findByText("Enter an agent name.")).toBeTruthy();
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("uses live metadata to populate a safe research template", async () => {
    render(<AgentForm mode="create" />);
    fireEvent.click(await screen.findByRole("button", { name: /Research Assistant/ }));

    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("Research Assistant");
    expect((screen.getByRole("checkbox", { name: "Enable Search the web" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Enable Generate a research report" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Enable Delete a document" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Enable persistent memory" }) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps memory enabled when a tool requires a durable approval checkpoint", async () => {
    render(<AgentForm mode="create" />);
    const deleteTool = await screen.findByRole("checkbox", { name: "Enable Delete a document" });
    fireEvent.click(deleteTool);

    const memory = screen.getByRole("checkbox", { name: "Enable persistent memory" }) as HTMLInputElement;
    expect(memory.checked).toBe(true);
    expect(memory.disabled).toBe(true);
    expect(screen.getByText(/backend requires a durable conversation checkpoint/i)).toBeTruthy();
    expect(screen.getAllByText("Approval required").length).toBeGreaterThan(0);
  });

  it("changes model options and temperature range with the selected provider", async () => {
    render(<AgentForm mode="create" />);
    await screen.findByLabelText("Agent name");

    fireEvent.change(screen.getByRole("combobox", { name: "Model provider" }), { target: { value: "anthropic" } });
    expect((screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement).value).toBe("claude-haiku-4-5-20251001");
    expect((screen.getByRole("slider", { name: "Temperature" }) as HTMLInputElement).max).toBe("1");
    expect(screen.getByText("Anthropic")).toBeTruthy();
  });

  it("creates an agent through the backend contract and navigates to its details", async () => {
    render(<AgentForm mode="create" />);
    fireEvent.change(await screen.findByLabelText("Agent name"), { target: { value: " New research partner " } });
    fireEvent.change(screen.getByLabelText("Agent description"), { target: { value: "Compare evidence" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => expect(mocks.createAgent).toHaveBeenCalledTimes(1));
    const payload = mocks.createAgent.mock.calls[0][0];
    expect(payload.name).toBe("New research partner");
    expect(payload.description).toBe("Compare evidence");
    expect(payload.model_provider).toBe("groq");
    expect(payload.enabled_tools).toEqual([]);
    expect(payload).not.toHaveProperty("user_id");
    expect(mocks.routerPush).toHaveBeenCalledWith("/agents/19");
  });

  it("loads and saves an existing agent without replacing its other settings", async () => {
    render(<AgentForm mode="edit" agentId={savedAgent.id} />);
    const name = await screen.findByLabelText("Agent name");
    expect((name as HTMLInputElement).value).toBe("Saved analyst");
    fireEvent.change(name, { target: { value: "Updated analyst" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateAgent).toHaveBeenCalledWith(savedAgent.id, expect.objectContaining({ name: "Updated analyst", enabled_tools: ["search_documents"], memory_enabled: true })));
    expect(mocks.routerPush).toHaveBeenCalledWith(`/agents/${savedAgent.id}`);
  });
});
