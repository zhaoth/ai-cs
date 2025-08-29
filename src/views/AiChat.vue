<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { useModelsStore } from '@/stores/models'
import { type Message, type FileAttachment } from '@/stores/chatHistory'
import { useSearchHistoryStore } from '@/stores/searchHistory'
import FileUpload from '@/components/FileUpload.vue'
import {
  renderMarkdownSync as renderMarkdown,
  hasMarkdownSyntax,
  getPlainText,
} from '@/utils/markdown'

const chatStore = useChatHistoryStore()
const modelsStore = useModelsStore()
const searchStore = useSearchHistoryStore()

const inputMessage = ref('')
const loading = ref(false)

// 搜索建议相关状态
const showSearchSuggestions = ref(false)
const searchInputFocused = ref(false)

// 清空上下文确认对话框状态
const showClearConfirm = ref(false)

// 文件上传弹窗状态
const showFileUploadModal = ref(false)
const uploadedFiles = ref<FileAttachment[]>([])

// 消息反馈状态管理
const messageFeedback = ref<Record<string, { liked: boolean; disliked: boolean }>>({})

// 处理文件上传
const handleFileUpload = async (file: FileAttachment) => {
  try {
    file.uploadStatus = 'uploading'

    // 只有在文件有实际内容或者是文本文件时才上传到Kimi
    if (modelsStore.selectedModelId === 'kimi' && file.content && file.content.trim()) {
      const kimiFileId = await uploadFileToKimi(file)
      file.kimiFileId = kimiFileId
    }

    file.uploadStatus = 'success'
    message.success(`文件 "${file.name}" 上传成功`)
  } catch (error) {
    console.error('文件上传失败:', error)
    file.uploadStatus = 'error'
    message.error(
      `文件 "${file.name}" 上传失败: ${error instanceof Error ? error.message : '未知错误'}`,
    )
  }
}

// 上传文件到Kimi API
const uploadFileToKimi = async (file: FileAttachment): Promise<string> => {
  const apiKey = modelsStore.getApiKey('Moonshot')

  if (!apiKey) {
    throw new Error('Kimi API Key 未配置')
  }

  // 检查文件内容，只有有内容的文本文件才上传
  if (!file.content || !file.content.trim()) {
    throw new Error('文件内容为空，无法上传到 Kimi API')
  }

  // 验证文件类型
  if (!file.type.startsWith('text/') && !file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
    throw new Error('只支持文本文件上传到 Kimi API')
  }

  // 创建 FormData 用于文件上传
  const formData = new FormData()

  // 使用文件内容创建 Blob
  const fileBlob = new Blob([file.content], {
    type: file.type || 'text/plain',
  })

  // 检查 Blob 大小
  if (fileBlob.size === 0) {
    throw new Error('文件内容为空，无法上传')
  }

  formData.append('file', fileBlob, file.name)
  formData.append('purpose', 'file-extract')

  try {
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
  } catch (error) {
    console.error('Kimi文件上传API调用失败:', error)
    throw error
  }
}

// 打开文件上传弹窗
const openFileUploadModal = () => {
  showFileUploadModal.value = true
}

// 关闭文件上传弹窗
const closeFileUploadModal = () => {
  showFileUploadModal.value = false
}

// 确认上传文件
const confirmUploadFiles = () => {
  if (uploadedFiles.value.length === 0) {
    message.warning('请选择要上传的文件')
    return
  }

  // 验证文件内容
  const validFiles = uploadedFiles.value.filter((file) => {
    // 检查文本文件是否有内容
    if (
      (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) &&
      (!file.content || !file.content.trim())
    ) {
      message.warning(`文件 "${file.name}" 内容为空，将跳过处理`)
      return false
    }
    return true
  })

  if (validFiles.length === 0) {
    message.error('没有有效的文件可以处理')
    return
  }

  // 关闭文件上传弹窗
  showFileUploadModal.value = false

  // 自动提取文件内容并构建智能提示消息
  const textFiles = validFiles.filter((f) => f.content && f.content.trim())
  const otherFiles = validFiles.filter((f) => !f.content || !f.content.trim())

  let autoMessage = ''

  if (textFiles.length > 0) {
    // 有文本内容的文件，自动生成分析请求
    const fileContents = textFiles
      .map((f) => {
        const contentPreview =
          f.content!.length > 200
            ? f.content!.substring(0, 200) + '...\n[[内容较长，已截取前200字符展示]]'
            : f.content!
        return `📄 **${f.name}** (大小: ${formatFileSize(f.size)})\n内容预览:\n${contentPreview}`
      })
      .join('\n\n---\n\n')

    autoMessage = `我上传了 ${validFiles.length} 个文件，请帮我分析一下文件内容：\n\n${fileContents}`

    if (otherFiles.length > 0) {
      const otherFileInfos = otherFiles
        .map((f) => `📎 ${f.name} (大小: ${formatFileSize(f.size)})`)
        .join('\n')
      autoMessage += `\n\n还有其他文件：\n${otherFileInfos}`
    }
  } else {
    // 没有文本内容，只显示文件信息
    const fileInfos = validFiles
      .map((f) => `📎 ${f.name} (大小: ${formatFileSize(f.size)})`)
      .join('\n')
    autoMessage = `已上传文件：\n${fileInfos}\n\n请问您希望我对这些文件进行什么操作？`
  }

  // 发送包含文件附件的消息
  sendMessageWithFiles(autoMessage, [...validFiles])

  const skippedCount = uploadedFiles.value.length - validFiles.length
  const successMessage = `成功上传 ${validFiles.length} 个文件并开始分析${skippedCount > 0 ? `，跳过 ${skippedCount} 个无效文件` : ''}`
  message.success(successMessage)

  uploadedFiles.value = [] // 清空已上传文件列表
}

