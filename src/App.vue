<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import ChatDialog from './components/ChatDialog.vue'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { useModelsStore } from '@/stores/models'

// Store
const chatStore = useChatHistoryStore()
const modelsStore = useModelsStore()

// 聊天弹窗状态
const chatModalVisible = ref(false)
const currentChatAgent = ref('')
const currentChatColor = ref('blue')

// 新建对话
const newChat = () => {
  chatStore.createChat(modelsStore.selectedModelId)
}
</script>

<template>
  <div class="h-screen bg-slate-50 flex">
    <!-- 左侧边栏 -->
    <div class="w-64 bg-white border-r border-gray-200 flex flex-col scrollbar-thin">
      <!-- Logo 区域 -->
      <div class="p-4 border-b border-gray-100">
        <div class="flex items-center space-x-2">
          <div
            class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center"
          >
            <span class="text-white font-bold text-sm">H</span>
          </div>
          <span class="font-semibold text-gray-800">Hello AI</span>
        </div>
      </div>

      <!-- 导航菜单
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
      </div> -->

      <!-- 对话历史 -->
      <div class="flex-1 p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-700">最近对话</span>
          <PlusOutlined @click="newChat" class="text-gray-400 hover:text-gray-600 cursor-pointer" />
        </div>
        <div class="space-y-1">
          <div
            v-for="chat in chatStore.chats"
            :key="chat.id"
            class="p-3 rounded-lg cursor-pointer transition-colors"
            :class="chat.id === chatStore.currentChatId ? 'bg-gray-100' : 'hover:bg-gray-50'"
            @click="chatStore.setCurrentChat(chat.id)"
          >
            <div class="text-sm text-gray-700 truncate">{{ chat.title }}</div>
            <div class="text-xs text-gray-400 mt-1">
              {{ chat.model }} · {{ new Date(chat.updatedAt).toLocaleDateString() }}
            </div>
          </div>
          <!-- 无对话时的提示 -->
          <div v-if="chatStore.chats.length === 0" class="text-center py-8">
            <div class="text-gray-400 text-sm">暂无对话历史</div>
            <div class="text-gray-400 text-xs mt-1">点击上方 + 号开始新对话</div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="p-4 border-t border-gray-100">
        <div
          v-if="chatStore.chats.length > 0"
          @click="chatStore.clearAllChats"
          class="flex items-center space-x-2 text-sm text-red-500 cursor-pointer hover:text-red-700 mb-2"
        >
          <span>🗑️</span>
          <span>清除所有对话</span>
        </div>
        <div
          class="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800"
        >
          <span>↵</span>
          <span>导入聊天对话</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 - 路由视图 -->
    <div class="flex-1 flex flex-col">
      <!-- 路由组件渲染区域 -->
      <router-view />
    </div>

    <!-- 用户头像 -->
    <div class="fixed bottom-8 right-8">
      <div
        class="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors"
      >
        <UserOutlined class="text-white" />
      </div>
    </div>

    <!-- 右下角帮助按钮 -->
    <div class="fixed bottom-8 right-24">
      <div
        class="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
      >
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
      <ChatDialog :agent="currentChatAgent" :agent-color="currentChatColor" />
    </Modal>
  </div>
</template>
