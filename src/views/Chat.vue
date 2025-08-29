<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { useModelsStore, type Model } from '@/stores/models'
import ModelInfo from '@/components/ModelInfo.vue'

const chatStore = useChatHistoryStore()
const modelsStore = useModelsStore()

const inputMessage = ref('')
const loading = ref(false)

// 创建初始聊天
onMounted(() => {
  if (!chatStore.currentChatId && chatStore.chats.length === 0) {
    modelsStore.selectModel('kimi')
    chatStore.createChat('kimi')
  }
})

const sendMessage = () => {
  if (!inputMessage.value.trim() || loading.value) return

  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''

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

  // 模拟AI回复
  loading.value = true
  setTimeout(
    () => {
      const aiResponse = generateModelResponse(modelsStore.selectedModel, userMessage)
      chatStore.addMessage(chatId, {
        role: 'assistant',
        content: aiResponse,
        model: modelsStore.selectedModelId,
      })
      loading.value = false
    },
    1000 + Math.random() * 1500,
  )
}

// 根据不同模型生成个性化回复
const generateModelResponse = (model: Model, userMessage: string): string => {
  const responses = {
    kimi: [
      `作为 Kimi，我很高兴为您解答！关于"${userMessage}"这个问题，让我基于我的长文本理解能力为您详细分析：\n\n从多个维度来看，这个问题涉及到几个关键要点...\n\n🧠 深度思考：我建议您可以从以下角度进一步探索这个话题。`,
      `您好！我是 Kimi，Moonshot AI 的智能助手。针对您提到的"${userMessage}"，我可以为您提供一些深入的见解：\n\n📖 基于我的长文本理解能力，这个问题的核心在于...\n\n💡 建议：让我们一起深入探讨这个话题的各个层面。`,
      `很有趣的问题！作为专注于长文本理解的 Kimi，我想从一个更全面的角度来回答您关于"${userMessage}"的疑问：\n\n🔍 深入分析表明...\n\n这是一个值得进一步讨论的话题，您还有什么想了解的吗？`,
    ],
    'deepseek-v3.1': [
      `我是 DeepSeek v3.1，很高兴为您解答。关于"${userMessage}"：\n\n作为具备强大推理和代码能力的AI模型，让我从多个角度来分析...`,
      `您好！作为 DeepSeek 的最新一代模型，针对"${userMessage}"这个问题，我可以提供以下见解...\n\n🔮 让我们一起探索这个问题的深层次解答！`,
    ],
  }

  const modelResponses = responses[model.id as keyof typeof responses] || responses['kimi']
  return modelResponses[Math.floor(Math.random() * modelResponses.length)]
}

/**
 * 格式化时间戳为本地时间字符串
 * @param timestamp - 日期对象
 * @returns 格式化后的时间字符串（仅时间部分）
 */
const formatTime = (timestamp: Date): string => {
  return timestamp.toLocaleTimeString()
}

/**
 * 格式化日期为本地日期字符串
 * @param timestamp - 日期对象
 * @returns 格式化后的日期字符串（仅日期部分）
 */
const formatDate = (timestamp: Date): string => {
  return timestamp.toLocaleDateString()
}
</script>

<template>
  <div class="flex flex-col h-full max-w-6xl mx-auto">
    <!-- 头部 -->
    <header class="border-b border-gray-200 py-4 px-6">
      <div class="flex items-center justify-center">
        <h1 class="text-2xl font-bold text-gray-800">AI 助手</h1>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- 侧边栏 - 历史记录 -->
      <div class="w-64 border-r border-gray-200 flex flex-col">
        <div class="p-4">
          <a-button
            type="primary"
            @click="chatStore.createChat(modelsStore.selectedModelId)"
            class="w-full"
          >
            新建对话
          </a-button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div
            v-for="chat in chatStore.chats"
            :key="chat.id"
            class="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
            :class="{ 'bg-blue-50': chat.id === chatStore.currentChatId }"
            @click="chatStore.setCurrentChat(chat.id)"
          >
            <div class="font-medium text-gray-800 truncate">{{ chat.title }}</div>
            <div class="text-xs text-gray-500 mt-1">
              {{ chat.model }} · {{ formatDate(chat.updatedAt) }}
            </div>
            <div class="text-xs text-gray-500 mt-2 line-clamp-2">
              {{ chat.messages[0]?.content || '新对话' }}
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-200">
          <a-button @click="chatStore.clearAllChats" type="link" class="text-red-500">
            清除所有历史记录
          </a-button>
        </div>
      </div>

      <!-- 主聊天区域 -->
      <div class="flex-1 flex flex-col">
        <!-- 消息显示区域 -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- 模型信息 -->
          <ModelInfo />

          <div
            v-if="!chatStore.currentChat || chatStore.currentChat.messages.length === 0"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center">
              <h2 class="text-2xl font-medium text-gray-700 mb-2">AI 助手</h2>
              <p class="text-gray-500">开始一个新的对话，选择不同的模型获取回答</p>
            </div>
          </div>

          <div v-else class="space-y-6">
            <div
              v-for="message in chatStore.currentChat.messages"
              :key="message.id"
              class="flex"
              :class="{ 'justify-end': message.role === 'user' }"
            >
              <div
                class="max-w-3xl rounded-lg p-4"
                :class="{
                  'bg-blue-500 text-white': message.role === 'user',
                  'bg-gray-100 text-gray-800': message.role === 'assistant',
                }"
              >
                <div class="font-medium text-sm mb-1">
                  {{ message.role === 'user' ? '你' : modelsStore.selectedModel.name }}
                </div>
                <div>{{ message.content }}</div>
                <div class="text-xs opacity-70 mt-2">
                  {{ formatTime(message.timestamp) }}
                </div>
              </div>
            </div>

            <div v-if="loading" class="flex justify-start">
              <div class="max-w-3xl rounded-lg bg-gray-100 p-4">
                <div class="font-medium text-sm mb-1">
                  {{
                    modelsStore.models.find((m) => m.id === modelsStore.selectedModelId)?.name ||
                    modelsStore.selectedModelId
                  }}
                </div>
                <div class="flex space-x-2">
                  <div class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                  <div
                    class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style="animation-delay: 0.2s"
                  ></div>
                  <div
                    class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style="animation-delay: 0.4s"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="border-t border-gray-200 p-4">
          <div class="max-w-4xl mx-auto">
            <div class="flex">
              <a-textarea
                v-model:value="inputMessage"
                placeholder="输入消息..."
                :auto-size="{ minRows: 2, maxRows: 6 }"
                class="flex-1"
                @pressEnter="sendMessage"
              />
              <a-button
                type="primary"
                class="ml-4 h-full"
                :disabled="!inputMessage.trim() || loading"
                @click="sendMessage"
              >
                发送
              </a-button>
            </div>
            <div class="text-xs text-gray-500 mt-2">按 Enter 发送，Shift + Enter 换行</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
