export type AgentConfiguration = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  system_prompt: string;
  model_provider: string;
  model_name: string;
  temperature: number;
  enabled_tools: string[];
  memory_enabled: boolean;
  human_approval_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentPayload = Omit<
  AgentConfiguration,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type AgentUpdatePayload = Partial<AgentPayload>;

export type AgentModelMetadata = {
  model_name: string;
  supports_tool_calling: boolean;
  temperature_min: number;
  temperature_max: number;
};

export type AgentProviderMetadata = {
  provider: string;
  display_name: string;
  available: boolean;
  availability_status: "available" | "missing_configuration";
  models: AgentModelMetadata[];
};

export type AgentToolMetadata = {
  name: string;
  display_name: string;
  description: string;
  category: string;
  risk_level: string;
  effect: "read_only" | "side_effecting" | string;
  requires_authenticated_user: boolean;
  requires_human_approval: boolean;
  requires_memory: boolean;
  available: boolean;
  availability_status:
    | "available"
    | "missing_configuration"
    | "approval_unavailable"
    | "disabled";
};

export type AgentConfigurationMetadata = {
  providers: AgentProviderMetadata[];
  tools: AgentToolMetadata[];
  default_model_provider: string;
  default_model_name: string;
  default_temperature: number;
};
