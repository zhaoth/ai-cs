<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
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
import { callUnifiedAiApi } from '@/services/aiApiService'

const chatStore = useChatHistoryStore()
const modelsStore = useModelsStore()
const searchStore = useSearchHistoryStore()

const inputMessage = ref('')
const loading = ref(false)

// 聊天容器引用，用于自动滚动
const chatContainer = ref<HTMLElement | null>(null)

// 流式输出状态
const streamingMessageId = ref<string | null>(null)
const streamingContent = ref('')

// 停止控制器
const abortController = ref<AbortController | null>(null)

// 搜索建议相关状态
const showSearchSuggestions = ref(false)
const searchInputFocused = ref(false)

// 搜索历史管理状态
const showSearchHistoryModal = ref(false)

// 当前会话的模型选择（计算属性）
const currentChatModelId = computed(() => {
  return chatStore.currentChat?.selectedModelId || modelsStore.selectedModelId
})

// 当前会话的模型信息
const currentChatModel = computed(() => {
  const modelId = currentChatModelId.value
  return modelsStore.models.find((model) => model.id === modelId) || modelsStore.models[0]
})

// 清空上下文确认对话框状态
const showClearConfirm = ref(false)

// 文件上传弹窗状态
const showFileUploadModal = ref(false)
const uploadedFiles = ref<FileAttachment[]>([])

// 待发送的文件（用户上传但未发送的文件）
const pendingFiles = ref<FileAttachment[]>([])

// 消息反馈状态管理
const messageFeedback = ref<Record<string, { liked: boolean; disliked: boolean }>>({})

// 复制选项显示状态
const showCopyOptions = ref<Record<string, boolean>>({})

// Markdown 框内复制选项显示状态
const showMarkdownCopyOptions = ref<Record<string, boolean>>({})

// 处理文件上传 - 使用新的抽象文件服务
const handleFileUpload = async (file: FileAttachment) => {
  try {
    file.uploadStatus = 'uploading'

    // 使用统一的文件处理服务
    const { processFilesForModel } = await import('@/services/fileService')
    await processFilesForModel(currentChatModelId.value, [file])

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

// 已移除：uploadFileToKimi - 现在使用统一的文件服务抽象
// 此函数的功能已集成到 /services/fileService.ts 中的 KimiFileProcessor

// 打开文件上传弹窗

// 关闭文件上传弹窗
const closeFileUploadModal = () => {
  showFileUploadModal.value = false
}

// 确认上传文件（修改为仅存储文件，不立即发送）
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

  // 将有效文件添加到待发送列表
  pendingFiles.value = [...validFiles]

  // 关闭文件上传弹窗
  showFileUploadModal.value = false

  const skippedCount = uploadedFiles.value.length - validFiles.length
  const successMessage = `成功准备 ${validFiles.length} 个文件${skippedCount > 0 ? `，跳过 ${skippedCount} 个无效文件` : ''}，点击发送按钮即可一起发送给AI`
  message.success(successMessage)

  uploadedFiles.value = [] // 清空上传文件列表
}

// 发送包含文件附件的消息
const sendMessageWithFiles = async (messageText: string, files: FileAttachment[]) => {
  if (loading.value) return

  // 确保有当前聊天
  let chatId = chatStore.currentChatId
  if (!chatId) {
    chatId = chatStore.createChat(currentChatModelId.value, messageText)
  }

  // 添加用户消息（包含文件附件）
  chatStore.addMessage(chatId, {
    role: 'user',
    content: messageText,
    model: currentChatModelId.value,
    attachments: files,
  })

  // 用户发送消息后立即滚动到底部
  await scrollToBottom(true)

  // 创建一个空的AI回复消息，用于流式输出
  const aiMessageId = chatStore.addMessage(chatId, {
    role: 'assistant',
    content: '', // 初始为空
    model: currentChatModelId.value,
  })

  // 设置流式状态
  streamingMessageId.value = aiMessageId
  streamingContent.value = ''
  loading.value = true

  // 创建新的 AbortController
  abortController.value = new AbortController()

  try {
    // 调用支持文件的AI API
    let aiResponse
    try {
      aiResponse = await callAiAPIWithFiles(currentChatModelId.value, files)
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      aiResponse = generateFileAwareResponse(currentChatModelId.value, files)
    }

    // 模拟流式输出效果（因为文件API可能不支持流式）
    streamingContent.value = ''
    for (let i = 0; i < aiResponse.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 50)) // 30-80ms间隔
      const char = aiResponse[i]
      streamingContent.value += char

      // 更新消息内容
      const chat = chatStore.chats.find((c) => c.id === chatId)
      if (chat) {
        const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
        if (messageIndex !== -1) {
          chat.messages[messageIndex].content = streamingContent.value
        }
      }

      // 流式输出时自动滚动
      scrollToBottom(false)
    }

    // 确保最终内容一致
    const chat = chatStore.chats.find((c) => c.id === chatId)
    if (chat) {
      const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
      if (messageIndex !== -1) {
        chat.messages[messageIndex].content = aiResponse
      }
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    const chat = chatStore.chats.find((c) => c.id === chatId)
    if (chat) {
      const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
      if (messageIndex !== -1) {
        chat.messages[messageIndex].content =
          `抱歉，处理文件时发生错误: ${error instanceof Error ? error.message : '未知错误'}`
      }
    }
  } finally {
    // 清理流式状态
    loading.value = false
    streamingMessageId.value = null
    streamingContent.value = ''
    abortController.value = null // 清理 AbortController
  }
}

