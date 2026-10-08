import { createGateway } from '@ai-sdk/gateway'
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
  generateText,
  type Experimental_BatchReference as BatchReference
} from 'ai'
import type { ModelChoice } from '@shared/types'
import { captureThinkingOff, claudeIdFromGateway } from './models'
import { CAPTURE_SYSTEM, parseAnalysis } from './prompts'
import type { AiProvider } from './provider'

/** Thinking off where the model allows it; otherwise the lowest reasoning level. */
function captureReasoning(modelId: string): 'none' | 'low' {
  const claude = claudeIdFromGateway(modelId)
  if (!claude) return 'none'
  return captureThinkingOff(claude) === 'disabled' ? 'none' : 'low'
}

export function gatewayProvider(apiKey: string, models: ModelChoice): AiProvider {
  const gateway = createGateway({ apiKey })
  const batches = gateway.experimental_batch()

  return {
    async submitCaptures(requests) {
      const batch = await startBatch({
        provider: batches,
        requests: requests.map(({ id, jpeg, context }) => ({
          id,
          type: 'text' as const,
          model: models.capture,
          system: CAPTURE_SYSTEM,
          maxOutputTokens: 1024,
          reasoning: captureReasoning(models.capture),
          messages: [
            {
              role: 'user' as const,
              content: [
                { type: 'image' as const, image: jpeg, mediaType: 'image/jpeg' },
                { type: 'text' as const, text: context }
              ]
            }
          ]
        }))
      })
      const ref: BatchReference = { version: batch.version, id: batch.id, provider: batch.provider }
      return JSON.stringify(ref)
    },

    async batchState(handle) {
      const { status } = await getBatchStatus({ provider: batches, batch: JSON.parse(handle) as BatchReference })
      return status === 'completed' ? 'done' : status === 'failed' ? 'failed' : 'pending'
    },

    async *batchResults(handle) {
      for await (const item of getBatchResults({ provider: batches, batch: JSON.parse(handle) as BatchReference })) {
        if (item.type !== 'text') continue
        if (item.status !== 'succeeded') {
          yield { id: item.id, analysis: null, error: item.status }
          continue
        }
        yield { id: item.id, analysis: parseAnalysis(item.text) }
      }
    },

    async summarize(system, prompt, slot) {
      const { text } = await generateText({ model: gateway(models[slot]), system, prompt })
      return text.trim()
    },

    async listModels() {
      const { models: entries } = await gateway.getAvailableModels()
      return entries.filter((m) => !m.modelType || m.modelType === 'language').map((m) => m.id)
    }
  }
}
