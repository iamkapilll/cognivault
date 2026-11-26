import AgentForm from "@/components/agents/AgentForm";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const value = Number(id);
  const agentId = Number.isSafeInteger(value) && value > 0 ? value : null;
  return <AgentForm mode="edit" agentId={agentId ?? undefined} />;
}