// 调用AI API（包含文件上下文）- 使用新的抽象服务
const callAiAPIWithFiles = async (modelId: string, files: FileAttachment[]): Promise<string> => {
  // 获取当前对话的所有消息作为上下文
  const currentMessages = chatStore.currentChat?.messages || []

  // 构建包含文件信息的上下文
  const contextMessages = currentMessages
    // 重要：过滤掉空的assistant消息，避免API错误
    .filter((msg) => !(msg.role === 'assistant' && !msg.content.trim()))
    .map((msg) => {
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

  // 限制上下文长度，最多读取2个对话（用户+AI = 4条消息）
  const maxMessages = 4
  const limitedMessages =
    contextMessages.length > maxMessages ? contextMessages.slice(-maxMessages) : contextMessages

  // 使用新的统一文件处理服务
  try {
    // 导入文件服务
    const { callAiApiWithFiles } = await import('@/services/fileService')
    return await callAiApiWithFiles(modelId, limitedMessages, files)
  } catch (error) {
    console.error('统一API调用失败，降级到原有逻辑:', error)
    // 降级处理：使用原有的callAiAPI
    return await callAiAPI(modelId)
  }
}

// 已移除：callKimiAPIWithFiles - 现在使用统一的文件服务抽象
// 此函数的功能已集成到 /services/fileService.ts 中

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
  // 只有当输入框有内容时才返回搜索建议
  if (!inputMessage.value.trim()) {
    return []
  }
  return searchStore.searchInHistory(inputMessage.value)
})

// 监听输入框内容变化，显示/隐藏搜索建议
watch(inputMessage, (newValue) => {
  // 只有当输入框有内容且获得焦点时才显示搜索建议
  if (searchInputFocused.value && newValue.length > 0) {
    showSearchSuggestions.value = true
  } else {
    showSearchSuggestions.value = false
  }
})

// 获取模型图标
const getModelIcon = (modelId: string) => {
  const icons: Record<string, string> = {
    kimi: '🌙',
    'deepseek-v3.1': '🔮',
  }
  return icons[modelId] || '🤖'
}

// 获取消息对应的模型图标（使用消息自己的模型信息）
const getMessageModelIcon = (message: Message) => {
  return getModelIcon(message.model || 'kimi')
}

// 获取消息对应的模型名称
const getMessageModelName = (message: Message) => {
  const modelId = message.model || 'kimi'
  const model = modelsStore.models.find((m) => m.id === modelId)
  return model?.name || 'AI助手'
}

// 停止当前发送的消息
const stopGeneration = () => {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }

  // 保留已生成的内容，不清空 streamingContent
  if (streamingMessageId.value && chatStore.currentChat) {
    const chat = chatStore.currentChat
    const messageIndex = chat.messages.findIndex((m) => m.id === streamingMessageId.value)
    if (messageIndex !== -1) {
      const currentContent = chat.messages[messageIndex].content
      // 保持已生成的内容，不添加停止标记（让用户看到真实生成的内容）
      // 只有当内容为空时，才显示友好的停止提示
      if (!currentContent || currentContent.trim() === '') {
        chat.messages[messageIndex].content = '💭 生成已停止'
      }
      // 否则保持当前内容不变，让用户看到已生成的部分
    }
  }

  // 停止流式输出状态
  loading.value = false
  streamingMessageId.value = null
  streamingContent.value = '' // 只清空流式缓存，不影响已存储的消息内容

  message.info('已停止生成')
}

