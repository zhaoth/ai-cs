<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { useModelsStore, type Model } from '@/stores/models'
import { type Message } from '@/stores/chatHistory'
import { useSearchHistoryStore } from '@/stores/searchHistory'

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

// 消息反馈状态管理
const messageFeedback = ref<Record<string, { liked: boolean; disliked: boolean }>>({})

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
    await navigator.clipboard.writeText(content)
    message.success('内容已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：创建临时文本域
    const textarea = document.createElement('textarea')
    textarea.value = content
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
    let aiResponse
    if (modelsStore.selectedModelId === 'kimi') {
      aiResponse = await callKimiAPI()
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      aiResponse = generateModelResponse(modelsStore.selectedModel, userMessage.content)
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
    let aiResponse
    if (modelsStore.selectedModelId === 'kimi') {
      // 调用真实的 Kimi API，传递完整上下文
      aiResponse = await callKimiAPI()
    } else {
      // 其他模型的模拟回复
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))
      aiResponse = generateModelResponse(modelsStore.selectedModel, userMessage)
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

// 调用 Kimi API，传递完整对话上下文
const callKimiAPI = async (): Promise<string> => {
  const apiKey = modelsStore.getApiKey('Moonshot')

  if (!apiKey) {
    throw new Error('Kimi API Key 未配置')
  }

  // 获取当前对话的所有消息
  const currentMessages = chatStore.currentChat?.messages || []

  // 将内部消息格式转换为 Kimi API 所需的格式
  const messages = currentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))

  // 为避免上下文过长，只保留最近的 20 条消息
  const maxMessages = 20
  const limitedMessages = messages.length > maxMessages ? messages.slice(-maxMessages) : messages

  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: limitedMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || '抱歉，我无法回复您的消息。'
  } catch (error) {
    console.error('Kimi API 调用失败:', error)
    throw new Error(`Kimi API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 根据不同模型生成个性化回复
const generateModelResponse = (model: Model, userMessage: string): string => {
  const responses = {
    kimi: [
      `作为 Kimi，我很高兴为您解答！关于"${userMessage}"这个问题，让我基于我的长文本理解能力为您详细分析：\n\n从多个维度来看，这个问题涉及到几个关键要点...\n\n🧠 深度思考：我建议您可以从以下角度进一步探索这个话题。`,
      `您好！我是 Kimi，Moonshot AI 的智能助手。针对您提到的"${userMessage}"，我可以为您提供一些深入的见解：\n\n📖 基于我的长文本理解能力，这个问题的核心在于...\n\n💡 建议：让我们一起深入探讨这个话题的各个层面。`,
      `很有趣的问题！作为专注于长文本理解的 Kimi，我想从一个更全面的角度来回答您关于"${userMessage}"的疑问：\n\n🔍 深入分析表明...\n\n这是一个值得进一步讨论的话题，您还有什么想了解的吗？`,
    ],
    'gpt-4': [
      `作为 GPT-4，我将为您提供详细和准确的回答。关于"${userMessage}"：\n\n这是一个很好的问题，让我从多个角度来分析...`,
      `基于我的训练和知识，关于"${userMessage}"这个问题，我认为...\n\n希望这个回答对您有帮助！`,
    ],
    'claude-2': [
      `我是 Claude 2，很高兴为您解答。关于"${userMessage}"：\n\n我会以平衡和安全的方式来回应您的问题...`,
      `作为注重安全性的 AI 助手，我对"${userMessage}"的看法是...`,
    ],
    'llama-2': [
      `作为开源的 Llama 2 模型，我很乐意帮助您。关于"${userMessage}"：\n\n基于我的开源训练数据...`,
      `Llama 2 在这里为您服务！对于"${userMessage}"这个问题...`,
    ],
    'palm-2': [
      `我是 Google 的 PaLM 2 模型。关于"${userMessage}"：\n\n让我运用我的多模态能力来回答...`,
      `作为 PaLM 2，我可以为您提供以下见解关于"${userMessage}"...`,
    ],
  }

  const modelResponses = responses[model.id as keyof typeof responses] || responses['gpt-4']
  return modelResponses[Math.floor(Math.random() * modelResponses.length)]
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
                <div class="text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {{ message.content }}
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
        <!-- 功能按钮
        <div class="flex items-center justify-center space-x-6 mb-4">
          <div
            v-for="btn in functionButtons"
            :key="btn.label"
            @click="clickFunctionButton(btn.label)"
            class="flex flex-col items-center cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
          >
            <div class="text-2xl mb-1">{{ btn.icon }}</div>
            <span class="text-xs text-gray-600">{{ btn.label }}</span>
          </div>
        </div> -->

        <!-- 输入框区域 -->
        <div class="relative">
          <div
            class="flex items-center bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-200"
          >
            <div class="pl-4">
              <div
                class="w-6 h-6 bg-gradient-to-br from-primary-500 to-primary-600 rounded flex items-center justify-center"
              >
                <span class="text-white text-xs">📎</span>
              </div>
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
              <span class="cursor-pointer">🔗 联网搜索</span>
              <span class="cursor-pointer">🔗 深度搜索</span>
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
            <div class="flex items-center space-x-2">
              <span>✉️ 关键</span>
              <span>📎</span>
              <span>🎤</span>
            </div>
          </div>
        </div>

        <!-- 底部信息 -->
        <div class="text-center text-xs text-gray-400 mt-4">
          以上内容均由AI生成，仅供参考智能建议，请理性参考
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
