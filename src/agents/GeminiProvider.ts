import type { HttpAgentConfig } from "./AgentProvider";
import { HttpJsonAgentProvider } from "./HttpJsonAgentProvider";

export class GeminiProvider extends HttpJsonAgentProvider {
  public readonly id = "gemini" as const;

  public constructor(config: HttpAgentConfig) {
    super(config);
  }

  protected override buildRequestBody(prompt: string): unknown {
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
  }
}
