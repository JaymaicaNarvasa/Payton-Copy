import { supabase } from '@/lib/supabase'; // Adjust path to your Supabase client

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export interface PacingInsightResult {
  pacingStatus: 'ON_TRACK' | 'WARNING' | 'CRITICAL';
  safeDailyLimit: number;
  projectedRunwayDays: number;
  insightSummary: string;
  actionableTip: string;
}

export async function fetchSpenderPacingInsight(userId: string): Promise<PacingInsightResult> {
  // 1. Fetch pre-calculated Postgres JSON
  const { data: metrics, error } = await supabase.rpc('get_spender_pacing_data', {
    p_spender_id: userId,
  });

  if (error || !metrics || !metrics.has_active_allowance) {
    throw new Error('No active allowance found to generate pacing insights.');
  }

  const schema = {
  type: SchemaType.OBJECT,
  properties: {
    pacingStatus: {
      type: SchemaType.STRING,
      enum: ['ON_TRACK', 'WARNING', 'CRITICAL'],
    },
    safeDailyLimit: { type: SchemaType.NUMBER },
    projectedRunwayDays: { type: SchemaType.NUMBER },
    insightSummary: { type: SchemaType.STRING },
    actionableTip: { type: SchemaType.STRING },
  },
  required: [
    'pacingStatus',
    'safeDailyLimit',
    'projectedRunwayDays',
    'insightSummary',
    'actionableTip',
  ],
};

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: schema as any,
  },
});

  const prompt = `
    You are a personal finance AI for a student/spender. Analyze these financial metrics:
    ${JSON.stringify(metrics)}

    Instructions:
    1. Determine "pacingStatus":
       - "ON_TRACK" if current_daily_avg <= safe_daily_limit
       - "WARNING" if current_daily_avg is 1% to 30% over safe_daily_limit
       - "CRITICAL" if current_daily_avg > 30% over safe_daily_limit or remaining_balance <= 0
    2. Set "safeDailyLimit" to the safe_daily_limit value from input.
    3. Calculate "projectedRunwayDays": remaining_balance / current_daily_avg (rounded to 1 decimal place).
    4. Write a concise "insightSummary" (max 2 sentences) describing their burn rate.
    5. Provide one specific "actionableTip" considering their top_spending_category and pending_reminders.
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  return JSON.parse(responseText) as PacingInsightResult;
}