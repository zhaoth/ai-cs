import { useModelsStore } from '@/stores/models'

// AI API 响应数据类型
export interface ApiResponse {
  choices?: Array<{
    message?: {
      content: string
    }
    delta?: {
      content?: string
    }
  }>
  content?: Array<{
    text: string
  }>
}

// 流式响应数据类型
export interface StreamResponse {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
  delta?: {
    text?: string
  }
  content_block?: {
    text?: string
  }
}

// AI API 配置接口
export interface ApiConfig {
  endpoint: string
  model: string
  headers: Record<string, string>
  requestTransformer?: (
    messages: Array<{ role: string; content: string }>,
    config: ApiRequestConfig,
  ) => Record<string, unknown>
  responseTransformer?: (data: ApiResponse) => string
  streamResponseTransformer?: (chunk: StreamResponse) => string | null
}

// API 请求配置
export interface ApiRequestConfig {
  temperature?: number
  maxTokens?: number
  stream?: boolean
  systemMessage?: string
  onStreamChunk?: (chunk: string) => void // 新增：流式数据回调
}

// 默认请求配置
const DEFAULT_CONFIG: ApiRequestConfig = {
  temperature: 0.7,
  maxTokens: 1000,
  stream: true,
}

// API 提供商抽象基类
abstract class BaseApiProvider {
  protected config: ApiConfig
  protected modelsStore = useModelsStore()

  constructor(config: ApiConfig) {
    this.config = config
  }

  // 获取 API 密钥
  protected abstract getApiKey(): string

  // 构建请求头
  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...this.getAuthHeaders(apiKey),
    }
  }

  // 获取认证头（子类实现）
  protected abstract getAuthHeaders(apiKey: string): Record<string, string>

  // 构建请求体
  protected buildRequestBody(
    messages: Array<{ role: string; content: string }>,
    config: ApiRequestConfig,
  ): Record<string, unknown> {
    const requestConfig = { ...DEFAULT_CONFIG, ...config }

    if (this.config.requestTransformer) {
      return this.config.requestTransformer(messages, requestConfig)
    }

    return {
      model: this.config.model,
      messages,
      temperature: requestConfig.temperature,
      max_tokens: requestConfig.maxTokens,
      stream: requestConfig.stream,
    }
  }

  // 处理流式响应
  protected async processStreamResponse(
    response: Response,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应数据流')
    }

    let fullContent = ''
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              break
            }
            try {
              const parsed = JSON.parse(data)
              const content = this.config.streamResponseTransformer
                ? this.config.streamResponseTransformer(parsed)
                : this.extractStreamContent(parsed)

              if (content) {
                fullContent += content
                // 实时回调每个数据块
                if (onChunk) {
                  onChunk(content)
                }
              }
            } catch {
              // 忽略解析错误的数据块
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return fullContent
  }

  // 提取流式内容（子类可重写）
  protected extractStreamContent(parsed: StreamResponse): string | null {
    return parsed.choices?.[0]?.delta?.content || null
  }

  // 处理非流式响应
  protected processResponse(data: ApiResponse): string {
    if (this.config.responseTransformer) {
      return this.config.responseTransformer(data)
    }
    return data.choices?.[0]?.message?.content || '抱歉，我无法回复您的消息。'
  }

  // 主要调用方法
  async call(
    messages: Array<{ role: string; content: string }>,
    config: ApiRequestConfig = {},
  ): Promise<string> {
    const apiKey = this.getApiKey()
    const requestBody = this.buildRequestBody(messages, config)
    const headers = this.buildHeaders(apiKey)

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          `API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
        )
      }

      // 根据是否启用流式处理选择不同的处理方式
      if (config.stream !== false) {
        return await this.processStreamResponse(response, config.onStreamChunk)
      } else {
        const data = await response.json()
        return this.processResponse(data)
      }
    } catch (error) {
      console.error(`${this.constructor.name} API 调用失败:`, error)
      throw new Error(
        `${this.constructor.name} API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      )
    }
  }
}

// Kimi API 提供商
export class KimiApiProvider extends BaseApiProvider {
  constructor() {
    super({
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      model: 'moonshot-v1-8k', // 使用最新的稳定模型
      headers: {},
    })
  }

  protected getApiKey(): string {
    const apiKey = this.modelsStore.getApiKey('Moonshot')
    if (!apiKey) {
      throw new Error('Kimi API Key 未配置，请在模型设置中添加API密钥')
    }
    return apiKey
  }

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
    }
  }
}

// DeepSeek API 提供商
export class DeepSeekApiProvider extends BaseApiProvider {
  constructor() {
    super({
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      headers: {},
    })
  }

  protected getApiKey(): string {
    const apiKey = this.modelsStore.getApiKey('DeepSeek')
    if (!apiKey) {
      throw new Error('DeepSeek API Key 未配置，请在模型设置中添加API密钥')
    }
    return apiKey
  }

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
    }
  }
}

// OpenAI API 提供商 - 已移除
// export class OpenAiApiProvider extends BaseApiProvider { ... }

// Claude API 提供商 - 已移除
// export class ClaudeApiProvider extends BaseApiProvider { ... }

// API 提供商工厂
export class ApiProviderFactory {
  private static providers: Map<string, BaseApiProvider> = new Map()

  static getProvider(modelId: string): BaseApiProvider {
    if (!this.providers.has(modelId)) {
      this.providers.set(modelId, this.createProvider(modelId))
    }
    return this.providers.get(modelId)!
  }

  private static createProvider(modelId: string): BaseApiProvider {
    switch (modelId) {
      case 'kimi':
        return new KimiApiProvider()
      case 'deepseek-v3.1':
        return new DeepSeekApiProvider()
      default:
        throw new Error(`不支持的模型: ${modelId}，只支持 kimi 和 deepseek-v3.1`)
    }
  }

  // 清空缓存（用于测试或重新配置）
  static clearCache(): void {
    this.providers.clear()
  }
}

// 统一的 AI API 调用入口
export async function callUnifiedAiApi(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  config: ApiRequestConfig = {},
): Promise<string> {
  try {
    const provider = ApiProviderFactory.getProvider(modelId)
    return await provider.call(messages, config)
  } catch (error) {
    console.error(`统一 API 调用失败 [${modelId}]:`, error)
    throw error
  }
}