// 处理模型选择变化
const handleModelChange = (modelId: string) => {
  // 更新当前会话的模型选择
  chatStore.updateCurrentChatModel(modelId)
  // 同时更新全局默认模型（为新会话做准备）
  modelsStore.selectModel(modelId)
}

// 输入框聚焦处理
const handleInputFocus = () => {
  searchInputFocused.value = true
  // 只有当输入框有内容时才显示搜索建议
  if (inputMessage.value.length > 0) {
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
  showSearchHistoryModal.value = false
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

// 打开搜索历史管理弹窗
const openSearchHistoryModal = () => {
  showSearchHistoryModal.value = true
}

// 显示清空上下文确认对话框
const showClearContextConfirm = () => {
  if (!chatStore.currentChat || chatStore.currentChat.messages.length === 0) {
    message.info('当前没有可清空的对话内容')
    return
  }
  showClearConfirm.value = true
}

// 自动滚动到底部函数
const scrollToBottom = async (smooth = true) => {
  await nextTick()
  if (chatContainer.value) {
    const scrollOptions: ScrollToOptions = {
      top: chatContainer.value.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    }
    chatContainer.value.scrollTo(scrollOptions)
  }
}

// 监听流式输出状态变化，自动滚动
watch(
  [streamingContent, () => chatStore.currentChat?.messages],
  async () => {
    // 在流式输出过程中或有新消息时自动滚动
    if (
      streamingMessageId.value ||
      (chatStore.currentChat && chatStore.currentChat.messages.length > 0)
    ) {
      await scrollToBottom(true)
    }
  },
  { deep: true },
)

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

// 复制消息内容（纯文本）
const copyMessage = async (content: string) => {
  try {
    // 获取纯文本内容（去除 Markdown 语法）
    const textToCopy = getMessageTextForCopy(content)
    await navigator.clipboard.writeText(textToCopy)
    message.success('纯文本内容已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：创建临时文本域
    const textarea = document.createElement('textarea')
    textarea.value = getMessageTextForCopy(content)
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      message.success('纯文本内容已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动复制')
    }
    document.body.removeChild(textarea)
  }
}

// 切换复制选项显示状态
const toggleCopyOptions = (messageId: string) => {
  showCopyOptions.value[messageId] = !showCopyOptions.value[messageId]
  // 关闭其他消息的复制选项
  Object.keys(showCopyOptions.value).forEach((id) => {
    if (id !== messageId) {
      showCopyOptions.value[id] = false
    }
  })
  // 关闭 Markdown 框内的复制选项
  Object.keys(showMarkdownCopyOptions.value).forEach((id) => {
    showMarkdownCopyOptions.value[id] = false
  })
}

// 切换 Markdown 框内复制选项显示状态
const toggleMarkdownCopyOptions = (messageId: string) => {
  showMarkdownCopyOptions.value[messageId] = !showMarkdownCopyOptions.value[messageId]
  // 关闭其他消息的 Markdown 框内复制选项
  Object.keys(showMarkdownCopyOptions.value).forEach((id) => {
    if (id !== messageId) {
      showMarkdownCopyOptions.value[id] = false
    }
  })
  // 关闭底部的复制选项
  Object.keys(showCopyOptions.value).forEach((id) => {
    showCopyOptions.value[id] = false
  })
}
const copyMarkdownMessage = async (content: string) => {
  try {
    // 直接复制原始 Markdown 内容
    await navigator.clipboard.writeText(content)
    message.success('Markdown 格式已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：创建临时文本域
    const textarea = document.createElement('textarea')
    textarea.value = content
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      message.success('Markdown 格式已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动复制')
    }
    document.body.removeChild(textarea)
  }
}

// 删除单个消息
const deleteMessage = (messageId: string) => {
  if (!chatStore.currentChatId) {
    message.error('没有当前聊天')
    return
  }

  const success = chatStore.deleteMessage(chatStore.currentChatId, messageId)
  if (success) {
    message.success('消息已删除')
  } else {
    message.error('删除失败')
  }
}

// 重新生成回复（支持流式显示）
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

  // 用原消息的ID直接替换内容，保持消息位置
  const chatId = chatStore.currentChatId
  const chat = chatStore.chats.find((c) => c.id === chatId)
  const targetMessageIndex = chat?.messages.findIndex((m) => m.id === messageObj.id)

  if (!chat || targetMessageIndex === undefined || targetMessageIndex === -1) {
    message.error('无法找到目标消息')
    return
  }

  // 保存原始内容，用于错误恢复
  const originalContent = messageObj.content

  // 清空内容并设置流式状态
  chat.messages[targetMessageIndex].content = ''
  streamingMessageId.value = messageObj.id
  streamingContent.value = ''
  loading.value = true

  try {
    // 重新生成时传递完整上下文
    let aiResponse
    try {
      aiResponse = await callAiAPIStreaming(currentChatModelId.value, (chunk) => {
        // 实时更新流式内容
        streamingContent.value += chunk
        chat.messages[targetMessageIndex].content = streamingContent.value

        // 重新生成时也自动滚动
        scrollToBottom(false)
      })
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      // API调用失败时使用上下文感知的模拟回复
      const contextMessages =
        chatStore.currentChat?.messages
          .slice(0, targetMessageIndex) // 只取重新生成之前的消息
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          })) || []

      const mockResponse = generateContextAwareResponse(currentChatModelId.value, contextMessages)

      // 模拟打字机效果
      for (let i = 0; i < mockResponse.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 50))
        const char = mockResponse[i]
        streamingContent.value += char
        chat.messages[targetMessageIndex].content = streamingContent.value

        // 重新生成模拟时也自动滚动
        scrollToBottom(false)
      }

      aiResponse = mockResponse
    }

    // 确保最终内容一致
    chat.messages[targetMessageIndex].content = aiResponse
    message.success('已重新生成回复')
  } catch (error) {
    console.error('重新生成失败:', error)
    // 恢复原来的内容
    chat.messages[targetMessageIndex].content = originalContent
    message.error('重新生成失败，请稍后重试')
  } finally {
    // 清理流式状态
    loading.value = false
    streamingMessageId.value = null
    streamingContent.value = ''
    abortController.value = null // 清理 AbortController
  }
}

