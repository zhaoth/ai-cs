<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { message } from 'ant-design-vue'

interface ChatMessage {
  id: number
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  agent?: string
}

interface Props {
  agent: string
  agentColor: string
}

const props = defineProps<Props>()

// 聊天消息列表
const messages = ref<ChatMessage[]>([])
const currentInput = ref('')
const loading = ref(false)
const chatContainer = ref<HTMLElement>()

// 模拟AI回复
const simulateAIResponse = async (): Promise<string> => {
  // 根据不同agent返回不同类型的回复
  const responses = {
    '高效问答': [
      '这是一个很好的问题。基于当前的研究和实践，我认为...',
      '让我为您详细分析一下这个问题的各个方面...',
      '从多个角度来看，这个问题可以这样理解...'
    ],
    '思维导图': [
      '我来为您构建一个思维导图来解析这个问题:\n\n1. 核心概念\n   - 主要特征\n   - 关键要素\n\n2. 相关因素\n   - 内部因素\n   - 外部影响\n\n3. 解决方案\n   - 短期策略\n   - 长期规划',
      '让我用结构化的方式来分析...'
    ],
    '脑心绘画': [
      '基于您的描述，我可以为您创作一个视觉概念:\n\n【图像描述】\n一幅充满创意的画面，融合了您提到的元素...',
      '这是一个富有想象力的创作思路...'
    ]
  }
  
  const agentResponses = responses[props.agent as keyof typeof responses] || responses['高效问答']
  const randomResponse = agentResponses[Math.floor(Math.random() * agentResponses.length)]
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
  
  return randomResponse
}

// 发送消息
const sendMessage = async () => {
  if (!currentInput.value.trim() || loading.value) return

  const userMessage = currentInput.value.trim()
  currentInput.value = ''

  // 添加用户消息
  messages.value.push({
    id: Date.now(),
    type: 'user',
    content: userMessage,
    timestamp: new Date()
  })

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  // 显示加载状态
  loading.value = true

  try {
    // 获取AI回复
    const aiResponse = await simulateAIResponse()
    
    // 添加AI回复
    messages.value.push({
      id: Date.now() + 1,
      type: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
      agent: props.agent
    })

    // 滚动到底部
    await nextTick()
    scrollToBottom()

  } catch {
    message.error('发送消息失败，请重试')
  } finally {
    loading.value = false
  }
}

// 滚动到底部
const scrollToBottom = () => {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

// 格式化时间
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// 处理Enter键发送
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <!-- 聊天标题 -->
    <div class="px-6 py-4 border-b border-gray-100">
      <div class="flex items-center space-x-2">
        <div class="w-3 h-3 rounded-full" :class="`bg-${agentColor}-500`"></div>
        <h2 class="font-semibold text-gray-800">{{ agent }}</h2>
      </div>
    </div>

    <!-- 聊天消息区域 -->
    <div 
      ref="chatContainer"
      class="flex-1 overflow-y-auto px-6 py-4 space-y-4"
    >
      <div v-if="messages.length === 0" class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <span class="text-2xl">💬</span>
        </div>
        <p class="text-gray-500">开始与 {{ agent }} 对话吧！</p>
      </div>

      <div 
        v-for="msg in messages" 
        :key="msg.id"
        class="flex"
        :class="msg.type === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div 
          class="max-w-[70%] rounded-2xl px-4 py-3"
          :class="msg.type === 'user' 
            ? 'bg-primary-600 text-white' 
            : 'bg-gray-100 text-gray-800'"
        >
          <div v-if="msg.type === 'assistant'" class="text-xs text-gray-500 mb-1">
            {{ msg.agent }}
          </div>
          <div class="whitespace-pre-wrap">{{ msg.content }}</div>
          <div 
            class="text-xs mt-2 opacity-70"
            :class="msg.type === 'user' ? 'text-purple-200' : 'text-gray-400'"
          >
            {{ formatTime(msg.timestamp) }}
          </div>
        </div>
      </div>

      <!-- 加载指示器 -->
      <div v-if="loading" class="flex justify-start">
        <div class="bg-gray-100 text-gray-800 rounded-2xl px-4 py-3 max-w-[70%]">
          <div class="flex items-center space-x-2">
            <div class="flex space-x-1">
              <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
            <span class="text-sm text-gray-500">{{ agent }} 正在思考...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="px-6 py-4 border-t border-gray-100">
      <div class="flex items-end space-x-3">
        <div class="flex-1">
          <textarea
            v-model="currentInput"
            @keydown="handleKeydown"
            placeholder="输入您的问题..."
            class="w-full px-4 py-3 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
            rows="1"
            :disabled="loading"
          ></textarea>
        </div>
        <button
          @click="sendMessage"
          :disabled="!currentInput.trim() || loading"
          class="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
        >
          <svg 
            class="w-5 h-5 text-white" 
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
        </button>
      </div>
    </div>
  </div>
</template>