// 发送包含文件附件的消息
const sendMessageWithFiles = async (messageText: string, files: FileAttachment[]) => {
  if (loading.value) return

  // 确保有当前聊天
  let chatId = chatStore.currentChatId
  if (!chatId) {
    chatId = chatStore.createChat(modelsStore.selectedModelId, messageText)
  }

  // 添加用户消息（包含文件附件）
  chatStore.addMessage(chatId, {
    role: 'user',
    content: messageText,
    model: modelsStore.selectedModelId,
    attachments: files,
  })

  // 显示加载状态
  loading.value = true

  try {
    // 调用AI API，传递文件上下文
    let aiResponse
    try {
      aiResponse = await callAiAPIWithFiles(modelsStore.selectedModelId, files)
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      aiResponse = generateFileAwareResponse(modelsStore.selectedModelId, files)
    }

    // 添加AI回复
    chatStore.addMessage(chatId, {
      role: 'assistant',
      content: aiResponse,
      model: modelsStore.selectedModelId,
    })
  } catch (error) {
    console.error('发送消息失败:', error)
    chatStore.addMessage(chatId, {
      role: 'assistant',
      content: `抱歉，处理文件时发生错误: ${error instanceof Error ? error.message : '未知错误'}`,
      model: modelsStore.selectedModelId,
    })
  } finally {
    loading.value = false
  }
}

// 调用AI API（包含文件上下文）
const callAiAPIWithFiles = async (modelId: string, files: FileAttachment[]): Promise<string> => {
  // 获取当前对话的所有消息作为上下文
  const currentMessages = chatStore.currentChat?.messages || []

  // 构建包含文件信息的上下文
  const contextMessages = currentMessages.map((msg) => {
    let content = msg.content

    // 如果消息包含文件附件，添加文件信息到内容中
    if (msg.attachments && msg.attachments.length > 0) {
      const fileInfos = msg.attachments
        .map((f) => {
          if (f.content) {
            return `文件: ${f.name}\n内容: ${f.content}`
          }
          return `文件: ${f.name} (${f.type})`
        })
        .join('\n\n')
      content += `\n\n附件信息:\n${fileInfos}`
    }

    return {
      role: msg.role,
      content: content,
    }
  })

  // 限制上下文长度
  const maxMessages = 20
  const limitedMessages =
    contextMessages.length > maxMessages ? contextMessages.slice(-maxMessages) : contextMessages

  switch (modelId) {
    case 'kimi':
      return await callKimiAPIWithFiles(limitedMessages, files)
    case 'gpt-4':
    case 'gpt-3.5-turbo':
    case 'claude-2':
    default:
      return await callAiAPI(modelId) // 对于其他模型，使用原有逻辑
  }
}