// 创建初始聊天
onMounted(() => {
  if (!chatStore.currentChatId && chatStore.chats.length === 0) {
    // 使用默认模型创建会话
    const defaultModel = 'kimi'
    modelsStore.selectModel(defaultModel)
    chatStore.createChat(defaultModel)
  }

  // 页面加载后滚动到底部（如果有历史消息）
  nextTick(() => {
    if (chatStore.currentChat && chatStore.currentChat.messages.length > 0) {
      scrollToBottom(false)
    }
  })

  // 添加全局点击事件监听器，用于关闭复制选项菜单
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    // 检查点击目标是否在复制按钮或菜单内
    if (!target.closest('.relative')) {
      // 关闭所有复制选项菜单
      Object.keys(showCopyOptions.value).forEach((id) => {
        showCopyOptions.value[id] = false
      })
      Object.keys(showMarkdownCopyOptions.value).forEach((id) => {
        showMarkdownCopyOptions.value[id] = false
      })
    }
  })
})

const sendMessage = async () => {
  if (!inputMessage.value.trim() || loading.value) return

  const userMessage = inputMessage.value.trim()

  // 将搜索内容添加到历史记录
  searchStore.addSearchItem(userMessage)

  inputMessage.value = ''
  showSearchSuggestions.value = false

  // 检查是否有待发送的文件
  if (pendingFiles.value.length > 0) {
    // 如果有待发送文件，使用文件发送逻辑
    await sendMessageWithFiles(userMessage, pendingFiles.value)
    // 清空待发送文件列表
    pendingFiles.value = []
    return
  }

  // 确保有当前聊天
  let chatId = chatStore.currentChatId
  if (!chatId) {
    chatId = chatStore.createChat(currentChatModelId.value, userMessage)
  }

  // 添加用户消息（无文件附件）
  chatStore.addMessage(chatId, {
    role: 'user',
    content: userMessage,
    model: currentChatModelId.value,
  })

  // 用户发送消息后立即滚动到底部
  await scrollToBottom(true)

  // 创建一个空的AI回复消息，用于流式输出
  const aiMessageId = chatStore.addMessage(chatId, {
    role: 'assistant',
    content: '', // 初始为空
    model: currentChatModelId.value,
  })

  // 设置流式状态
  streamingMessageId.value = aiMessageId
  streamingContent.value = ''
  loading.value = true

  // 创建新的 AbortController
  abortController.value = new AbortController()

  try {
    // 调用流式AI API
    let aiResponse
    try {
      aiResponse = await callAiAPIStreaming(currentChatModelId.value, (chunk) => {
        // 实时更新流式内容
        streamingContent.value += chunk

        // 找到对应的消息并更新内容
        const chat = chatStore.chats.find((c) => c.id === chatId)
        if (chat) {
          const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
          if (messageIndex !== -1) {
            chat.messages[messageIndex].content = streamingContent.value
          }
        }

        // 流式输出时自动滚动到底部
        scrollToBottom(false) // 使用非平滑滚动，提高性能
      })
    } catch (error) {
      console.error('AI API调用失败，使用模拟回复:', error)
      // API调用失败时使用上下文感知的模拟回复

      // 模拟流式输出效果
      const contextMessages =
        chatStore.currentChat?.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) || []

      const mockResponse = generateContextAwareResponse(currentChatModelId.value, contextMessages)

      // 模拟打字机效果
      for (let i = 0; i < mockResponse.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 50)) // 30-80ms间隔
        const char = mockResponse[i]
        streamingContent.value += char

        // 更新消息内容
        const chat = chatStore.chats.find((c) => c.id === chatId)
        if (chat) {
          const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
          if (messageIndex !== -1) {
            chat.messages[messageIndex].content = streamingContent.value
          }
        }

        // 模拟打字机效果时也自动滚动
        scrollToBottom(false)
      }

      aiResponse = mockResponse
    }

    // 确保最终内容一致
    const chat = chatStore.chats.find((c) => c.id === chatId)
    if (chat) {
      const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
      if (messageIndex !== -1) {
        chat.messages[messageIndex].content = aiResponse
      }
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    // 添加错误消息
    const chat = chatStore.chats.find((c) => c.id === chatId)
    if (chat) {
      const messageIndex = chat.messages.findIndex((m) => m.id === aiMessageId)
      if (messageIndex !== -1) {
        chat.messages[messageIndex].content =
          `抱歉，发送失败: ${error instanceof Error ? error.message : '未知错误'}`
      }
    }
  } finally {
    // 清理流式状态
    loading.value = false
    streamingMessageId.value = null
    streamingContent.value = ''
    abortController.value = null // 清理 AbortController
  }
}

