import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Sidebar from "@/components/Sidebar";

const mocks = vi.hoisted(() => ({ listConversations: vi.fn(), pathname: "/agents/14/edit" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/AuthGuard", () => ({ useAuth: () => ({ user: { email: "owner@example.test" } }) }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-api", () => ({ logoutUser: vi.fn() }));
vi.mock("@/lib/agent-api", () => ({ listConversations: mocks.listConversations, deleteConversation: vi.fn() }));

describe("workspace navigation", () => {
  afterEach(cleanup);

  it("adds My Agents and highlights nested agent routes without selecting legacy chat", async () => {
    mocks.pathname = "/agents/14/edit";
    mocks.listConversations.mockResolvedValue([]);
    render(<Sidebar />);

    const agentsLink = screen.getByRole("link", { name: "My Agents" });
    expect(agentsLink.getAttribute("href")).toBe("/agents");
    expect(agentsLink.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "AI Workspace" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Documents" }).getAttribute("href")).toBe("/");
  });
});
