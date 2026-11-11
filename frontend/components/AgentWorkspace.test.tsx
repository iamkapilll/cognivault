import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentWorkspace from "@/components/AgentWorkspace";
import type { streamAgentChat } from "@/lib/agent-api";
import type { ApiDocument } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  approveAgentAction: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  getDocuments: vi.fn(),
  listConversations: vi.fn(),
  push: vi.fn(),
  renameConversation: vi.fn(),
  replace: vi.fn(),
  streamAgentChat: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("c=17"),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/agent-api", () => ({
  approveAgentAction: mocks.approveAgentAction,
  createConversation: mocks.createConversation,
  deleteConversation: mocks.deleteConversation,
  getConversation: mocks.getConversation,
  getConversationMessages: mocks.getConversationMessages,
  listConversations: mocks.listConversations,
  renameConversation: mocks.renameConversation,
  streamAgentChat: mocks.streamAgentChat,
}));

vi.mock("@/lib/api", () => ({
  getDocuments: mocks.getDocuments,
  uploadDocumentWithProgress: vi.fn(),
}));

const conversation = {
  id: 17,
  thread_id: "thread-17",
  title: "Quarterly report",
  document_ids: [42],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  preview: null,
};

const attachedDocument: ApiDocument = {
  id: 42,
  filename: "quarterly-report.pdf",
  status: "completed",
  page_count: 3,
  extraction_method: "pymupdf",
  document_type: "general",
  review_status: "needs_review",
  index_status: "indexed",
  created_at: "2026-01-01T00:00:00Z",
};

describe("AgentWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mocks.getConversation.mockResolvedValue(conversation);
    mocks.getConversationMessages.mockResolvedValue({
      conversation_id: conversation.id,
      messages: [],
      pending_approvals: [],
    });
    mocks.getDocuments.mockResolvedValue([attachedDocument]);
    mocks.streamAgentChat.mockImplementation(
      async (...args: Parameters<typeof streamAgentChat>) => {
        args[3].onDone("completed", "Answer grounded in the attachment.");
      },
    );
  });

  afterEach(cleanup);

  it("restores owned attachments and sends their ids after reopening a chat", async () => {
    render(<AgentWorkspace />);

    expect(await screen.findByText(attachedDocument.filename)).toBeTruthy();
    expect(await screen.findByText("1 document in context")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Summarize the report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mocks.streamAgentChat).toHaveBeenCalled();
    });

    expect(mocks.streamAgentChat.mock.calls[0][2]).toEqual([attachedDocument.id]);
  });
});