// 流式 AI API 调用函数，支持实时显示
const callAiAPIStreaming = async (
  modelId: string,
  onStreamChunk: (chunk: string) => void,
): Promise<string> => {
  // 获取当前对话的所有消息作为上下文
  const currentMessages = chatStore.currentChat?.messages || []

  // 将内部消息格式转换为API所需格式，保持上下文连续性
  // 重要：过滤掉空的assistant消息，避免API错误
  const contextMessages = currentMessages
    .filter((msg) => !(msg.role === 'assistant' && !msg.content.trim()))
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

  // 限制上下文长度，最多读取2个对话（用户+AI = 4条消息）
  const maxMessages = 4
  const limitedMessages =
    contextMessages.length > maxMessages ? contextMessages.slice(-maxMessages) : contextMessages

  try {
    // 使用统一的API调用服务，传递流式回调和AbortController
    return await callUnifiedAiApi(modelId, limitedMessages, {
      temperature: 0.7,
      maxTokens: 1000,
      stream: true,
      onStreamChunk, // 传递流式回调函数
      abortController: abortController.value || undefined, // 传递AbortController
    })
  } catch (error) {
    // 如果API调用失败，降级到模拟回复
    console.error(`AI API调用失败 [${modelId}]:`, error)
    return generateContextAwareResponse(modelId, limitedMessages)
  }
}

