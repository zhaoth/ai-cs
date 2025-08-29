<script setup lang="ts">
import { ref } from 'vue'
import {
  PlusOutlined,
  MenuFoldOutlined,
  DeleteOutlined,
  CheckSquareOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { Modal } from 'ant-design-vue'

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

// 选择模式状态
const isSelectionMode = ref(false)
const selectedChats = ref<Set<string>>(new Set())

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
  if (isSelectionMode.value) {
    // 选择模式下切换选中状态
    if (selectedChats.value.has(chatId)) {
      selectedChats.value.delete(chatId)
    } else {
      selectedChats.value.add(chatId)
    }
  } else {
    // 正常模式下切换对话
    chatStore.setCurrentChat(chatId)
  }
}

// 清除所有对话
const clearAllChats = () => {
  Modal.confirm({
    title: '确认清除所有对话？',
    content: '此操作不可恢复，将永久删除所有聊天记录。',
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    onOk() {
      chatStore.clearAllChats()
    },
  })
}

// 删除单个对话
const deleteSingleChat = (chatId: string, event: Event) => {
  event.stopPropagation()
  Modal.confirm({
    title: '确认删除此对话？',
    content: '此操作不可恢复，将永久删除此聊天记录。',
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    onOk() {
      chatStore.deleteChat(chatId)
    },
  })
}

// 进入选择模式
const enterSelectionMode = () => {
  isSelectionMode.value = true
  selectedChats.value.clear()
}

// 退出选择模式
const exitSelectionMode = () => {
  isSelectionMode.value = false
  selectedChats.value.clear()
}

// 全选/取消全选
const toggleSelectAll = () => {
  if (selectedChats.value.size === chatStore.chats.length) {
    selectedChats.value.clear()
  } else {
    chatStore.chats.forEach((chat) => selectedChats.value.add(chat.id))
  }
}

// 批量删除选中的对话
const deleteSelectedChats = () => {
  if (selectedChats.value.size === 0) return

  Modal.confirm({
    title: `确认删除${selectedChats.value.size}个对话？`,
    content: '此操作不可恢复，将永久删除选中的所有聊天记录。',
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    onOk() {
      chatStore.deleteChatsBatch(Array.from(selectedChats.value))
      exitSelectionMode()
    },
  })
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
        <div class="flex items-center space-x-2">
          <!-- 选择模式按钮 -->
          <div
            v-if="!collapsed && chatStore.chats.length > 0 && !isSelectionMode"
            :title="'选择模式'"
            class="relative"
          >
            <CheckSquareOutlined
              @click="enterSelectionMode"
              class="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors text-sm"
            />
          </div>
          <!-- 新建对话按钮 -->
          <div :title="collapsed ? '新建对话' : ''" class="relative">
            <PlusOutlined
              @click="handleNewChat"
              class="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
              :class="collapsed ? 'text-base' : ''"
            />
          </div>
        </div>
      </div>

      <!-- 批量操作工具栏 -->
      <div v-if="isSelectionMode && !collapsed" class="mb-3 p-2 bg-blue-50 rounded-lg">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button
              @click="toggleSelectAll"
              class="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 transition-colors"
            >
              {{ selectedChats.size === chatStore.chats.length ? '取消全选' : '全选' }}
            </button>
            <span class="text-xs text-gray-600">已选中 {{ selectedChats.size }} 个</span>
          </div>
          <div class="flex items-center space-x-2">
            <button
              @click="deleteSelectedChats"
              :disabled="selectedChats.size === 0"
              class="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-red-700 transition-colors"
            >
              删除
            </button>
            <CloseOutlined
              @click="exitSelectionMode"
              class="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors text-sm"
            />
          </div>
        </div>
      </div>

      <div class="space-y-1">
        <div
          v-for="chat in chatStore.chats"
          :key="chat.id"
          class="rounded-lg cursor-pointer transition-all duration-200 group relative"
          :class="[
            chat.id === chatStore.currentChatId ? 'bg-gray-100' : 'hover:bg-gray-50',
            collapsed ? 'p-2 justify-center' : 'p-3',
            isSelectionMode ? 'pl-8' : '',
          ]"
          @click="setCurrentChat(chat.id)"
          :title="collapsed ? chat.title : ''"
        >
          <!-- 选择模式下的复选框 -->
          <div
            v-if="isSelectionMode && !collapsed"
            class="absolute left-2 top-1/2 transform -translate-y-1/2"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="selectedChats.has(chat.id)"
              @change="setCurrentChat(chat.id)"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>

          <div v-if="collapsed" class="flex justify-center">
            <div class="w-2 h-2 bg-primary-500 rounded-full"></div>
          </div>
          <div v-else class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <div class="text-sm text-gray-700 truncate">{{ chat.title }}</div>
              <div class="text-xs text-gray-400 mt-1">
                {{ chat.model }} · {{ new Date(chat.updatedAt).toLocaleDateString() }}
              </div>
            </div>
            <!-- 单个删除按钮 -->
            <div
              v-if="!isSelectionMode"
              class="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
            >
              <DeleteOutlined
                @click="deleteSingleChat(chat.id, $event)"
                class="text-gray-400 hover:text-red-500 cursor-pointer transition-colors text-sm p-1"
                :title="'删除对话'"
              />
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
