import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ModelChoice } from '@shared/types'
import { captureThinkingOff, supportsEffort, supportsFallbacks } from './models'
import { AnalysisSchema, CAPTURE_SYSTEM, parseAnalysis } from './prompts'
import type { AiProvider, CaptureRequest } from './provider'

export function anthropicProvider(apiKey: string, models: ModelChoice): AiProvider {
  const client = new Anthropic({ apiKey })

  const captureParams = ({ jpeg, context }: CaptureRequest): Anthropic.MessageCreateParamsNonStreaming => {
    const thinkingOff = captureThinkingOff(models.capture)
    return {
      model: models.capture,
      max_tokens: 1024,
      system: CAPTURE_SYSTEM,
      ...(thinkingOff ? { thinking: { type: thinkingOff } } : {}),
      output_config: {
        // Structured output guarantees schema-valid JSON; parsed below since batches don't auto-parse.
        format: zodOutputFormat(AnalysisSchema),
        ...(supportsEffort(models.capture) ? { effort: 'low' as const } : {})
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
            { type: 'text', text: context }
          ]
        }
      ]
    }
  }

  return {
    async submitCaptures(requests) {
      const batch = await client.messages.batches.create({
        requests: requests.map((r) => ({ custom_id: r.id, params: captureParams(r) }))
      })
      return batch.id
    },

    async batchState(handle) {
      const batch = await client.messages.batches.retrieve(handle)
      return batch.processing_status === 'ended' ? 'done' : 'pending'
    },

    async *batchResults(handle) {
      // Results arrive in any order; callers match on custom_id.
      for await (const item of await client.messages.batches.results(handle)) {
        const { result } = item
        if (result.type !== 'succeeded') {
          yield { id: item.custom_id, analysis: null, error: result.type }
          continue
        }
        if (result.message.stop_reason === 'refusal') {
          yield { id: item.custom_id, analysis: null, error: 'refused' }
          continue
        }
        const text = result.message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
        yield { id: item.custom_id, analysis: parseAnalysis(text) }
      }
    },

    async summarize(system, prompt, slot) {
      const model = models[slot]
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...(supportsEffort(model) ? { output_config: { effort: slot === 'capture' ? ('low' as const) : ('medium' as const) } } : {}),
        // Re-run on a fallback model if the summary model declines.
        ...(supportsFallbacks(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      })
      if (res.stop_reason === 'refusal') throw new Error('The model declined this request')
      return res.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('')
        .trim()
    },

    async listModels() {
      const ids: string[] = []
      for await (const m of client.models.list()) ids.push(m.id)
      return ids
    }
  }
}