// 通用AI API调用函数（保留旧的非流式方式，用于兼容）
const callAiAPI = async (modelId: string): Promise<string> => {
  // 获取当前对话的所有消息作为上下文
  const currentMessages = chatStore.currentChat?.messages || []

  // 将内部消息格式转换为API所需格式，保持上下文连续性
  // 重要：过滤掉空的assistant消息，避免API错误
  const contextMessages = currentMessages
    .filter((msg) => !(msg.role === 'assistant' && !msg.content.trim()))
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

  // 限制上下文长度，最多读取2个对话（用户+AI = 4条消息）
  const maxMessages = 4
  const limitedMessages =
    contextMessages.length > maxMessages ? contextMessages.slice(-maxMessages) : contextMessages

  try {
    // 使用统一的API调用服务
    return await callUnifiedAiApi(modelId, limitedMessages, {
      temperature: 0.7,
      maxTokens: 1000,
      stream: true,
    })
  } catch (error) {
    // 如果API调用失败，降级到模拟回复
    console.error(`AI API调用失败 [${modelId}]:`, error)
    return generateContextAwareResponse(modelId, limitedMessages)
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
    'deepseek-v3.1': [
      `${contextualIntro}我是 DeepSeek v3.1，${hasContext ? '结合我们之前的对话，' : ''}我来回答您关于"${latestMessage}"的问题：\n\n🔮 ${hasContext ? '基于我们的对话历史，' : ''}我运用强大的推理和代码能力来分析...\n\n🤖 ${hasContext ? '从我们的交流中，' : ''}我可以为您提供更深入的技术解决方案和理解。`,
      `${contextualIntro}您好！作为 DeepSeek 的最新一代模型，${hasContext ? '我结合我们的对话上下文' : '我会运用先进的AI能力'}来回答"${latestMessage}"：\n\n🐎 ${hasContext ? '考虑到我们讨论的连贯性，' : ''}我将为您提供准确、深入的分析和建议...\n\n🎆 ${hasContext ? '基于我们之前的交流，' : ''}让我们一起探索这个问题的深层次解答！`,
    ],
  }

  const responses =
    contextualResponses[modelId as keyof typeof contextualResponses] || contextualResponses['kimi']
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
    <div ref="chatContainer" class="flex-1 px-8 pb-6 overflow-y-auto chat-scroll">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- 加载状态 -->
        <div v-if="loading" class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="text-2xl">{{ getModelIcon(currentChatModelId) }}</div>
              <div class="flex-1">
                <h4 class="font-medium text-gray-800 mb-2">
                  {{ currentChatModel.name }} 正在思考...
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
            <!-- 停止按钮 -->
            <button
              @click="stopGeneration"
              class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors flex items-center space-x-2"
              title="停止生成"
            >
              <span>⏹️</span>
              <span>停止</span>
            </button>
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
            class="group bg-white rounded-xl p-6 shadow-sm border border-gray-100 transition-all duration-300 hover:shadow-md hover:border-gray-200"
          >
            <div class="flex items-start space-x-3 mb-4">
              <div class="text-2xl">
                {{ message.role === 'user' ? '👤' : getMessageModelIcon(message) }}
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-medium text-gray-800 mb-2">
                  {{
                    message.role === 'user' ? '你的问题' : `${getMessageModelName(message)} 的回复`
                  }}
                </h4>
                <!-- 消息内容显示 -->
                <div class="relative">
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

                  <!-- Markdown 内容框中的浮动复制按钮 -->
                  <div
                    v-if="messageHasMarkdown(message.content)"
                    class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  >
                    <div class="relative">
                      <button
                        @click="toggleMarkdownCopyOptions(message.id)"
                        class="p-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-gray-600 hover:text-gray-800"
                        :class="{
                          'text-blue-600 bg-blue-50/90': showMarkdownCopyOptions[message.id],
                        }"
                        title="复制 Markdown 内容"
                      >
                        <span class="text-sm">📋</span>
                        <span class="text-xs ml-1">▼</span>
                      </button>

                      <!-- Markdown 框内复制选项下拉菜单 -->
                      <div
                        v-if="showMarkdownCopyOptions[message.id]"
                        class="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-40 copy-options-dropdown"
                      >
                        <button
                          @click="
                            () => {
                              copyMarkdownMessage(message.content)
                              showMarkdownCopyOptions[message.id] = false
                            }
                          "
                          class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center space-x-2"
                        >
                          <span>📄</span>
                          <span>Markdown 格式</span>
                        </button>
                        <div class="border-t border-gray-100 my-1"></div>
                        <button
                          @click="
                            () => {
                              copyMessage(message.content)
                              showMarkdownCopyOptions[message.id] = false
                            }
                          "
                          class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors flex items-center space-x-2"
                        >
                          <span>📝</span>
                          <span>纯文本格式</span>
                        </button>
                      </div>
                    </div>
                  </div>
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
              </div>
            </div>
            <!-- 消息操作按钮区域（每个消息都有） -->
            <div class="flex items-center justify-between pt-3 border-t border-gray-100">
              <!-- 时间和删除按钮 -->
              <div class="flex items-center space-x-2">
                <div class="text-xs text-gray-400">
                  {{ new Date(message.timestamp).toLocaleTimeString() }}
                </div>
                <!-- 删除按钮（所有消息都有） -->
                <button
                  @click="deleteMessage(message.id)"
                  class="flex items-center space-x-1 text-xs text-red-500 hover:text-red-700 transition-colors opacity-0 group-hover:opacity-100"
                  title="删除这条消息"
                >
                  <span>🗑️</span>
                  <span>删除</span>
                </button>
              </div>

              <!-- AI回复的交互按钮 -->
              <div v-if="message.role === 'assistant'" class="flex items-center space-x-3">
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

                <!-- 复制按钮区域 -->
                <div class="relative">
                  <!-- Markdown 内容的复制按钮（支持两种格式） -->
                  <template v-if="messageHasMarkdown(message.content)">
                    <button
                      @click="toggleCopyOptions(message.id)"
                      class="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      :class="{ 'text-blue-600': showCopyOptions[message.id] }"
                    >
                      <span>📋</span>
                      <span>复制</span>
                      <span class="text-xs ml-1">▼</span>
                    </button>

                    <!-- 复制选项下拉菜单 -->
                    <div
                      v-if="showCopyOptions[message.id]"
                      class="absolute bottom-full mb-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-36 copy-options-dropdown"
                    >
                      <button
                        @click="
                          () => {
                            copyMarkdownMessage(message.content)
                            showCopyOptions[message.id] = false
                          }
                        "
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center space-x-2 copy-button-hover"
                      >
                        <span>📄</span>
                        <span>Markdown 格式</span>
                      </button>
                      <div class="border-t border-gray-100 my-1"></div>
                      <button
                        @click="
                          () => {
                            copyMessage(message.content)
                            showCopyOptions[message.id] = false
                          }
                        "
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors flex items-center space-x-2 copy-button-hover"
                      >
                        <span>📝</span>
                        <span>纯文本格式</span>
                      </button>
                    </div>
                  </template>

                  <!-- 非 Markdown 内容的普通复制按钮 -->
                  <template v-else>
                    <button
                      @click="copyMessage(message.content)"
                      class="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <span>📋</span>
                      <span>复制</span>
                    </button>
                  </template>
                </div>

                <button
                  @click="loading ? stopGeneration() : regenerateResponse(message)"
                  class="flex items-center space-x-1 text-sm transition-colors"
                  :class="
                    loading
                      ? 'text-red-600 hover:text-red-700'
                      : 'text-blue-600 hover:text-blue-700'
                  "
                >
                  <span>{{ loading ? '⏹️' : '🔄' }}</span>
                  <span>{{ loading ? '停止生成' : '重新生成' }}</span>
                </button>
              </div>
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
        <!-- 待发送文件显示区域 -->
        <div v-if="pendingFiles.length > 0" class="mb-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center space-x-2">
                <span class="text-blue-600 text-sm font-medium"
                  >📎 待发送文件 ({{ pendingFiles.length }})</span
                >
              </div>
              <button
                @click="pendingFiles = []"
                class="text-blue-500 hover:text-blue-700 text-sm transition-colors"
                title="清空待发送文件"
              >
                清空
              </button>
            </div>
            <div class="space-y-2">
              <div
                v-for="(file, index) in pendingFiles"
                :key="index"
                class="flex items-center justify-between bg-white rounded p-2 border border-blue-100"
              >
                <div class="flex items-center space-x-2 flex-1 min-w-0">
                  <span class="text-blue-500">📄</span>
                  <span class="text-sm text-gray-700 truncate">{{ file.name }}</span>
                  <span class="text-xs text-gray-500">({{ formatFileSize(file.size) }})</span>
                </div>
                <button
                  @click="pendingFiles.splice(index, 1)"
                  class="text-gray-400 hover:text-red-500 transition-colors ml-2"
                  title="移除此文件"
                >
                  ✕
                </button>
              </div>
            </div>
            <div class="text-xs text-blue-600 mt-2">💡 点击发送按钮将文件与消息一起发送给AI</div>
          </div>
        </div>

        <!-- 输入框区域 -->
        <div class="relative">
          <div
            class="flex items-center bg-gray-50 rounded-2xl transition-all duration-300 ease-in-out"
          >
            <div class="pl-4 flex items-center space-x-2">
              <!-- 搜索历史按钮 -->
              <button
                @click="openSearchHistoryModal"
                class="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-105 hover:shadow-lg"
                title="查看搜索历史 (共 {{ searchStore.searchHistory.length }} 条记录)"
              >
                <span class="text-white text-xs transition-transform duration-200 hover:scale-110"
                  >🕰️</span
                >
              </button>
            </div>
            <input
              v-model="inputMessage"
              @keydown.ctrl.enter="loading ? stopGeneration() : sendMessage()"
              @focus="handleInputFocus"
              @blur="handleInputBlur"
              type="text"
              :placeholder="
                loading
                  ? '正在生成中，按Ctrl+Enter停止'
                  : pendingFiles.length > 0
                    ? `已准备${pendingFiles.length}个文件，输入消息后点击发送(Ctrl+Enter)`
                    : '请输入你的问题(Ctrl+Enter快捷)'
              "
              class="flex-1 bg-transparent px-4 py-4 outline-none border-none ring-0 ring-offset-0 text-gray-700 placeholder-gray-400 focus:ring-0 focus:ring-offset-0 focus:border-transparent focus-visible:outline-none focus-visible:ring-0"
            />
            <div class="pr-4">
              <button
                @click="loading ? stopGeneration() : sendMessage()"
                :disabled="!loading && !inputMessage.trim() && pendingFiles.length === 0"
                class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                :class="
                  loading
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed'
                "
                :title="
                  loading
                    ? '停止生成'
                    : pendingFiles.length > 0
                      ? `发送消息及${pendingFiles.length}个文件`
                      : '发送消息'
                "
              >
                <template v-if="loading">
                  <!-- 停止图标 -->
                  <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
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
                <span>🔍 搜索建议</span>
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
                  :value="currentChatModelId"
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

    <!-- 搜索历史管理弹窗 -->
    <a-modal
      v-model:open="showSearchHistoryModal"
      title="搜索历史管理"
      centered
      :width="600"
      :footer="null"
    >
      <div class="py-4">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="text-lg">🕰️</span>
            <h3 class="text-lg font-medium text-gray-800">最近搜索</h3>
            <span class="text-sm text-gray-500"
              >(共 {{ searchStore.searchHistory.length }} 条记录)</span
            >
          </div>
          <a-button
            v-if="searchStore.searchHistory.length > 0"
            danger
            size="small"
            @click="clearSearchHistory"
          >
            清空全部
          </a-button>
        </div>

        <div v-if="searchStore.searchHistory.length === 0" class="text-center py-8">
          <div class="text-gray-400 text-6xl mb-4 animate-pulse">🔍</div>
          <p class="text-gray-500">暂无搜索历史</p>
          <p class="text-gray-400 text-sm mt-1">开始搜索后将显示在这里</p>
        </div>

        <div v-else class="space-y-2 max-h-96 overflow-y-auto search-dropdown-scroll">
          <div
            v-for="(item, index) in searchStore.searchHistory"
            :key="item.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all duration-200 group hover:shadow-sm"
            :style="{ animationDelay: `${index * 50}ms` }"
          >
            <div
              class="flex items-center flex-1 min-w-0 cursor-pointer"
              @click="selectSearchSuggestion(item.content)"
            >
              <span class="text-gray-400 mr-3 transition-colors group-hover:text-blue-500">🔍</span>
              <div class="flex-1 min-w-0">
                <p
                  class="text-gray-700 truncate font-medium group-hover:text-gray-900 transition-colors"
                >
                  {{ item.content }}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {{ new Date(item.timestamp).toLocaleString() }}
                </p>
              </div>
            </div>
            <div class="flex items-center space-x-2 ml-3">
              <a-button
                size="small"
                type="text"
                @click="selectSearchSuggestion(item.content)"
                class="text-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                使用
              </a-button>
              <a-button
                size="small"
                type="text"
                danger
                @click="removeSearchItem(item.id, $event)"
                class="opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-50"
              >
                删除
              </a-button>
            </div>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-gray-200">
          <div class="text-xs text-gray-500 space-y-1">
            <p>💡 <strong>使用提示：</strong></p>
            <p class="ml-4">• 点击搜索记录可快速填入到输入框</p>
            <p class="ml-4">• 搜索历史会自动去重并按时间排序</p>
            <p class="ml-4">• 最多保存 50 条搜索记录</p>
          </div>
        </div>
      </div>
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
  transform: translateY(-2px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 输入框容器动画效果 */
.flex.items-center.bg-gray-50.rounded-2xl {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.flex.items-center.bg-gray-50.rounded-2xl:focus-within {
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  transform: translateY(-2px);
}
</style>