// 调用Kimi API（包含文件上下文）
const callKimiAPIWithFiles = async (
  messages: Array<{ role: string; content: string }>,
  files: FileAttachment[],
): Promise<string> => {
  const apiKey = modelsStore.getApiKey('Moonshot')

  if (!apiKey) {
    throw new Error('Kimi API Key 未配置，请在模型设置中添加API密钥')
  }

  try {
    // 构建请求消息，包含文件引用
    const requestMessages = [...messages]

    // 优先处理文本文件内容，其次使用Kimi文件ID
    if (files.length > 0 && requestMessages.length > 0) {
      const lastMessage = requestMessages[requestMessages.length - 1]
      if (lastMessage.role === 'user') {
        // 分类处理文件
        const textFiles = files.filter((f) => f.content && f.content.trim())
        const kimiFiles = files.filter((f) => f.kimiFileId && !f.content)

        let fileContext = ''

        // 优先使用文本文件内容（更可靠）
        if (textFiles.length > 0) {
          const textContents = textFiles
            .map((f) => `文件: ${f.name}\n内容:\n${f.content}`)
            .join('\n\n---文件分割线---\n\n')
          fileContext += `\n\n以下是上传的文件内容：\n\n${textContents}`
        }

        // 如果有成功上传的Kimi文件ID，作为补充
        if (kimiFiles.length > 0) {
          const kimiFileIds = kimiFiles.map((f) => f.kimiFileId!)
          fileContext += `\n\n请同时分析以下文件: ${kimiFileIds.map((id) => `file://${id}`).join(', ')}`
        }

        if (fileContext) {
          lastMessage.content += fileContext
        }
      }
    }

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'kimi-k2-0711-preview',
        messages: requestMessages,
        temperature: 0.7,
        max_tokens: 3000, // 进一步增加token限制以支持更长的文件分析
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        `Kimi API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
      )
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || '抱歉，我无法处理您上传的文件。'
  } catch (error) {
    console.error('Kimi API 调用失败:', error)
    throw error
  }
}

// 生成文件感知的模拟回复
const generateFileAwareResponse = (modelId: string, files: FileAttachment[]): string => {
  const fileNames = files.map((f) => f.name).join(', ')
  const fileCount = files.length

  const responses = [
    `我已经接收到您上传的${fileCount}个文件：${fileNames}。`,
    `感谢您上传文件。我注意到您分享了：${fileNames}。`,
    `我看到您上传了${fileCount}个文件（${fileNames}）。`,
  ]

  const baseResponse = responses[Math.floor(Math.random() * responses.length)]

  // 检查是否有文本文件内容
  const textFiles = files.filter((f) => f.content)
  if (textFiles.length > 0) {
    const textContent = textFiles.map((f) => f.content).join('\n\n')
    return `${baseResponse}\n\n基于您提供的文件内容，我可以看到：\n\n${textContent}\n\n请问您希望我如何帮助您分析或处理这些内容？`
  }

  return `${baseResponse}\n\n请问您希望我对这些文件进行什么操作？比如总结内容、分析数据、或者其他特定需求？\n\n💡 提示：当前使用的是模拟回复。如需获得真实的文件分析能力，请配置相应的API密钥。`
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 渲染消息内容
const renderMessageContent = (content: string): string => {
  if (!content) return ''

  // 检查是否包含 Markdown 语法
  if (hasMarkdownSyntax(content)) {
    return renderMarkdown(content)
  }

  // 如果不包含 Markdown 语法，进行基本的文本处理
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>')
}

// 检查消息是否包含 Markdown
const messageHasMarkdown = (content: string): boolean => {
  return hasMarkdownSyntax(content)
}

// 复制消息内容（使用纯文本）
const getMessageTextForCopy = (content: string): string => {
  if (hasMarkdownSyntax(content)) {
    return getPlainText(content)
  }
  return content
}
// 搜索建议计算属性
const searchSuggestions = computed(() => {
  if (!inputMessage.value.trim()) {
    return searchStore.getRecentSearches(8)
  }
  return searchStore.searchInHistory(inputMessage.value)
})

// 监听输入框内容变化，显示/隐藏搜索建议
watch(inputMessage, (newValue) => {
  if (searchInputFocused.value && (newValue.length > 0 || searchStore.searchHistory.length > 0)) {
    showSearchSuggestions.value = true
  } else {
    showSearchSuggestions.value = false
  }
})

// 获取模型图标
const getModelIcon = (modelId: string) => {
  const icons: Record<string, string> = {
    kimi: '🌙',
    'gpt-4': '🤖',
    'gpt-3.5-turbo': '⚡',
    'claude-2': '🧠',
    'llama-2': '🦙',
    'palm-2': '🌟',
  }
  return icons[modelId] || '🤖'
}

// 处理模型选择变化
const handleModelChange = (modelId: string) => {
  modelsStore.selectModel(modelId)
}

// 输入框聚焦处理
const handleInputFocus = () => {
  searchInputFocused.value = true
  if (inputMessage.value.length > 0 || searchStore.searchHistory.length > 0) {
    showSearchSuggestions.value = true
  }
}

// 输入框失焦处理
const handleInputBlur = () => {
  searchInputFocused.value = false
  // 延迟隐藏，以便用户能点击建议项
  setTimeout(() => {
    if (!searchInputFocused.value) {
      showSearchSuggestions.value = false
    }
  }, 150)
}

// 选择搜索建议
const selectSearchSuggestion = (suggestion: string) => {
  inputMessage.value = suggestion
  showSearchSuggestions.value = false
  searchInputFocused.value = false
}

// 删除搜索历史项
const removeSearchItem = (itemId: string, event: Event) => {
  event.stopPropagation()
  searchStore.removeSearchItem(itemId)
  message.success('已删除搜索记录')
}

// 清空搜索历史
const clearSearchHistory = () => {
  searchStore.clearSearchHistory()
  showSearchSuggestions.value = false
  message.success('已清空搜索历史')
}

// 显示清空上下文确认对话框
const showClearContextConfirm = () => {
  if (!chatStore.currentChat || chatStore.currentChat.messages.length === 0) {
    message.info('当前没有可清空的对话内容')
    return
  }
  showClearConfirm.value = true
}

// 确认清空当前对话上下文
const confirmClearContext = () => {
  chatStore.clearCurrentChatMessages()
  showClearConfirm.value = false
  message.success('已清空当前对话上下文')
}

// 取消清空操作
const cancelClearContext = () => {
  showClearConfirm.value = false
}

// 点赞消息
const likeMessage = (messageId: string) => {
  if (!messageFeedback.value[messageId]) {
    messageFeedback.value[messageId] = { liked: false, disliked: false }
  }

  const feedback = messageFeedback.value[messageId]
  if (feedback.liked) {
    feedback.liked = false
    message.info('已取消点赞')
  } else {
    feedback.liked = true
    feedback.disliked = false // 互斥
    message.success('已点赞，感谢您的反馈！')
  }
}

// 踩消息
const dislikeMessage = (messageId: string) => {
  if (!messageFeedback.value[messageId]) {
    messageFeedback.value[messageId] = { liked: false, disliked: false }
  }

  const feedback = messageFeedback.value[messageId]
  if (feedback.disliked) {
    feedback.disliked = false
    message.info('已取消反对')
  } else {
    feedback.disliked = true
    feedback.liked = false // 互斥
    message.info('已记录您的反馈，我们会持续改进')
  }
}

// 复制消息内容
const copyMessage = async (content: string) => {
  try {
    // 获取纯文本内容（去除 Markdown 语法）
    const textToCopy = getMessageTextForCopy(content)
    await navigator.clipboard.writeText(textToCopy)
    message.success('内容已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：创建临时文本域
    const textarea = document.createElement('textarea')
    textarea.value = getMessageTextForCopy(content)
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      message.success('内容已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动复制')
    }
    document.body.removeChild(textarea)
  }
}

// 重新生成回复
const regenerateResponse = async (messageObj: Message) => {
  if (!chatStore.currentChatId || loading.value) return

  // 找到用户的原始问题
  const messages = chatStore.currentChat?.messages || []
  const messageIndex = messages.findIndex((m) => m.id === messageObj.id)

  if (messageIndex === -1 || messageIndex === 0) {
    message.error('无法找到对应的用户消息')
    return
  }

  // 获取用户的问题（AI回复的前一条消息）
  const userMessage = messages[messageIndex - 1]
  if (userMessage.role !== 'user') {
    message.error('消息序列异常')
    return
  }

  // 删除当前的AI回复
  const chatId = chatStore.currentChatId
  const chat = chatStore.chats.find((c) => c.id === chatId)
  let removedMessageIndex = -1

  if (chat) {
    removedMessageIndex = chat.messages.findIndex((m) => m.id === messageObj.id)
    if (removedMessageIndex !== -1) {
      chat.messages.splice(removedMessageIndex, 1)
    }
  }

  // 重新生成回复
  loading.value = true

  try {
    // 重新生成时也要传递完整上下文
    let aiResponse
    try {
      aiResponse = await callAiAPI(modelsStore.selectedModelId)
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      // API调用失败时使用上下文感知的模拟回复
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      const contextMessages =
        chatStore.currentChat?.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) || []
      aiResponse = generateContextAwareResponse(modelsStore.selectedModelId, contextMessages)
    }

    // 添加新的AI回复
    chatStore.addMessage(chatId, {
      role: 'assistant',
      content: aiResponse,
      model: modelsStore.selectedModelId,
    })

    message.success('已重新生成回复')
  } catch (error) {
    console.error('重新生成失败:', error)
    // 重新添加原来的消息
    if (chat && removedMessageIndex !== -1) {
      chat.messages.splice(removedMessageIndex, 0, messageObj)
    }
    message.error('重新生成失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 创建初始聊天
onMounted(() => {
  if (!chatStore.currentChatId && chatStore.chats.length === 0) {
    modelsStore.selectModel('kimi')
    chatStore.createChat('kimi')
  }
})

const sendMessage = async () => {
  if (!inputMessage.value.trim() || loading.value) return

  const userMessage = inputMessage.value.trim()

  // 将搜索内容添加到历史记录
  searchStore.addSearchItem(userMessage)

  inputMessage.value = ''
  showSearchSuggestions.value = false

  // 确保有当前聊天
  let chatId = chatStore.currentChatId
  if (!chatId) {
    chatId = chatStore.createChat(modelsStore.selectedModelId, userMessage)
  }

  // 添加用户消息
  chatStore.addMessage(chatId, {
    role: 'user',
    content: userMessage,
    model: modelsStore.selectedModelId,
  })

  // 显示加载状态
  loading.value = true

  try {
    // 调用AI API，自动传递完整对话上下文
    let aiResponse
    try {
      aiResponse = await callAiAPI(modelsStore.selectedModelId)
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      // 如果API调用失败，降级到模拟回复但保持上下文感知
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      const contextMessages =
        chatStore.currentChat?.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) || []
      aiResponse = generateContextAwareResponse(modelsStore.selectedModelId, contextMessages)
    }

    // 添加AI回复
    chatStore.addMessage(chatId, {
      role: 'assistant',
      content: aiResponse,
      model: modelsStore.selectedModelId,
    })
  } catch (error) {
    console.error('发送消息失败:', error)
    // 添加错误消息
    chatStore.addMessage(chatId, {
      role: 'assistant',
      content: `抱歉，发送失败: ${error instanceof Error ? error.message : '未知错误'}`,
      model: modelsStore.selectedModelId,
    })
  } finally {
    loading.value = false
  }
}

// 通用AI API调用函数，支持所有模型的上下文传递
const callAiAPI = async (modelId: string): Promise<string> => {
  // 获取当前对话的所有消息作为上下文
  const currentMessages = chatStore.currentChat?.messages || []

  // 将内部消息格式转换为API所需格式，保持上下文连续性
  const contextMessages = currentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))

  // 限制上下文长度以避免token超限，保留最近的对话
  const maxMessages = 20
  const limitedMessages =
    contextMessages.length > maxMessages ? contextMessages.slice(-maxMessages) : contextMessages

  switch (modelId) {
    case 'kimi':
      return await callKimiAPI(limitedMessages)
    case 'gpt-4':
      return await callOpenAIAPI('gpt-4', limitedMessages)
    case 'gpt-3.5-turbo':
      return await callOpenAIAPI('gpt-3.5-turbo', limitedMessages)
    case 'claude-2':
      return await callClaudeAPI(limitedMessages)
    default:
      // 对于其他模型，生成带上下文理解的模拟回复
      return generateContextAwareResponse(modelId, limitedMessages)
  }
}

// 调用 Kimi API
const callKimiAPI = async (messages: Array<{ role: string; content: string }>): Promise<string> => {
  const apiKey = modelsStore.getApiKey('Moonshot')

  if (!apiKey) {
    throw new Error('Kimi API Key 未配置，请在模型设置中添加API密钥')
  }

  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'kimi-k2-0711-preview',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        `API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
      )
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || '抱歉，我无法回复您的消息。'
  } catch (error) {
    console.error('Kimi API 调用失败:', error)
    throw new Error(`Kimi API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 调用 OpenAI API (GPT-4, GPT-3.5-turbo)
const callOpenAIAPI = async (
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> => {
  const apiKey = modelsStore.getApiKey('OpenAI')

  if (!apiKey) {
    throw new Error('OpenAI API Key 未配置，请在模型设置中添加API密钥')
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        `OpenAI API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
      )
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || '抱歉，我无法回复您的消息。'
  } catch (error) {
    console.error('OpenAI API 调用失败:', error)
    throw new Error(`OpenAI API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 调用 Claude API
const callClaudeAPI = async (
  messages: Array<{ role: string; content: string }>,
): Promise<string> => {
  const apiKey = modelsStore.getApiKey('Anthropic')

  if (!apiKey) {
    throw new Error('Anthropic API Key 未配置，请在模型设置中添加API密钥')
  }

  try {
    // Claude API 需要特殊的消息格式处理
    const claudeMessages = messages.filter((msg) => msg.role !== 'system')
    const systemMessage = messages.find((msg) => msg.role === 'system')?.content

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-2.1',
        max_tokens: 1000,
        system: systemMessage,
        messages: claudeMessages,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        `Claude API 调用失败: ${response.status} ${response.statusText} ${errorData?.error?.message || ''}`,
      )
    }

    const data = await response.json()
    return data.content[0]?.text || '抱歉，我无法回复您的消息。'
  } catch (error) {
    console.error('Claude API 调用失败:', error)
    throw new Error(`Claude API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 生成具有上下文理解的智能回复（用于没有API密钥的模型）
const generateContextAwareResponse = (
  modelId: string,
  messages: Array<{ role: string; content: string }>,
): string => {
  const latestMessage = messages[messages.length - 1]?.content || ''
  // 分析最近6条消息的上下文以理解对话连续性
  // const conversationHistory = messages.slice(-6)

  // 分析对话上下文，理解用户意图
  const hasContext = messages.length > 1
  const previousUserQuestions = messages.filter((msg) => msg.role === 'user').slice(-3)
  const conversationTopic = previousUserQuestions.length > 1 ? '继续我们之前的讨论' : '关于您的问题'

  // 检测对话的连续性和主题
  const contextualIntro = hasContext ? `基于我们之前的对话，我注意到您${conversationTopic}。` : ''

  const model = modelsStore.models.find((m) => m.id === modelId)
  const modelName = model?.name || 'AI助手'
  const provider = model?.provider || ''

  // 根据不同模型生成具有上下文感知的个性化回复
  const contextualResponses = {
    kimi: [
      `${contextualIntro}作为 Kimi，我基于长文本理解能力来分析您的问题"${latestMessage}"：\n\n🌙 通过分析我们的对话历史，我发现这个问题${hasContext ? '与之前的讨论有关联' : '很值得深入探讨'}...\n\n💡 基于上下文，我建议我们可以从以下几个维度来继续探讨这个话题。`,
      `${contextualIntro}您好！作为 Moonshot AI 的 Kimi，我结合我们${hasContext ? '之前的交流' : '当前的对话'}来回答"${latestMessage}"：\n\n📖 考虑到${hasContext ? '我们讨论的连贯性' : '这个问题的复杂性'}，让我为您提供一个全面的分析...\n\n🔍 这确实是一个值得深入思考的问题！`,
    ],
    'gpt-4': [
      `${contextualIntro}作为 GPT-4，我会基于${hasContext ? '我们的对话历史' : '您的问题'}来提供准确的回答。关于"${latestMessage}"：\n\n🤖 ${hasContext ? '结合之前的讨论，' : ''}这个问题涉及多个层面，让我为您详细分析...\n\n希望我的回答${hasContext ? '能够延续我们的对话并' : ''}对您有所帮助！`,
      `${contextualIntro}基于我的训练数据和${hasContext ? '我们对话的上下文' : '对问题的理解'}，关于"${latestMessage}"：\n\n💭 ${hasContext ? '从我们之前的交流来看，' : ''}我认为这个问题的关键在于...\n\n让我们${hasContext ? '继续深入' : '一起'}探讨这个话题！`,
    ],
    'gpt-3.5-turbo': [
      `${contextualIntro}我是 GPT-3.5 Turbo，${hasContext ? '结合我们之前的对话，' : ''}我来回答您关于"${latestMessage}"的问题：\n\n⚡ ${hasContext ? '考虑到对话的连续性，' : ''}我认为这个问题可以从以下角度来理解...\n\n${hasContext ? '基于我们的交流历史，' : ''}我建议您可以进一步考虑这些方面。`,
    ],
    'claude-2': [
      `${contextualIntro}我是 Claude 2，${hasContext ? '回顾我们的对话，' : ''}我很乐意以平衡的方式回答"${latestMessage}"：\n\n🧠 ${hasContext ? '从我们讨论的脉络来看，' : ''}我会谨慎地分析这个问题...\n\n作为注重安全和准确性的AI，我${hasContext ? '会确保回答与我们的对话保持一致' : '希望能够帮助到您'}。`,
    ],
    'llama-2': [
      `${contextualIntro}作为开源的 Llama 2 模型，${hasContext ? '基于我们的交流历史，' : ''}我来回答"${latestMessage}"：\n\n🦙 ${hasContext ? '结合之前的讨论内容，' : ''}我基于开源训练数据的理解是...\n\n${hasContext ? '希望这个回答能够很好地承接我们的对话' : 'Llama 2 很高兴为您服务'}！`,
    ],
    'palm-2': [
      `${contextualIntro}我是 Google 的 PaLM 2，${hasContext ? '综合我们的对话内容，' : ''}让我来回答"${latestMessage}"：\n\n🌟 ${hasContext ? '考虑到对话的整体背景，' : ''}我运用多模态理解能力来分析...\n\n${hasContext ? '基于我们之前的交流，' : ''}我认为这个问题还有很多值得探讨的地方。`,
    ],
  }

  const responses =
    contextualResponses[modelId as keyof typeof contextualResponses] || contextualResponses['gpt-4']
  const selectedResponse = responses[Math.floor(Math.random() * responses.length)]

  // 如果没有API密钥，添加友好提示
  const apiKeyHint = `\n\n💡 提示：当前使用的是模拟回复。如需获得真实的${modelName}回复，请在设置中配置${provider} API密钥。`

  return selectedResponse + apiKeyHint
}
</script>

<template>
  <div class="flex-1 flex flex-col h-screen">
    <!-- 顶部标题区 -->
    <div class="text-center py-12">
      <h1 class="text-2xl font-semibold text-gray-800 mb-2">
        Hello AI | <span class="text-primary-600">让我们进入AI的世界</span>
      </h1>
    </div>

    <!-- 对话内容区 -->
    <div class="flex-1 px-8 pb-6 overflow-y-auto chat-scroll">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- 加载状态 -->
        <div v-if="loading" class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div class="flex items-center space-x-3">
            <div class="text-2xl">{{ getModelIcon(modelsStore.selectedModelId) }}</div>
            <div class="flex-1">
              <h4 class="font-medium text-gray-800 mb-2">
                {{ modelsStore.selectedModel.name }} 正在思考...
              </h4>
              <div class="flex space-x-2">
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div
                  class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                  style="animation-delay: 0.2s"
                ></div>
                <div
                  class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                  style="animation-delay: 0.4s"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 聊天消息显示 -->
        <div
          v-if="chatStore.currentChat && chatStore.currentChat.messages.length > 0"
          class="space-y-6"
        >
          <div
            v-for="message in chatStore.currentChat.messages"
            :key="message.id"
            class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 transition-all duration-300 hover:shadow-md hover:border-gray-200"
          >
            <div class="flex items-start space-x-3 mb-4">
              <div class="text-2xl">
                {{ message.role === 'user' ? '👤' : getModelIcon(modelsStore.selectedModelId) }}
              </div>
              <div class="flex-1">
                <h4 class="font-medium text-gray-800 mb-2">
                  {{
                    message.role === 'user'
                      ? '你的问题'
                      : `${modelsStore.selectedModel.name} 的回复`
                  }}
                </h4>
                <!-- 消息内容显示 -->
                <div
                  class="text-gray-600 leading-relaxed"
                  :class="{
                    'whitespace-pre-wrap': !messageHasMarkdown(message.content),
                    'markdown-content': messageHasMarkdown(message.content),
                  }"
                >
                  <template v-if="messageHasMarkdown(message.content)">
                    <div v-html="renderMessageContent(message.content)"></div>
                  </template>
                  <template v-else>
                    {{ message.content }}
                  </template>
                </div>

                <!-- 文件附件显示 -->
                <div v-if="message.attachments && message.attachments.length > 0" class="mt-3">
                  <div class="text-sm text-gray-500 mb-2">📎 附件：</div>
                  <div class="space-y-2">
                    <div
                      v-for="file in message.attachments"
                      :key="file.id"
                      class="flex items-center p-2 bg-gray-50 rounded border text-sm"
                    >
                      <span class="text-lg mr-2">
                        {{
                          file.type.startsWith('image/')
                            ? '🖼️'
                            : file.type.startsWith('text/') ||
                                file.name.endsWith('.md') ||
                                file.name.endsWith('.txt')
                              ? '📃'
                              : file.type.includes('pdf')
                                ? '📄'
                                : '📎'
                        }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-gray-700 truncate">{{ file.name }}</div>
                        <div class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</div>
                      </div>
                      <div v-if="file.url && file.type.startsWith('image/')" class="ml-2">
                        <img
                          :src="file.url"
                          :alt="file.name"
                          class="w-8 h-8 object-cover rounded border"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mt-3 text-xs text-gray-400">
                  {{ new Date(message.timestamp).toLocaleTimeString() }}
                </div>
              </div>
            </div>
            <div
              v-if="message.role === 'assistant'"
              class="flex items-center justify-end space-x-3 pt-3 border-t border-gray-100"
            >
              <button
                @click="likeMessage(message.id)"
                class="flex items-center space-x-1 text-sm transition-colors"
                :class="
                  messageFeedback[message.id]?.liked
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-gray-500 hover:text-gray-700'
                "
              >
                <span>{{ messageFeedback[message.id]?.liked ? '👍' : '👍' }}</span>
                <span>{{ messageFeedback[message.id]?.liked ? '已点赞' : '点赞' }}</span>
              </button>

              <button
                @click="dislikeMessage(message.id)"
                class="flex items-center space-x-1 text-sm transition-colors"
                :class="
                  messageFeedback[message.id]?.disliked
                    ? 'text-red-600 hover:text-red-700'
                    : 'text-gray-500 hover:text-gray-700'
                "
              >
                <span>{{ messageFeedback[message.id]?.disliked ? '👎' : '👎' }}</span>
                <span>{{ messageFeedback[message.id]?.disliked ? '已反对' : '反对' }}</span>
              </button>

              <button
                @click="copyMessage(message.content)"
                class="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span>📋</span>
                <span>复制</span>
              </button>

              <button
                @click="regenerateResponse(message)"
                :disabled="loading"
                class="flex items-center space-x-1 text-sm transition-colors"
                :class="
                  loading ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-700'
                "
              >
                <span>{{ loading ? '⏳' : '🔄' }}</span>
                <span>{{ loading ? '生成中...' : '重新生成' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 欢迎界面 -->
        <div
          v-if="!chatStore.currentChat || chatStore.currentChat.messages.length === 0"
          class="text-center py-12"
        >
          <div
            class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center"
          >
            <span class="text-2xl">💬</span>
          </div>
          <h2 class="text-xl font-medium text-gray-700 mb-2">开始新的对话</h2>
          <p class="text-gray-500">选择 AI 模型，开始您的智能对话之旅</p>
        </div>
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="border-t border-gray-200 bg-white p-6">
      <div class="max-w-4xl mx-auto">
        <!-- 功能按钮 -->
        <div class="flex items-center justify-center space-x-6 mb-4">
          <div
            @click="openFileUploadModal"
            class="flex flex-col items-center cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors group"
          >
            <div class="text-2xl mb-1 group-hover:scale-110 transition-transform">📁</div>
            <span class="text-xs text-gray-600">上传</span>
          </div>
          <div
            @click="showClearContextConfirm"
            class="flex flex-col items-center cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors group"
            :class="{
              'opacity-50 cursor-not-allowed':
                !chatStore.currentChat || chatStore.currentChat.messages.length === 0,
            }"
          >
            <div class="text-2xl mb-1 group-hover:scale-110 transition-transform">🗑️</div>
            <span class="text-xs text-gray-600">清空</span>
          </div>
          <div class="flex flex-col items-center p-3 rounded-lg">
            <div class="text-2xl mb-1">🤖</div>
            <span class="text-xs text-gray-600">等待更多</span>
          </div>
        </div>

        <!-- 输入框区域 -->
        <div class="relative">
          <div
            class="flex items-center bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-200"
          >
            <div class="pl-4">
              <button
                @click="openFileUploadModal"
                class="w-6 h-6 bg-gradient-to-br from-primary-500 to-primary-600 rounded flex items-center justify-center hover:from-primary-600 hover:to-primary-700 transition-all duration-200 transform hover:scale-105"
                title="上传文件"
              >
                <span class="text-white text-xs">📎</span>
              </button>
            </div>
            <input
              v-model="inputMessage"
              @keydown.ctrl.enter="sendMessage"
              @focus="handleInputFocus"
              @blur="handleInputBlur"
              type="text"
              placeholder="请输入你的问题(Ctrl+Enter快捷)"
              class="flex-1 bg-transparent px-4 py-4 outline-none text-gray-700 placeholder-gray-400"
            />
            <div class="pr-4">
              <button
                @click="sendMessage"
                :disabled="loading || !inputMessage.trim()"
                class="w-8 h-8 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
              >
                <template v-if="loading">
                  <div
                    class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                  ></div>
                </template>
                <template v-else>
                  <svg
                    class="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </template>
              </button>
            </div>
          </div>

          <!-- 搜索建议下拉菜单 -->
          <div
            v-if="showSearchSuggestions && searchSuggestions.length > 0"
            class="absolute bottom-full mb-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto search-dropdown-scroll z-50"
          >
            <div class="p-2">
              <div
                class="flex items-center justify-between px-3 py-2 text-sm text-gray-500 border-b border-gray-100"
              >
                <span v-if="!inputMessage.trim()">🕰️ 最近搜索</span>
                <span v-else>🔍 搜索建议</span>
                <button
                  v-if="searchStore.searchHistory.length > 0"
                  @click="clearSearchHistory"
                  class="text-xs text-red-500 hover:text-red-600 transition-colors"
                >
                  清空历史
                </button>
              </div>
              <div class="space-y-1 mt-2">
                <div
                  v-for="suggestion in searchSuggestions"
                  :key="suggestion.id"
                  @click="selectSearchSuggestion(suggestion.content)"
                  class="flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-50 cursor-pointer group"
                >
                  <div class="flex items-center flex-1 min-w-0">
                    <span class="text-gray-400 mr-2">🔍</span>
                    <span class="truncate text-gray-700">{{ suggestion.content }}</span>
                  </div>
                  <div class="flex items-center space-x-2 ml-2">
                    <span class="text-xs text-gray-400">
                      {{ new Date(suggestion.timestamp).toLocaleDateString() }}
                    </span>
                    <button
                      @click="removeSearchItem(suggestion.id, $event)"
                      class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-xs"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 模型选择 -->
          <div class="flex items-center justify-between mt-3 text-sm text-gray-500">
            <div class="flex items-center space-x-4">
              <span>模型：</span>
              <div class="flex items-center space-x-2">
                <a-select
                  :value="modelsStore.selectedModelId"
                  @change="handleModelChange"
                  style="width: 180px"
                  size="small"
                  :options="
                    modelsStore.models.map((m) => ({
                      label: `${getModelIcon(m.id)} ${m.name}`,
                      value: m.id,
                    }))
                  "
                />
              </div>
              <!-- 清空上下文按钮 -->
              <button
                @click="showClearContextConfirm"
                class="flex items-center space-x-1 px-3 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                :disabled="!chatStore.currentChat || chatStore.currentChat.messages.length === 0"
                :class="{
                  'opacity-50 cursor-not-allowed':
                    !chatStore.currentChat || chatStore.currentChat.messages.length === 0,
                }"
              >
                <span>🗑️</span>
                <span>清空上下文</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 清空上下文确认对话框 -->
    <a-modal v-model:open="showClearConfirm" title="清空对话上下文" centered :width="400">
      <div class="text-center py-4">
        <div class="text-6xl mb-4">⚠️</div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">确认清空当前对话？</h3>
        <p class="text-gray-600">
          此操作将清空当前对话的所有消息历史，<br />
          但不会删除对话本身。此操作不可撤销。
        </p>
      </div>
      <template #footer>
        <div class="flex justify-center space-x-3">
          <a-button @click="cancelClearContext">取消</a-button>
          <a-button type="primary" danger @click="confirmClearContext"> 确认清空 </a-button>
        </div>
      </template>
    </a-modal>

    <!-- 文件上传弹窗 -->
    <a-modal
      v-model:open="showFileUploadModal"
      title="上传文件"
      centered
      :width="600"
      :footer="null"
    >
      <div class="py-4">
        <div class="mb-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">选择要上传的文件：</h4>
          <FileUpload
            v-model="uploadedFiles"
            @upload="handleFileUpload"
            :max-count="5"
            :max-size="10"
            accept=".txt,.md,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
          />
        </div>

        <div v-if="uploadedFiles.length > 0" class="mb-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">已选择的文件：</h4>
          <div class="text-sm text-gray-600 space-y-2">
            <div
              v-for="file in uploadedFiles"
              :key="file.id"
              class="flex items-center justify-between space-x-2 py-2 px-3 bg-gray-50 rounded border"
            >
              <div class="flex items-center space-x-2 flex-1 min-w-0">
                <span>📎</span>
                <span class="truncate font-medium">{{ file.name }}</span>
                <span class="text-xs text-gray-400 flex-shrink-0"
                  >({{ formatFileSize(file.size) }})</span
                >
              </div>
              <div class="flex items-center space-x-2 flex-shrink-0">
                <!-- 文件内容状态 -->
                <span
                  v-if="file.content && file.content.trim()"
                  class="text-xs text-green-600"
                  title="文件内容已读取"
                >
                  ✓ 内容已读取 ({{ file.content.length }} 字符)
                </span>
                <span
                  v-else-if="
                    file.type.startsWith('text/') ||
                    file.name.endsWith('.md') ||
                    file.name.endsWith('.txt')
                  "
                  class="text-xs text-orange-600"
                  title="文本文件但内容为空"
                >
                  ⚠ 内容为空
                </span>
                <span v-else class="text-xs text-blue-600" title="非文本文件"> 📁 二进制文件 </span>

                <!-- 上传状态 -->
                <span v-if="file.uploadStatus === 'success'" class="text-xs text-green-600">
                  ✓ 已上传
                </span>
                <span v-else-if="file.uploadStatus === 'uploading'" class="text-xs text-blue-600">
                  🔄 上传中...
                </span>
                <span v-else-if="file.uploadStatus === 'error'" class="text-xs text-red-600">
                  ✗ 上传失败
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="text-xs text-gray-500 mb-4 space-y-1">
          <div>💡 <strong>支持的文件类型：</strong></div>
          <div class="ml-4">
            • <span class="text-green-600">文本文件</span>：.txt, .md - AI可直接读取内容并分析<br />
            • <span class="text-blue-600">文档文件</span>：.pdf, .doc, .docx - 需要上传到Kimi
            API进行处理<br />
            • <span class="text-purple-600">图片文件</span>：.jpg, .png, .gif - 支持上传和引用
          </div>
          <div class="mt-2">⚠️ 注意：空文件或无内容的文本文件无法上传到Kimi API。</div>
        </div>

        <div class="flex justify-end space-x-3">
          <a-button @click="closeFileUploadModal">取消</a-button>
          <a-button
            type="primary"
            @click="confirmUploadFiles"
            :disabled="uploadedFiles.length === 0"
          >
            确认上传 ({{ uploadedFiles.length }})
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 对话列表的平滑滚动 */
.chat-scroll {
  scroll-behavior: smooth;
}

/* 搜索下拉菜单的平滑动画 */
.search-dropdown-scroll {
  scroll-behavior: smooth;
}

/* 消息卡片的微妙动画 */
.bg-white {
  transform: translateZ(0);
}

/* 按钮微交互 */
button {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

button:active {
  transform: scale(0.98);
}

/* 输入框焦点效果 */
input:focus {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
</style>
