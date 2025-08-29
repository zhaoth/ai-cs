import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export interface FileAttachment {
  id: string
  name: string
  size: number
  type: string
  url?: string // 本地预览URL或上传后的远程URL
  content?: string // 文件内容（文本文件）或base64数据
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error'
  kimiFileId?: string // Kimi API返回的文件ID
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  timestamp: Date
  attachments?: FileAttachment[] // 文件附件
}

export interface Chat {
  id: string
  title: string
  model: string
  selectedModelId: string // 当前会话选择的模型ID
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

export const useChatHistoryStore = defineStore('chatHistory', () => {
  // 使用 VueUse 的 useLocalStorage 实现本地持久化存储
  const chats = useLocalStorage<Chat[]>('ai-chat-conversations', [], {
    serializer: {
      read: (value: string) => {
        try {
          const parsed = JSON.parse(value)
          // 确保日期字段正确恢复
          return parsed.map((chat: Partial<Chat>) => ({
            ...chat,
            createdAt: new Date(chat.createdAt || new Date()),
            updatedAt: new Date(chat.updatedAt || new Date()),
            messages: (chat.messages || []).map((msg: Partial<Message>) => ({
              ...msg,
              timestamp: new Date(msg.timestamp || new Date()),
            })),
          })) as Chat[]
        } catch {
          return []
        }
      },
      write: (value: Chat[]) => {
        return JSON.stringify(value)
      },
    },
  })

  const currentChatId = useLocalStorage<string | null>('ai-chat-current-id', null)

  const currentChat = computed(() => {
    if (!currentChatId.value) return null
    return chats.value.find((chat) => chat.id === currentChatId.value) || null
  })

  const sortedChats = computed(() => {
    return [...chats.value].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  })

  function createChat(model: string, initialMessage?: string) {
    const newChat: Chat = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title:
        (initialMessage && initialMessage.length > 0) 
          ? (initialMessage.substring(0, 20) + (initialMessage.length > 20 ? '...' : '')) 
          : '新对话',
      model,
      selectedModelId: model, // 初始化为传入的模型
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    chats.value.push(newChat)
    currentChatId.value = newChat.id
    return newChat.id
  }

  function addMessage(chatId: string, message: Omit<Message, 'id' | 'timestamp'>): string {
    const chat = chats.value.find((c) => c.id === chatId)
    if (chat) {
      const newMessage: Message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        ...message,
        timestamp: new Date(),
      }

      chat.messages.push(newMessage)
      chat.updatedAt = new Date()

      // 更新聊天标题（如果是第一条消息）
      if (chat.messages.length === 1 && message.role === 'user') {
        chat.title = message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '')
      }

      return newMessage.id
    }
    throw new Error('Chat not found')
  }

  function setCurrentChat(chatId: string) {
    currentChatId.value = chatId
  }

  function deleteChat(chatId: string) {
    const index = chats.value.findIndex((c) => c.id === chatId)
    if (index !== -1) {
      chats.value.splice(index, 1)
      if (currentChatId.value === chatId) {
        currentChatId.value = chats.value.length > 0 ? chats.value[0].id : null
      }
    }
  }

  function clearAllChats() {
    chats.value = []
    currentChatId.value = null
  }

  // 删除单个消息
  function deleteMessage(chatId: string, messageId: string): boolean {
    const chat = chats.value.find((c) => c.id === chatId)
    if (chat) {
      const messageIndex = chat.messages.findIndex((m) => m.id === messageId)
      if (messageIndex !== -1) {
        chat.messages.splice(messageIndex, 1)
        chat.updatedAt = new Date()

        // 如果删除后没有消息了，重置标题
        if (chat.messages.length === 0) {
          chat.title = '新对话'
        }

        return true
      }
    }
    return false
  }

  // 清空当前对话的所有消息
  function clearCurrentChatMessages() {
    if (currentChatId.value) {
      const chat = chats.value.find((c) => c.id === currentChatId.value)
      if (chat) {
        chat.messages = []
        chat.title = '新对话'
        chat.updatedAt = new Date()
      }
    }
  }

  // 更新当前会话的模型选择
  function updateCurrentChatModel(modelId: string) {
    if (currentChatId.value) {
      const chat = chats.value.find((c) => c.id === currentChatId.value)
      if (chat) {
        chat.selectedModelId = modelId
        chat.updatedAt = new Date()
      }
    }
  }

  // 数据验证和初始化逻辑
  function validateAndInitialize() {
    // 验证当前选中的聊天是否存在
    if (currentChatId.value && !chats.value.find((chat) => chat.id === currentChatId.value)) {
      currentChatId.value = chats.value.length > 0 ? chats.value[0].id : null
    }

    // 兼容旧数据：为没有 selectedModelId 的会话添加默认值
    chats.value.forEach((chat) => {
      if (!chat.selectedModelId) {
        chat.selectedModelId = chat.model || 'kimi'
      }
    })
  }

  // 批量删除聊天会话
  function deleteChatsBatch(chatIds: string[]) {
    if (chatIds.length === 0) return

    // 批量删除指定的聊天会话
    chats.value = chats.value.filter((chat) => !chatIds.includes(chat.id))

    // 如果当前聊天在删除列表中，需要更新当前聊天ID
    if (currentChatId.value && chatIds.includes(currentChatId.value)) {
      currentChatId.value = chats.value.length > 0 ? chats.value[0].id : null
    }
  }

  // 获取存储统计信息
  function getStorageStats() {
    const totalChats = chats.value.length
    const totalMessages = chats.value.reduce((sum, chat) => sum + chat.messages.length, 0)
    const oldestChat = chats.value.reduce(
      (oldest, chat) => (!oldest || chat.createdAt < oldest.createdAt ? chat : oldest),
      null as Chat | null,
    )
    const newestChat = chats.value.reduce(
      (newest, chat) => (!newest || chat.updatedAt > newest.updatedAt ? chat : newest),
      null as Chat | null,
    )

    return {
      totalChats,
      totalMessages,
      oldestChatDate: oldestChat?.createdAt,
      newestChatDate: newestChat?.updatedAt,
    }
  }

  // 初始化时验证数据
  validateAndInitialize()

  return {
    chats: sortedChats,
    currentChat,
    currentChatId,
    createChat,
    addMessage,
    deleteMessage,
    setCurrentChat,
    deleteChat,
    deleteChatsBatch,
    clearAllChats,
    clearCurrentChatMessages,
    updateCurrentChatModel,
    validateAndInitialize,
    getStorageStats,
  }
})
