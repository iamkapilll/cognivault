import { Cpu, SlidersHorizontal, Wrench } from "lucide-react";

import type {
  AgentModelMetadata,
  AgentProviderMetadata,
} from "@/types/agents";

type Props = {
  providers: AgentProviderMetadata[];
  provider: string;
  model: string;
  temperature: number;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temperature: number) => void;
};

export function selectedModel(
  providers: AgentProviderMetadata[],
  provider: string,
  model: string,
): AgentModelMetadata | undefined {
  return providers
    .find((item) => item.provider === provider)
    ?.models.find((item) => item.model_name === model);
}

export default function ModelSelector({
  providers,
  provider,
  model,
  temperature,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
}: Props) {
  const selectedProvider = providers.find((item) => item.provider === provider);
  const currentModel = selectedModel(providers, provider, model);

  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="model-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong">
          <Cpu size={17} />
        </span>
        <div>
          <h2 id="model-title" className="text-sm font-semibold text-foreground">
            Model configuration
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-strong">
            Choose a server-enabled provider and its supported model.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted-strong">
          Model provider
          <select
            aria-label="Model provider"
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="control-input mt-2 h-10 w-full rounded-xl px-3 text-sm"
          >
            {providers.map((item) => (
              <option key={item.provider} value={item.provider} disabled={!item.available}>
                {item.display_name}{item.available ? "" : " · unavailable"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-strong">
          Model
          <select
            aria-label="Model"
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={!selectedProvider?.available || !selectedProvider.models.length}
            className="control-input mt-2 h-10 w-full rounded-xl px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedProvider?.models.map((item) => (
              <option key={item.model_name} value={item.model_name}>
                {item.model_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProvider && !selectedProvider.available && (
        <p role="status" className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-strong">
          This provider is not configured on the server. Ask an administrator to enable it before saving or running this agent.
        </p>
      )}

      <div className="mt-5 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="agent-temperature" className="flex items-center gap-2 text-xs font-medium text-muted-strong">
            <SlidersHorizontal size={14} /> Temperature
          </label>
          <output htmlFor="agent-temperature" className="font-mono text-xs text-foreground">
            {temperature.toFixed(2)}
          </output>
        </div>
        <input
          id="agent-temperature"
          aria-label="Temperature"
          type="range"
          min={currentModel?.temperature_min ?? 0}
          max={currentModel?.temperature_max ?? 2}
          step="0.01"
          value={temperature}
          onChange={(event) => onTemperatureChange(Number(event.target.value))}
          className="mt-4 w-full accent-[var(--foreground)]"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>{(currentModel?.temperature_min ?? 0).toFixed(1)} · focused</span>
          <span>{(currentModel?.temperature_max ?? 2).toFixed(1)} · creative</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-strong">
            <Wrench size={12} />
            {currentModel?.supports_tool_calling ? "Tool calling supported" : "No tool calling"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-strong">
            <Cpu size={12} />
            {selectedProvider?.availability_status === "available" ? "Provider ready" : "Server setup required"}
          </span>
        </div>
      </div>
    </section>
  );
}
