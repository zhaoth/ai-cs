<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, SendOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import ChatDialog from './components/ChatDialog.vue'

// 聊天历史数据
const chatHistory = ref([
  { id: 1, title: '提案对话', time: '刚刚', active: true }
])

// 当前输入
const currentInput = ref('')

// 聊天弹窗状态
const chatModalVisible = ref(false)
const currentChatAgent = ref('')
const currentChatColor = ref('blue')

// AI 对话数据
const conversations = ref([
  {
    id: 1,
    agent: '高效问答',
    question: '在城市化进程中，公共空间如何影响居民的社会互动？',
    answer: '城市化进程中，公共空间的设计和布局对居民社会互动产生深远影响...',
    color: 'text-blue-600'
  },
  {
    id: 2,
    agent: '思维导图',
    question: '在英语流式中，如何让一道菜常爱更美味？',
    answer: '提升菜品美味度的关键要素包括食材选择、烹饪技法、调味搭配...',
    color: 'text-blue-600'
  },
  {
    id: 3,
    agent: '脑心绘画',
    question: '立体中国风饭，一直漂浮在云层之上的老者城堡，由无数紫色白色阴影摇摆而成，每一朵雾想是...',
    answer: '这是一个富有想象力的中国风场景描述，融合了传统建筑与奇幻元素...',
    color: 'text-blue-600'
  }
])

// 功能按钮
const functionButtons = ref([
  { icon: '🤖', label: '智能体' },
  { icon: '🎨', label: '画心作画' },
  { icon: '📄', label: '文档分析' },
  { icon: '🧠', label: '思维导图' },
  { icon: '🎵', label: '阅读音乐' }
])

// 当前模型
const currentModel = ref('claude-4-sonnet')

// 打开聊天弹窗
const openChatModal = (agent: string) => {
  currentChatAgent.value = agent
  currentChatColor.value = 'blue' // 根据agent设置不同颜色
  chatModalVisible.value = true
}

// 发送消息
const sendMessage = () => {
  if (currentInput.value.trim()) {
    console.log('发送消息:', currentInput.value)
    // 这里可以添加实际的消息发送逻辑
    currentInput.value = ''
  }
}

// 新建对话
const newChat = () => {
  const newId = chatHistory.value.length + 1
  chatHistory.value.forEach(chat => chat.active = false)
  chatHistory.value.unshift({
    id: newId,
    title: `新对话 ${newId}`,
    time: '刚刚',
    active: true
  })
}

// 点击功能按钮
const clickFunctionButton = (label: string) => {
  console.log('点击功能按钮:', label)
  // 根据不同功能按钮打开对应的聊天
  if (label === '智能体') {
    openChatModal('智能助手')
  } else if (label === '思维导图') {
    openChatModal('思维导图')
  } else if (label === '画心作画') {
    openChatModal('脑心绘画')
  }
}
</script>

