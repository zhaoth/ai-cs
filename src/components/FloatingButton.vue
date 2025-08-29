<script setup lang="ts">
import { MenuUnfoldOutlined } from '@ant-design/icons-vue'

// Props
interface Props {
  visible: boolean
}
defineProps<Props>()

// Emits
const emit = defineEmits<{
  toggle: []
}>()

const handleToggle = () => {
  emit('toggle')
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 scale-95 translate-x-[-10px]"
    enter-to-class="opacity-100 scale-100 translate-x-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 scale-100 translate-x-0"
    leave-to-class="opacity-0 scale-95 translate-x-[-10px]"
  >
    <div v-if="visible" class="fixed top-4 left-4 z-10">
      <button
        @click="handleToggle"
        class="w-10 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-200"
        title="展开侧边栏 (Ctrl/Cmd + B)"
      >
        <MenuUnfoldOutlined class="text-gray-600" />
      </button>
    </div>
  </Transition>
</template>
