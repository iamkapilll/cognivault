import AgentCard from "@/components/agents/AgentCard";
import type {
  AgentConfiguration,
  AgentConfigurationMetadata,
} from "@/types/agents";

type Props = {
  agents: AgentConfiguration[];
  metadata: AgentConfigurationMetadata;
  busyAgentId: number | null;
  onToggle: (agent: AgentConfiguration) => void;
  onDelete: (agent: AgentConfiguration) => void;
};

export default function AgentGrid({
  agents,
  metadata,
  busyAgentId,
  onToggle,
  onDelete,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          metadata={metadata}
          busy={busyAgentId === agent.id}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
