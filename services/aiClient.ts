// services/aiClient.ts  (NEW)
// One place that decides how the app talks to the AI provider.
//  - EXPO_PUBLIC_AI_USE_PROXY not "true": old behaviour (direct call with the key in the app).
//  - EXPO_PUBLIC_AI_USE_PROXY="true": calls the "ai-proxy" Supabase Edge Function. No provider key in the app.
// Call sites keep using generateContent(...) and result.response.text() exactly as before.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase';

export type AiOperation = 'help' | 'scan' | 'insight' | 'coach' | 'pacing';
type Part = string | { inlineData: { data: string; mimeType: string } };
type ModelParams = { model: string; generationConfig?: Record<string, unknown> };
type AiResult = { response: { text: () => string } };
type AiModel = { generateContent: (input: Part | Part[]) => Promise<AiResult> };

const USE_PROXY = process.env.EXPO_PUBLIC_AI_USE_PROXY === 'true';

export function getAiModel(operation: AiOperation, params: ModelParams): AiModel {
  if (!USE_PROXY) {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('AI is not configured.');
    return new GoogleGenerativeAI(apiKey).getGenerativeModel(params as any) as unknown as AiModel;
  }

  return {
    async generateContent(input) {
      const parts = (Array.isArray(input) ? input : [input]).map((p) => (typeof p === 'string' ? { text: p } : p));
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          operation,
          model: params.model,
          contents: [{ role: 'user', parts }],
          generationConfig: params.generationConfig,
        },
      });
      if (error) {
        let message = 'The AI service is unavailable right now.';
        try {
          const body = await (error as any).context.json();
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        throw new Error(message);
      }
      const text = (data as { text?: string } | null)?.text ?? '';
      return { response: { text: () => text } };
    },
  };
}
