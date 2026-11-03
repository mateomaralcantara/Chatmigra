// Shape of the Gemini generateContent / streamGenerateContent responses we read.
// Every field is optional: upstream answers are untrusted input.

export interface GeminiPart {
  text?: unknown;
}

export interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { totalTokenCount?: number };
  name?: unknown;
  raw?: string;
}

/** Concatenates the text parts of a candidate, ignoring non-text parts. */
export function candidateText(candidate: GeminiCandidate | undefined): string {
  const parts = candidate?.content?.parts;
  return Array.isArray(parts)
    ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
    : '';
}
