import type { EventCategory } from './types'
import { PILLAR_CATEGORIES } from './categories'

export interface ClassificationResult {
  valid: boolean
  category: EventCategory
  impact: number
  rationale: string
}

const CATEGORY_ENUM = [...PILLAR_CATEGORIES.map((c) => c.id), 'Other'] as const

const CATEGORY_GUIDE = PILLAR_CATEGORIES.map((c) => `- ${c.id}: ${c.description}`).join('\n')

const CLASSIFY_TOOL = {
  name: 'classify_headline',
  description: 'Classify a submitted headline for the Seldon Index wire.',
  input_schema: {
    type: 'object',
    properties: {
      valid: {
        type: 'boolean',
        description:
          'True if this reads as a plausible wire headline about American innovation, technology, science, energy, or tech policy across any of the six tracked sectors. False for spam, personal insults, off-topic submissions, or content with no real informational claim.',
      },
      category: {
        type: 'string',
        enum: CATEGORY_ENUM,
        description: `One of the six tracked sectors, or "Other" if it is on-topic but does not fit any sector:\n${CATEGORY_GUIDE}`,
      },
      impact: {
        type: 'integer',
        description:
          'Estimated impact on a national innovation index, from -10 (major setback) to 10 (major breakthrough). 0 if neutral or invalid.',
        minimum: -10,
        maximum: 10,
      },
      rationale: {
        type: 'string',
        description: 'One short clause, 15 words or fewer, explaining the classification.',
      },
    },
    required: ['valid', 'category', 'impact', 'rationale'],
  },
} as const

const SYSTEM_PROMPT =
  'You are the wire desk for a deadpan, Bloomberg-terminal-style "Seldon Index" tracking American innovation trajectory ' +
  'across six sectors: Technology & Statecraft, Artificial Intelligence, American Governance, Energy & Infrastructure, ' +
  'Science & Innovation, and Frontier Legal Defense (litigation and regulatory enforcement for or against frontier tech, ' +
  'not military defense). Classify submitted headlines with the classify_headline tool. Mark valid=false for spam, personal ' +
  'attacks, jokes with no real informational content, or anything with no plausible connection to American innovation, ' +
  'industry, or policy. A funny but on-topic fictional headline can still be valid=true. ' +
  'Be strict about validity, but do not be humorless about tone. ' +
  'In the rationale, never use an em dash; use a comma, colon, or period instead.'

interface AnthropicContentBlock {
  type: string
  input?: unknown
}

interface AnthropicMessageResponse {
  content: AnthropicContentBlock[]
}

function clampImpact(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(-10, Math.min(10, Math.round(n)))
}

function coerceCategory(value: unknown): EventCategory {
  return (CATEGORY_ENUM as readonly string[]).includes(value as string) ? (value as EventCategory) : 'Other'
}

export async function classifyHeadline(headline: string, apiKey: string): Promise<ClassificationResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_headline' },
      messages: [
        {
          role: 'user',
          content: `Classify this submitted wire headline: "${headline}"`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`classifier request failed: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as AnthropicMessageResponse
  const toolUse = data.content.find((block) => block.type === 'tool_use')
  if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
    throw new Error('classifier did not return a usable tool call')
  }

  const input = toolUse.input as Record<string, unknown>
  return {
    valid: input.valid === true,
    category: coerceCategory(input.category),
    impact: clampImpact(input.impact),
    rationale:
      typeof input.rationale === 'string' && input.rationale.trim()
        ? input.rationale.trim().replace(/[—–]/g, ',').slice(0, 200)
        : 'no rationale provided',
  }
}
