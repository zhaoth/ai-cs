<script setup lang="ts">
import { PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue'
import { useChatHistoryStore } from '@/stores/chatHistory'

// Props
interface Props {
  collapsed: boolean
  isMobile: boolean
}
defineProps<Props>()

// Emits
const emit = defineEmits<{
  toggle: []
  newChat: []
}>()

// Store
const chatStore = useChatHistoryStore()

// 新建对话
const handleNewChat = () => {
  emit('newChat')
}

// 切换侧边栏
const handleToggle = () => {
  emit('toggle')
}

// 设置当前对话
const setCurrentChat = (chatId: string) => {
  chatStore.setCurrentChat(chatId)
}

// 清除所有对话
const clearAllChats = () => {
  chatStore.clearAllChats()
}
</script>

<template>
  <div
    class="bg-white border-r border-gray-200 flex flex-col scrollbar-thin transition-all duration-300 ease-in-out"
    :class="[collapsed ? 'w-16' : 'w-64', isMobile ? 'fixed left-0 top-0 h-full z-30' : 'relative']"
  >
    <!-- Logo 区域和收起按钮 -->
    <div class="p-4 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <!-- Logo 区域 -->
        <div class="flex items-center space-x-2 flex-1">
          <div
            class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center"
          >
            <span class="text-white font-bold text-sm">H</span>
          </div>
          <span
            v-show="!collapsed"
            class="font-semibold text-gray-800 transition-opacity duration-200"
          >
            Hello AI
          </span>
        </div>
        <!-- 收起按钮 -->
        <button
          @click="handleToggle"
          class="p-1.5 rounded-md hover:bg-gray-100 transition-colors duration-200"
          :title="collapsed ? '展开侧边栏 (Ctrl/Cmd + B)' : '收起侧边栏 (Ctrl/Cmd + B)'"
        >
          <MenuFoldOutlined v-if="!collapsed" class="text-gray-600" />
        </button>
      </div>
    </div>

    <!-- 对话历史 -->
    <div class="flex-1 p-4">
      <div class="flex items-center justify-between mb-3">
        <span
          v-show="!collapsed"
          class="text-sm font-medium text-gray-700 transition-opacity duration-200"
        >
          最近对话
        </span>
        <div :title="collapsed ? '新建对话' : ''" class="relative">
          <PlusOutlined
            @click="handleNewChat"
            class="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            :class="collapsed ? 'text-base' : ''"
          />
        </div>
      </div>
      <div class="space-y-1">
        <div
          v-for="chat in chatStore.chats"
          :key="chat.id"
          class="rounded-lg cursor-pointer transition-all duration-200"
          :class="[
            chat.id === chatStore.currentChatId ? 'bg-gray-100' : 'hover:bg-gray-50',
            collapsed ? 'p-2 justify-center' : 'p-3',
          ]"
          @click="setCurrentChat(chat.id)"
          :title="collapsed ? chat.title : ''"
        >
          <div v-if="collapsed" class="flex justify-center">
            <div class="w-2 h-2 bg-primary-500 rounded-full"></div>
          </div>
          <div v-else>
            <div class="text-sm text-gray-700 truncate">{{ chat.title }}</div>
            <div class="text-xs text-gray-400 mt-1">
              {{ chat.model }} · {{ new Date(chat.updatedAt).toLocaleDateString() }}
            </div>
          </div>
        </div>
        <!-- 无对话时的提示 -->
        <div v-if="chatStore.chats.length === 0 && !collapsed" class="text-center py-8">
          <div class="text-gray-400 text-sm">暂无对话历史</div>
          <div class="text-gray-400 text-xs mt-1">点击上方 + 号开始新对话</div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="p-4 border-t border-gray-100">
      <div
        v-if="chatStore.chats.length > 0"
        @click="clearAllChats"
        class="flex items-center text-sm text-red-500 cursor-pointer hover:text-red-700 mb-2 rounded-lg p-2 hover:bg-red-50 transition-all duration-200"
        :class="collapsed ? 'justify-center' : 'space-x-2'"
        :title="collapsed ? '清除所有对话' : ''"
      >
        <span>🗑️</span>
        <span v-show="!collapsed" class="transition-opacity duration-200">清除所有对话</span>
      </div>
      <div
        class="flex items-center text-sm text-gray-600 cursor-pointer hover:text-gray-800 rounded-lg p-2 hover:bg-gray-50 transition-all duration-200"
        :class="collapsed ? 'justify-center' : 'space-x-2'"
        :title="collapsed ? '导入聊天对话' : ''"
      >
        <span>↵</span>
        <span v-show="!collapsed" class="transition-opacity duration-200">导入聊天对话</span>
      </div>
    </div>
  </div>
</template>
