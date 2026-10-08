// Per-model API quirks, keyed by Anthropic model ID ("claude-haiku-5-5").

/** Gateway IDs look like "anthropic/claude-haiku-5.5"; returns the Anthropic-style ID, or null if not Claude. */
export function claudeIdFromGateway(id: string): string | null {
  return id.startsWith('anthropic/') ? id.slice('anthropic/'.length).replace(/\./g, '-') : null
}

/** Models that accept output_config.effort (Haiku 4.5 and older models reject it). */
export const supportsEffort = (model: string): boolean =>
  /^claude-(fable|mythos)-|^claude-(opus|sonnet|haiku)-5|^claude-opus-4-[5-9]|^claude-sonnet-4-6/.test(model)

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
export const supportsFallbacks = (model: string): boolean =>
  ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'].includes(model)

/**
 * How to turn thinking off for screenshot captures, which don't need reasoning.
 * - 'disabled': `thinking: { type: 'disabled' }` (fine at low effort)
 * - 'between_tools': Sonnet 5.5's thinking-off mode (`disabled` is a 400 there)
 * - null: thinking can't be turned off (Fable, Opus 5.5) or is already off by default;
 *   send nothing and rely on low effort.
 */
export function captureThinkingOff(model: string): 'disabled' | 'between_tools' | null {
  if (/^claude-(fable|mythos)-/.test(model) || model.startsWith('claude-opus-5-5')) return null
  if (model.startsWith('claude-sonnet-5-5')) return 'between_tools'
  if (/^claude-(haiku-4|3)/.test(model)) return null
  return 'disabled'
}
