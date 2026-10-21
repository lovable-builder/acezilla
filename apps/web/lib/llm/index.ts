import "server-only";
import { LlmError, type LlmProvider } from "@acezilla/llm";
import { aiStudioProvider } from "./aistudio";
import { vertexProvider } from "./vertex";

/**
 * The live backend, chosen by LLM_PROVIDER: "vertex" (default) or "aistudio". Call sites only see the LlmProvider
 * interface, so switching is an environment change, not a code change.
 */
export function getLlm(): LlmProvider {
  const which = (process.env.LLM_PROVIDER || "vertex").toLowerCase();
  if (which === "vertex") return vertexProvider;
  if (which === "aistudio") return aiStudioProvider;
  throw new LlmError("config", `LLM_PROVIDER must be "vertex" or "aistudio", not "${which.slice(0, 20)}".`);
}
export { LlmError, type LlmErrorKind } from "@acezilla/llm";
