import type { AgentProvider } from "../agents/AgentProvider";
import type { FlowChangePlan } from "../models/flowChange";
import type { ProductFlow } from "../models/productFlow";
import { validateFlowChangePlan } from "../models/flowChange";

export async function proposeValidatedFlowChange(
  provider: AgentProvider,
  flow: ProductFlow,
  instruction: string,
  selectedNodeId?: string
): Promise<FlowChangePlan> {
  const plan = await provider.proposeFlowChanges({ flow, instruction, selectedNodeId });
  const validation = validateFlowChangePlan(plan);
  if (!validation.valid) {
    throw new Error(`Invalid FlowChangePlan:\n${validation.errors.join("\n")}`);
  }
  return plan;
}
