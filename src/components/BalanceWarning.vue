<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '@/stores/models'

const modelsStore = useModelsStore()

// 当前模型的余额信息
const currentBalance = computed(() => modelsStore.currentModelBalance)

// 检查是否需要显示余额警告
const shouldShowWarning = computed(() => {
  if (!currentBalance.value) return false

  const { balance, status } = currentBalance.value
  return status === 'limited' || status === 'expired' || balance < 20
})

// 获取警告级别
const warningLevel = computed(() => {
  if (!currentBalance.value) return 'info'

  const { balance, status } = currentBalance.value

  if (status === 'expired' || balance <= 0) return 'error'
  if (status === 'limited' || balance < 10) return 'warning'
  if (balance < 20) return 'info'

  return 'info'
})

// 获取警告消息
const warningMessage = computed(() => {
  if (!currentBalance.value) return ''

  const { balance, status } = currentBalance.value
  const modelName = modelsStore.selectedModel.name

  if (status === 'expired' || balance <= 0) {
    return `${modelName} 余额已耗尽，请及时充值以继续使用AI服务`
  }

  if (status === 'limited' || balance < 10) {
    return `${modelName} 余额不足（剩余 ¥${balance.toFixed(2)}），建议充值以确保服务不中断`
  }

  if (balance < 20) {
    return `${modelName} 余额较低（剩余 ¥${balance.toFixed(2)}），建议提前充值`
  }

  return ''
})

// 获取警告样式
const warningClass = computed(() => {
  const level = warningLevel.value
  const baseClass = 'border-l-4 p-4 mb-4 rounded-lg'

  switch (level) {
    case 'error':
      return `${baseClass} bg-red-50 border-red-400 text-red-800`
    case 'warning':
      return `${baseClass} bg-yellow-50 border-yellow-400 text-yellow-800`
    case 'info':
      return `${baseClass} bg-blue-50 border-blue-400 text-blue-800`
    default:
      return `${baseClass} bg-gray-50 border-gray-400 text-gray-800`
  }
})

// 获取警告图标
const warningIcon = computed(() => {
  const level = warningLevel.value

  switch (level) {
    case 'error':
      return '🚨'
    case 'warning':
      return '⚠️'
    case 'info':
      return 'ℹ️'
    default:
      return '💡'
  }
})
</script>

<template>
  <div v-if="shouldShowWarning" class="balance-warning">
    <div :class="warningClass">
      <div class="flex items-center">
        <span class="text-lg mr-3">{{ warningIcon }}</span>
        <div class="flex-1">
          <h4 class="font-medium mb-1">余额提醒</h4>
          <p class="text-sm">{{ warningMessage }}</p>
        </div>
        <div class="ml-4">
          <button
            class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
            :class="
              warningLevel === 'error'
                ? 'bg-red-100 hover:bg-red-200 text-red-800'
                : warningLevel === 'warning'
                  ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
                  : 'bg-blue-100 hover:bg-blue-200 text-blue-800'
            "
          >
            立即充值
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-warning {
  /* 自定义样式 */
}
</style>
