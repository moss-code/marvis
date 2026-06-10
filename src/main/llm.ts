import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

/** 国内模型走 OpenAI 兼容接口，.env 配置：OPENAI_BASE_URL / OPENAI_API_KEY / MODEL */
export function getModel(): LanguageModel {
  const baseURL = process.env.OPENAI_BASE_URL
  const apiKey = process.env.OPENAI_API_KEY
  if (!baseURL || !apiKey) {
    throw new Error('未配置模型：请在项目根目录 .env 中填写 OPENAI_BASE_URL 与 OPENAI_API_KEY')
  }
  const provider = createOpenAICompatible({ name: 'cn-llm', baseURL, apiKey })
  return provider(process.env.MODEL ?? 'deepseek-chat')
}
