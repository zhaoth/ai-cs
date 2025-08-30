import { useModelsStore } from '@/stores/models'
import { usageTracker } from './usageTracker'

// 流式响应数据类型
export interface StreamResponse {
  choices?: Array<{
    delta?: {
      content?: string
    }
    finish_reason?: string
    message?: {
      role: string
      content: string
      tool_calls?: Array<{
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
  }>
  delta?: {
    text?: string
  }
  content_block?: {
    text?: string
  }
}

// AI API 响应数据类型
export interface ApiResponse {
  choices?: Array<{
    message?: {
      content: string
      tool_calls?: Array<{
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
    delta?: {
      content?: string
    }
    finish_reason?: string
  }>
  content?: Array<{
    text: string
  }>
}

// 扩展消息类型以支持工具调用
export interface ExtendedMessage {
  role: string
  content: string
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
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
  abortController?: AbortController // 新增：取消控制器
  enableSearch?: boolean // 新增：启用联网搜索
  forcedSearch?: boolean // 新增：强制联网搜索
  tools?: Array<{
    // 新增：工具定义（用于Kimi联网搜索）
    type: string
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
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
    abortController?: AbortController,
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应数据流')
    }

    let fullContent = ''
    const decoder = new TextDecoder()

    try {
      while (true) {
        // 检查是否被中止
        if (abortController?.signal.aborted) {
          break // 不抛出错误，直接跳出循环，返回已生成的内容
        }

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

              // 检查是否有工具调用完成原因
              if (parsed.choices?.[0]?.finish_reason === 'tool_calls') {
                // 工具调用情况下停止处理
                break
              }
            } catch {
              // 忽略解析错误的数据块
            }
          }
        }
      }
    } catch (error) {
      // 如果是取消错误，不抛出，只记录状态
      if (error instanceof Error && error.name === 'AbortError') {
        // 静默处理取消错误
      } else {
        throw error // 其他错误继续抛出
      }
    } finally {
      reader.releaseLock()
    }

    // 无论是否被中止，都返回已生成的内容
    return fullContent
  }

  // 提取流式内容（子类可重写）
  protected extractStreamContent(parsed: StreamResponse): string | null {
    // 检查是否有工具调用
    if (parsed.choices?.[0]?.finish_reason === 'tool_calls') {
      // 工具调用情况下不返回内容
      return null
    }

    return parsed.choices?.[0]?.delta?.content || null
  }

  // 处理非流式响应
  protected processResponse(data: ApiResponse): string {
    if (this.config.responseTransformer) {
      return this.config.responseTransformer(data)
    }

    // 检查是否有工具调用
    if (data.choices?.[0]?.finish_reason === 'tool_calls') {
      // 工具调用情况下不返回内容
      return ''
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
        signal: config.abortController?.signal, // 添加取消信号
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          `API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
        )
      }

      // 根据是否启用流式处理选择不同的处理方式
      if (config.stream !== false) {
        return await this.processStreamResponse(
          response,
          config.onStreamChunk,
          config.abortController,
        )
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
      model: 'kimi-k2-0711-preview', // 使用最新的稳定模型
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

  tools = [
    {
      type: 'builtin_function',
      function: {
        name: '$web_search',
        description: '联网搜索功能，用于获取最新的网络信息',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词',
            },
          },
          required: ['query'],
        },
      },
    },
  ]

  // 重写构建请求体方法，添加联网搜索参数
  protected buildRequestBody(
    messages: Array<{ role: string; content: string } | ExtendedMessage>,
    config: ApiRequestConfig,
  ): Record<string, unknown> {
    // 调用父类方法获取基础请求体
    const baseRequestBody = super.buildRequestBody(messages, config)

    // 添加联网搜索参数
    const kimiRequestBody: Record<string, unknown> = {
      ...baseRequestBody,
    }

    // 如果启用了联网搜索，添加tools参数
    if (config.enableSearch) {
      kimiRequestBody.tools = this.tools
      // Kimi的工具调用不支持流式输出，需要禁用流式模式
      kimiRequestBody.stream = false
    }

    // 如果启用了强制搜索，添加search参数
    if (config.forcedSearch) {
      kimiRequestBody.search = true
    }

    return kimiRequestBody
  }

  // 重写主要调用方法以支持工具调用
  async call(
    messages: Array<{ role: string; content: string } | ExtendedMessage>,
    config: ApiRequestConfig = {},
  ): Promise<string> {
    // 创建消息副本用于工具调用循环
    const currentMessages: Array<{ role: string; content: string } | ExtendedMessage> = [
      ...messages,
    ]
    let finalResponse = ''

    // 工具调用循环（最多循环5次，防止无限循环）
    let toolCallCount = 0
    const maxToolCalls = 5

    // 工具调用循环
    while (toolCallCount < maxToolCalls) {
      const apiKey = this.getApiKey()
      const requestBody = this.buildRequestBody(currentMessages, config)
      const headers = this.buildHeaders(apiKey)

      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: config.abortController?.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(
            `API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
          )
        }

