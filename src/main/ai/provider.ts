import type { Analysis, ModelChoice, ProviderId } from '@shared/types'
import { getApiKey, getSettings } from '../settings'
import { anthropicProvider } from './anthropic'
import { gatewayProvider } from './gateway'

export interface CaptureRequest {
  /** Unique per capture; matches results back up. [A-Za-z0-9_-], at most 64 chars. */
  id: string
  jpeg: Buffer
  context: string
}

export type BatchState = 'pending' | 'done' | 'failed'

export interface CaptureResult {
  id: string
  /** null when the model declined, failed, or returned something unparseable. */
  analysis: Analysis | null
  error?: string
}

export interface AiProvider {
  /** Submits captures as one batch request (50% cheaper than live calls). Returns an opaque handle. */
  submitCaptures(requests: CaptureRequest[]): Promise<string>
  batchState(handle: string): Promise<BatchState>
  batchResults(handle: string): AsyncIterable<CaptureResult>
  /** Hourly recaps use the capture model; the day summary uses the summary model. */
  summarize(system: string, prompt: string, slot: keyof ModelChoice): Promise<string>
  listModels(): Promise<string[]>
}

export class MissingKeyError extends Error {
  constructor(provider: ProviderId) {
    super(`No API key set for ${provider === 'gateway' ? 'Vercel AI Gateway' : 'Anthropic'}`)
  }
}

export function providerFor(id: ProviderId, models?: ModelChoice): AiProvider {
  const key = getApiKey(id)
  if (!key) throw new MissingKeyError(id)
  const choice = models ?? getSettings().models[id]
  return id === 'anthropic' ? anthropicProvider(key, choice) : gatewayProvider(key, choice)
}

export const activeProvider = (): AiProvider => providerFor(getSettings().provider)
