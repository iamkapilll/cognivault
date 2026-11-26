import { afterEach, describe, expect, it, vi } from "vitest";

import { getAgent, listAgents } from "@/lib/api/agents";

describe("agent API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the same-origin proxy with cookie credentials and returns the backend list shape", async () => {
    const agent = { id: 1, name: "Real agent" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agents: [agent], total: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAgents()).resolves.toEqual([agent]);
    expect(fetchMock).toHaveBeenCalledWith("/backend/agents", expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
    }));
  });

  it("notifies the authentication guard on a 401 without storing or forwarding a token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Session expired" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const unauthorized = vi.fn();
    window.addEventListener("cognivault:unauthorized", unauthorized);

    await expect(getAgent(2)).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("headers.Authorization");

    window.removeEventListener("cognivault:unauthorized", unauthorized);
  });

  it.each([403, 404, 409, 422, 500])("preserves backend status %i for the form error handler", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: `Error ${status}` }), { status }),
    ));

    await expect(getAgent(3)).rejects.toMatchObject({
      name: "ApiError",
      status,
      message: `Error ${status}`,
    });
  });
});
