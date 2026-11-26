import AgentDetail from "@/components/agents/AgentDetail";

export default async function AgentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const value = Number(id);
  const agentId = Number.isSafeInteger(value) && value > 0 ? value : null;
  return <AgentDetail agentId={agentId} />;
}