<template>
  <div class="h-screen bg-slate-50 flex bg-red-500">
    <!-- 左侧边栏 -->
    <div class="w-64 bg-white border-r border-gray-200 flex flex-col scrollbar-thin">
      <!-- Logo 区域 -->
      <div class="p-4 border-b border-gray-100">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">在</span>
          </div>
          <span class="font-semibold text-gray-800">在问</span>
        </div>
      </div>

      <!-- 导航菜单 -->
      <div class="p-4 space-y-2">
        <div class="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg cursor-pointer">
          <QuestionCircleOutlined class="text-gray-600" />
          <span class="text-sm font-medium text-gray-700">高效问答</span>
        </div>
        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
          <div class="w-4 h-4 rounded border border-gray-300"></div>
          <span class="text-sm text-gray-600">分享广场</span>
        </div>
        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
          <div class="w-4 h-4 rounded border border-gray-300"></div>
          <span class="text-sm text-gray-600">开放平台</span>
        </div>
      </div>

      <!-- 对话历史 -->
      <div class="flex-1 p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-700">最近对话</span>
          <PlusOutlined @click="newChat" class="text-gray-400 hover:text-gray-600 cursor-pointer" />
        </div>
        <div class="space-y-1">
          <div 
            v-for="chat in chatHistory" 
            :key="chat.id"
            class="p-3 rounded-lg cursor-pointer transition-colors"
            :class="chat.active ? 'bg-gray-100' : 'hover:bg-gray-50'"
          >
            <div class="text-sm text-gray-700">{{ chat.title }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ chat.time }}</div>
          </div>
        </div>
      </div>

      <!-- 底部入口 -->
      <div class="p-4 border-t border-gray-100">
        <div class="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
          <span>↵</span>
          <span>导入聊天对话</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col">
      <!-- 顶部标题区 -->
      <div class="text-center py-12">
        <h1 class="text-2xl font-semibold text-gray-800 mb-2">
          在问 | <span class="text-primary-600">让知识无界，智能触手可及</span>
        </h1>
      </div>

      <!-- 对话内容区 -->
      <div class="flex-1 px-8 pb-6 overflow-y-auto">
        <div class="max-w-4xl mx-auto space-y-6">
          <div 
            v-for="conv in conversations" 
            :key="conv.id"
            class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div class="mb-4">
              <span 
                @click="openChatModal(conv.agent)"
                :class="[conv.color, 'font-medium cursor-pointer hover:underline']"
              >
                {{ conv.agent }}
              </span>
              <span class="ml-2 text-gray-700">{{ conv.question }}</span>
            </div>
            <div class="text-gray-600 leading-relaxed">
              {{ conv.answer }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入区 -->
      <div class="border-t border-gray-200 bg-white p-6">
        <div class="max-w-4xl mx-auto">
          <!-- 功能按钮 -->
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
          </div>

          <!-- 输入框区域 -->
          <div class="relative">
            <div class="flex items-center bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-200">
              <div class="pl-4">
                <div class="w-6 h-6 bg-gradient-to-br from-primary-500 to-primary-600 rounded flex items-center justify-center">
                  <span class="text-white text-xs">📎</span>
                </div>
              </div>
              <input
                v-model="currentInput"
                @keydown.ctrl.enter="sendMessage"
                type="text"
                placeholder="请输入你的问题(Ctrl+Enter快捷)"
                class="flex-1 bg-transparent px-4 py-4 outline-none text-gray-700 placeholder-gray-400"
              />
              <div class="pr-4">
                <button 
                  @click="sendMessage"
                  class="w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-lg flex items-center justify-center transition-colors"
                >
                  <SendOutlined class="text-white text-sm" />
                </button>
              </div>
            </div>
            
            <!-- 模型选择 -->
            <div class="flex items-center justify-between mt-3 text-sm text-gray-500">
              <div class="flex items-center space-x-4">
                <span>模型：</span>
                <div class="flex items-center space-x-2">
                  <div class="w-4 h-4 bg-orange-400 rounded"></div>
                  <span>{{ currentModel }}</span>
                  <span class="cursor-pointer">▼</span>
                </div>
                <span class="cursor-pointer">🔗 联网搜索</span>
                <span class="cursor-pointer">🔗 深度搜索</span>
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
    </div>

    <!-- 右侧浮动助手卡片 -->
    <div class="fixed top-1/2 right-8 transform -translate-y-1/2">
      <div class="bg-gray-700 text-white rounded-2xl p-6 w-64 shadow-xl">
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 bg-blue-500 rounded-full flex items-center justify-center">
            <div class="relative">
              <div class="w-8 h-8 border-4 border-white rounded-full"></div>
              <div class="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full"></div>
              <div class="absolute -top-2 left-1/2 transform -translate-x-1/2 w-1 h-3 bg-white"></div>
              <div class="absolute -top-2 -left-1 w-1 h-3 bg-white transform rotate-45"></div>
              <div class="absolute -top-2 -right-1 w-1 h-3 bg-white transform -rotate-45"></div>
            </div>
          </div>
          <h3 class="font-semibold mb-2">高效问答</h3>
          <p class="text-sm text-gray-300 leading-relaxed">
            在社交媒体上如何有效提升个人品牌？
          </p>
        </div>
      </div>
    </div>

    <!-- 用户头像 -->
    <div class="fixed bottom-8 right-8">
      <div class="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors">
        <UserOutlined class="text-white" />
      </div>
    </div>

    <!-- 右下角帮助按钮 -->
    <div class="fixed bottom-8 right-24">
      <div class="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors">
        <span class="text-white text-sm">AI</span>
      </div>
    </div>

    <!-- 聊天弹窗 -->
    <Modal
      v-model:open="chatModalVisible"
      :title="null"
      :footer="null"
      width="800px"
      height="600px"
      :bodyStyle="{ padding: 0, height: '600px' }"
      centered
    >
      <ChatDialog 
        :agent="currentChatAgent" 
        :agent-color="currentChatColor" 
      />
    </Modal>
  </div>
</template>