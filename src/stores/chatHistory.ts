import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  timestamp: Date
}

export interface Chat {
  id: string
  title: string
  model: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

export const useChatHistoryStore = defineStore('chatHistory', () => {
  const chats = ref<Chat[]>([])
  const currentChatId = ref<string | null>(null)

  const currentChat = computed(() => {
    if (!currentChatId.value) return null
    return chats.value.find(chat => chat.id === currentChatId.value) || null
  })

  const sortedChats = computed(() => {
    return [...chats.value].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  })

  function createChat(model: string, initialMessage?: string) {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: initialMessage?.substring(0, 20) + (initialMessage && initialMessage.length > 20 ? '...' : '') || '新对话',
      model,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    chats.value.push(newChat)
    currentChatId.value = newChat.id
    return newChat.id
  }

  function addMessage(chatId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    const chat = chats.value.find(c => c.id === chatId)
    if (chat) {
      const newMessage: Message = {
        id: Date.now().toString(),
        ...message,
        timestamp: new Date()
      }
      
      chat.messages.push(newMessage)
      chat.updatedAt = new Date()
      
      // 更新聊天标题（如果是第一条消息）
      if (chat.messages.length === 1 && message.role === 'user') {
        chat.title = message.content.substring(0, 20) + (message.content.length > 20 ? '...' : '')
      }
    }
  }

  function setCurrentChat(chatId: string) {
    currentChatId.value = chatId
  }

  function deleteChat(chatId: string) {
    const index = chats.value.findIndex(c => c.id === chatId)
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

  return {
    chats: sortedChats,
    currentChat,
    currentChatId,
    createChat,
    addMessage,
    setCurrentChat,
    deleteChat,
    clearAllChats
  }
})