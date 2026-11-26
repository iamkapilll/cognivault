import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentDashboard from "@/components/agents/AgentDashboard";

const mocks = vi.hoisted(() => ({
  deleteAgent: vi.fn(),
  getAgentConfigurationMetadata: vi.fn(),
  listAgents: vi.fn(),
  push: vi.fn(),
  updateAgent: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.push }) }));

vi.mock("@/lib/api/agents", () => ({
  deleteAgent: mocks.deleteAgent,
  getAgentConfigurationMetadata: mocks.getAgentConfigurationMetadata,
  listAgents: mocks.listAgents,
  updateAgent: mocks.updateAgent,
}));

const metadata = {
  providers: [
    { provider: "groq", display_name: "Groq", available: true, availability_status: "available", models: [{ model_name: "openai/gpt-oss-20b", supports_tool_calling: true, temperature_min: 0, temperature_max: 2 }] },
    { provider: "openai", display_name: "OpenAI", available: false, availability_status: "missing_configuration", models: [{ model_name: "gpt-5.6-sol", supports_tool_calling: true, temperature_min: 0, temperature_max: 2 }] },
  ],
  tools: [{ name: "search_documents", display_name: "Search documents", description: "Search owned files", category: "knowledge_retrieval", risk_level: "low", effect: "read_only", requires_authenticated_user: true, requires_human_approval: false, requires_memory: false, available: true, availability_status: "available" }],
  default_model_provider: "groq",
  default_model_name: "openai/gpt-oss-20b",
  default_temperature: 0.2,
};

const agent = {
  id: 7,
  user_id: 3,
  name: "Research desk",
  description: "Evidence from project files",
  system_prompt: "Use evidence.",
  model_provider: "groq",
  model_name: "openai/gpt-oss-20b",
  temperature: 0.3,
  enabled_tools: ["search_documents"],
  memory_enabled: true,
  human_approval_required: false,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("AgentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mocks.listAgents.mockResolvedValue([agent]);
    mocks.getAgentConfigurationMetadata.mockResolvedValue(metadata);
    mocks.updateAgent.mockImplementation(async (_id: number, change: object) => ({ ...agent, ...change }));
    mocks.deleteAgent.mockResolvedValue(undefined);
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  });

  afterEach(cleanup);

  it("loads real agent data, filters it, and refreshes from the API", async () => {
    render(<AgentDashboard />);

    expect(await screen.findByRole("heading", { name: "Research desk" })).toBeTruthy();
    expect(screen.getByText("Evidence from project files")).toBeTruthy();
    expect(screen.getByText(/openai\/gpt-oss-20b/)).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search agents" }), { target: { value: "missing" } });
    expect(await screen.findByText("No matching agents")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("heading", { name: "Research desk" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh agents" }));
    await waitFor(() => expect(mocks.listAgents).toHaveBeenCalledTimes(2));
  });

  it("requires explicit confirmation before deleting an agent", async () => {
    render(<AgentDashboard />);
    await screen.findByRole("heading", { name: "Research desk" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Research desk" }));
    expect(screen.getByRole("alertdialog", { name: "Delete Research desk?" })).toBeTruthy();
    expect(screen.getByText(/conversations, approval records, and checkpoint history/i)).toBeTruthy();
    expect(mocks.deleteAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    await waitFor(() => expect(mocks.deleteAgent).toHaveBeenCalledWith(agent.id));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Research desk" })).toBeNull());
  });

  it("updates the active state through the real partial-update contract", async () => {
    render(<AgentDashboard />);
    await screen.findByRole("heading", { name: "Research desk" });

    fireEvent.click(screen.getByRole("button", { name: "Deactivate Research desk" }));
    await waitFor(() => expect(mocks.updateAgent).toHaveBeenCalledWith(agent.id, { is_active: false }));
    expect(await screen.findByRole("button", { name: "Activate Research desk" })).toBeTruthy();
  });

  it("shows an honest empty state when the user has no agents", async () => {
    mocks.listAgents.mockResolvedValue([]);
    render(<AgentDashboard />);

    expect(await screen.findByRole("heading", { name: "Start with your first agent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create your first agent" }).getAttribute("href")).toBe("/agents/new");
  });

  it("shows a loading skeleton until the real collection request settles", async () => {
    let resolveAgents: (items: typeof agent[]) => void = () => {};
    mocks.listAgents.mockReturnValueOnce(new Promise((resolve) => { resolveAgents = resolve; }));
    render(<AgentDashboard />);

    expect(screen.getByLabelText("Loading agents")).toBeTruthy();
    resolveAgents([agent]);
    expect(await screen.findByRole("heading", { name: "Research desk" })).toBeTruthy();
  });
});
