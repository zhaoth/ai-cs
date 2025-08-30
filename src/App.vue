<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Modal } from 'ant-design-vue'
import { useLocalStorage } from '@vueuse/core'
import Sidebar from './components/Sidebar.vue'
import MobileOverlay from './components/MobileOverlay.vue'
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

// 侧边栏状态管理（使用本地存储保持用户偏好）
const sidebarCollapsed = useLocalStorage('sidebar-collapsed', false)

// 新建对话
const newChat = () => {
  chatStore.createChat(modelsStore.selectedModelId)
}

// 切换侧边栏状态
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

// 键盘快捷键支持（Ctrl/Cmd + B 切换侧边栏）
const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
    event.preventDefault()
    toggleSidebar()
  }
}

// 响应式设计支持
const isMobile = ref(window.innerWidth < 768)

// 监听窗口大小变化
const handleResize = () => {
  const newIsMobile = window.innerWidth < 768
  if (newIsMobile !== isMobile.value) {
    isMobile.value = newIsMobile
    // 在移动设备上自动收起侧边栏
    if (isMobile.value) {
      sidebarCollapsed.value = true
    }
  }
}

// 监听移动设备上的侧边栏状态变化
watch(isMobile, (newValue) => {
  if (newValue) {
    sidebarCollapsed.value = true
  }
})

// 添加和移除事件监听器
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
  // 初始化检查
  handleResize()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="h-screen bg-slate-50 flex">
    <!-- 移动端遮罩层 -->
    <MobileOverlay :visible="isMobile && !sidebarCollapsed" @close="sidebarCollapsed = true" />

    <!-- 侧边栏组件 -->
    <Sidebar
      :collapsed="sidebarCollapsed"
      :is-mobile="isMobile"
      @toggle="toggleSidebar"
      @new-chat="newChat"
    />

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col relative">
      <!-- 路由组件渲染区域 -->
      <router-view />
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
