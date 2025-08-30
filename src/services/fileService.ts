import { useModelsStore } from '@/stores/models'
import { type FileAttachment } from '@/stores/chatHistory'
import { callUnifiedAiApi } from './aiApiService'

// 文件处理接口
export interface FileProcessor {
  processFiles(files: FileAttachment[]): Promise<string>
  supportsFileUpload(): boolean
}

// Kimi 文件处理器
export class KimiFileProcessor implements FileProcessor {
  private modelsStore = useModelsStore()

  supportsFileUpload(): boolean {
    return true
  }

  async processFiles(files: FileAttachment[]): Promise<string> {
    // 为有内容的文本文件上传到 Kimi API
    const textFilesWithContent = files.filter((f) => f.content && f.content.trim())

    for (const file of textFilesWithContent) {
      if (!file.kimiFileId) {
        try {
          file.kimiFileId = await this.uploadFileToKimi(file)
        } catch (error) {
          console.warn(`文件 ${file.name} 上传到 Kimi 失败:`, error)
        }
      }
    }

    return 'Files processed for Kimi'
  }

  private async uploadFileToKimi(file: FileAttachment): Promise<string> {
    const apiKey = this.modelsStore.getApiKey('Moonshot')

    if (!apiKey) {
      throw new Error('Kimi API Key 未配置')
    }

    // 检查文件内容
    if (!file.content || !file.content.trim()) {
      throw new Error('文件内容为空，无法上传到 Kimi API')
    }

    // 验证文件类型
    if (
      !file.type.startsWith('text/') &&
      !file.name.endsWith('.md') &&
      !file.name.endsWith('.txt')
    ) {
      throw new Error('只支持文本文件上传到 Kimi API')
    }

    const formData = new FormData()
    const fileBlob = new Blob([file.content], {
      type: file.type || 'text/plain',
    })

    if (fileBlob.size === 0) {
      throw new Error('文件内容为空，无法上传')
    }

    formData.append('file', fileBlob, file.name)
    formData.append('purpose', 'file-extract')

    const response = await fetch('https://api.moonshot.cn/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        `文件上传失败: ${response.status} ${errorData?.error?.message || response.statusText}`,
      )
    }

    const data = await response.json()
    if (!data.id) {
      throw new Error('上传成功但未获得文件ID')
    }

    return data.id
  }
}

// 默认文件处理器（无特殊文件处理）
export class DefaultFileProcessor implements FileProcessor {
  supportsFileUpload(): boolean {
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processFiles(_files: FileAttachment[]): Promise<string> {
    // 参数前加下划线表示有意不使用，避免ESLint警告
    return 'No special file processing needed'
  }
}

// 文件处理工厂
export class FileProcessorFactory {
  private static processors: Map<string, FileProcessor> = new Map()

  static getProcessor(modelId: string): FileProcessor {
    if (!this.processors.has(modelId)) {
      this.processors.set(modelId, this.createProcessor(modelId))
    }
    return this.processors.get(modelId)!
  }

  private static createProcessor(modelId: string): FileProcessor {
    switch (modelId) {
      case 'kimi':
        return new KimiFileProcessor()
      default:
        return new DefaultFileProcessor()
    }
  }

  static clearCache(): void {
    this.processors.clear()
  }
}

// 统一文件处理API
export async function processFilesForModel(
  modelId: string,
  files: FileAttachment[],
): Promise<void> {
  const processor = FileProcessorFactory.getProcessor(modelId)
  await processor.processFiles(files)
}

// 增强的 AI API 调用（包含文件上下文）
export async function callAiApiWithFiles(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  files: FileAttachment[],
  config: {
    onStreamChunk?: (chunk: string) => void
    enableSearch?: boolean // 新增：启用联网搜索
    forcedSearch?: boolean // 新增：强制联网搜索
  } = {},
): Promise<string> {
  // 构建包含文件信息的上下文消息
  const contextMessages = [...messages]

  if (files.length > 0 && contextMessages.length > 0) {
    const lastMessage = contextMessages[contextMessages.length - 1]

    if (lastMessage.role === 'user') {
      // 根据模型类型处理文件
      let fileContext = ''

      if (modelId === 'kimi') {
        // Kimi 特殊处理：优先使用文本内容，其次使用文件ID
        const textFiles = files.filter((f) => f.content && f.content.trim())
        const kimiFiles = files.filter((f) => f.kimiFileId && !f.content)

        // 文本文件内容
        if (textFiles.length > 0) {
          const textContents = textFiles
            .map((f) => `文件: ${f.name}\n内容:\n${f.content}`)
            .join('\n\n---文件分割线---\n\n')
          fileContext += `\n\n以下是上传的文件内容：\n\n${textContents}`
        }

        // Kimi 文件ID引用
        if (kimiFiles.length > 0) {
          const kimiFileIds = kimiFiles.map((f) => f.kimiFileId!)
          fileContext += `\n\n请同时分析以下文件: ${kimiFileIds.map((id) => `file://${id}`).join(', ')}`
        }
      } else {
        // 其他模型：直接使用文件内容
        const textFiles = files.filter((f) => f.content && f.content.trim())
        if (textFiles.length > 0) {
          const fileInfos = textFiles
            .map((f) => {
              if (f.content) {
                return `文件: ${f.name}\n内容: ${f.content}`
              }
              return `文件: ${f.name} (${f.type})`
            })
            .join('\n\n')
          fileContext += `\n\n附件信息:\n${fileInfos}`
        }
      }

      if (fileContext) {
        lastMessage.content += fileContext
      }
    }
  }

  // 使用统一API调用，传递流式回调和联网搜索参数
  return await callUnifiedAiApi(modelId, contextMessages, {
    temperature: 0.7,
    maxTokens: modelId === 'kimi' ? 3000 : 1000, // Kimi支持更长的回复
    stream: modelId === 'kimi' && config.enableSearch ? false : true, // Kimi联网搜索不支持流式
    onStreamChunk: config.onStreamChunk, // 传递流式回调
    enableSearch: config.enableSearch, // 传递联网搜索参数
    forcedSearch: config.forcedSearch, // 传递强制搜索参数
  })
}
