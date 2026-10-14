export const OPENAI = {
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  model: process.env.EXPO_PUBLIC_OPENAI_MODEL ?? '',
  reasoningEffort: process.env.EXPO_PUBLIC_OPENAI_REASONING_EFFORT || undefined,
};

export const LLM_ENABLED = OPENAI.apiKey !== '' && OPENAI.model !== '';