        // 处理流式响应
        if (config.stream !== false) {
          const streamResponse = await this.processStreamResponse(
            response,
            config.onStreamChunk,
            config.abortController,
          )
          finalResponse = streamResponse
          break // 流式响应直接返回，不处理工具调用
        } else {
          // 处理非流式响应
          const data = await response.json()

          // 检查是否有工具调用
          if (data.choices?.[0]?.finish_reason === 'tool_calls') {
            // 获取工具调用信息
            const toolCalls = data.choices[0].message?.tool_calls
            if (toolCalls && toolCalls.length > 0) {
              // 将助手的消息添加到上下文中
              currentMessages.push({
                role: 'assistant',
                content: data.choices[0].message?.content || '',
                tool_calls: toolCalls,
              } as ExtendedMessage)

              // 处理每个工具调用
              for (const toolCall of toolCalls) {
                if (toolCall.function.name === '$web_search') {
                  // 对于网络搜索，我们需要解析参数并传递回去
                  let searchArgs = toolCall.function.arguments
                  try {
                    // 尝试解析参数为JSON对象
                    const argsObj = JSON.parse(toolCall.function.arguments)
                    if (argsObj.query) {
                      searchArgs = JSON.stringify(argsObj)
                    }
                  } catch {
                    // 如果解析失败，保持原始字符串
                    console.warn(
                      'Failed to parse search arguments as JSON, using raw string:',
                      toolCall.function.arguments,
                    )
                  }

                  currentMessages.push({
                    role: 'tool',
                    content: searchArgs,
                    tool_call_id: toolCall.id,
                  })
                } else {
                  // 对于不支持的工具调用，返回错误信息
                  console.warn('Unsupported tool call:', toolCall.function.name)
                  currentMessages.push({
                    role: 'tool',
                    content: `不支持的工具调用: ${toolCall.function.name}`,
                    tool_call_id: toolCall.id,
                  })
                }
              }
              // 增加工具调用计数
              toolCallCount++
              // 继续循环以获取最终响应
              continue
            }
          } else {
            // 没有工具调用，返回最终响应
            finalResponse = data.choices?.[0]?.message?.content || '抱歉，我无法回复您的消息。'
            break
          }
        }
      } catch (error) {
        console.error(`${this.constructor.name} API 调用失败:`, error)
        throw new Error(
          `${this.constructor.name} API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
        )
      }
    }

    // 检查是否达到最大工具调用次数
    if (toolCallCount >= maxToolCalls) {
      console.warn('达到最大工具调用次数，停止工具调用循环')
    }

    // 跟踪使用情况
    const inputText = messages.map((m) => m.content).join(' ')
    const outputText = finalResponse
    usageTracker.trackUsage('Moonshot', 'kimi', inputText, outputText)

    return finalResponse
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
    const response = await provider.call(messages, config)

    // 跟踪使用情况
    const inputText = messages.map((m) => m.content).join(' ')
    const outputText = response

    // 获取提供商名称
    const providerName =
      modelId === 'kimi' ? 'Moonshot' : modelId === 'deepseek-v3.1' ? 'DeepSeek' : 'Unknown'

    if (providerName !== 'Unknown') {
      usageTracker.trackUsage(providerName, modelId, inputText, outputText)
    }

    return response
  } catch (error) {
    console.error(`统一 API 调用失败 [${modelId}]:`, error)
    throw error
  }
}
