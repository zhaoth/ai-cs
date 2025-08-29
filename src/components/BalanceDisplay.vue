<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useModelsStore } from '@/stores/models'
import { message } from 'ant-design-vue'
import { usageTracker } from '@/services/usageTracker'

const modelsStore = useModelsStore()

// 控制余额显示的可见性
const showBalance = ref(false)
const isRefreshing = ref(false)

// 获取模型图标
const getModelIcon = (modelId: string) => {
  const icons: Record<string, string> = {
    kimi: '🌙',
    'deepseek-v3.1': '🔮',
  }
  return icons[modelId] || '🤖'
}

// 获取状态颜色
const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    active: 'text-green-600',
    expired: 'text-red-600',
    limited: 'text-yellow-600',
    error: 'text-gray-600',
  }
  return colors[status] || 'text-gray-600'
}

// 获取状态图标
const getStatusIcon = (status: string) => {
  const icons: Record<string, string> = {
    active: '✅',
    expired: '❌',
    limited: '⚠️',
    error: '❓',
  }
  return icons[status] || '❓'
}

// 格式化余额显示
const formatBalance = (amount: number) => {
  return `¥${amount.toFixed(2)}`
}

// 计算使用率百分比
const getUsagePercentage = (usage: number, total: number) => {
  return total > 0 ? Math.round((usage / total) * 100) : 0
}

// 模拟获取实时余额数据
const refreshBalances = async () => {
  if (isRefreshing.value) return

  isRefreshing.value = true

  try {
    // 模拟API调用延迟
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 模拟更新余额数据
    for (const model of modelsStore.models) {
      const currentBalance = modelsStore.getBalance(model.provider)
      if (currentBalance) {
        // 模拟余额变化（可能增加或减少）
        const change = (Math.random() - 0.5) * 10 // -5到+5的随机变化
        const newBalance = Math.max(0, currentBalance.balance + change)
        const newUsage = currentBalance.total - newBalance

        modelsStore.updateBalance(model.provider, {
          balance: newBalance,
          usage: newUsage,
          status: newBalance > 10 ? 'active' : newBalance > 0 ? 'limited' : 'expired',
        })
      }
    }

    message.success('余额信息已更新')
  } catch (error) {
    message.error('获取余额失败')
    console.error('获取余额失败:', error)
  } finally {
    isRefreshing.value = false
  }
}

// 定期更新余额（每5分钟）
let updateInterval: number | null = null

onMounted(() => {
  // 设置定期更新
  updateInterval = window.setInterval(
    () => {
      refreshBalances()
    },
    5 * 60 * 1000,
  ) // 5分钟更新一次
})

onUnmounted(() => {
  if (updateInterval) {
    window.clearInterval(updateInterval)
  }
})

// 当前模型的余额信息
const currentBalance = computed(() => modelsStore.currentModelBalance)

// 所有模型的余额信息
const allBalances = computed(() => modelsStore.allBalances)

// 今日使用统计
const todayUsage = computed(() => {
  const currentProvider = modelsStore.selectedModel.provider
  return usageTracker.getTodayUsage(currentProvider)
})

// 切换余额显示
const toggleBalanceDisplay = () => {
  showBalance.value = !showBalance.value
}
</script>

<template>
  <div class="balance-display">
    <!-- 余额概览按钮 -->
    <div class="flex items-center space-x-2 mb-4">
      <button
        @click="toggleBalanceDisplay"
        class="flex items-center space-x-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors duration-200"
        :class="{ 'bg-blue-100': showBalance }"
      >
        <span class="text-blue-600">💰</span>
        <span class="text-sm font-medium text-blue-700">余额概览</span>
        <span
          class="text-xs text-blue-500 transform transition-transform duration-200"
          :class="{ 'rotate-180': showBalance }"
        >
          ▼
        </span>
      </button>

      <button
        @click="refreshBalances"
        :disabled="isRefreshing"
        class="flex items-center space-x-1 px-2 py-2 text-gray-600 hover:text-blue-600 rounded-lg transition-colors duration-200"
        :class="{ 'animate-spin': isRefreshing }"
        title="刷新余额"
      >
        <span class="text-sm">🔄</span>
      </button>
    </div>

    <!-- 当前模型余额快速显示 -->
    <div
      v-if="currentBalance"
      class="current-balance mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">{{ getModelIcon(modelsStore.selectedModelId) }}</span>
          <div>
            <h4 class="font-medium text-gray-800">{{ modelsStore.selectedModel.name }}</h4>
            <p class="text-xs text-gray-500">当前模型余额</p>
          </div>
        </div>
        <div class="text-right">
          <div class="flex items-center space-x-2">
            <span :class="getStatusColor(currentBalance.status)">
              {{ getStatusIcon(currentBalance.status) }}
            </span>
            <span
              class="font-bold text-lg"
              :class="currentBalance.balance < 10 ? 'text-red-600' : 'text-green-600'"
            >
              {{ formatBalance(currentBalance.balance) }}
            </span>
          </div>
          <p class="text-xs text-gray-500">总额 {{ formatBalance(currentBalance.total) }}</p>
        </div>
      </div>

      <!-- 使用进度条 -->
      <div class="mt-3">
        <div class="flex justify-between text-xs text-gray-600 mb-1">
          <span>已使用</span>
          <span>{{ getUsagePercentage(currentBalance.usage, currentBalance.total) }}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all duration-300"
            :class="
              getUsagePercentage(currentBalance.usage, currentBalance.total) > 80
                ? 'bg-red-500'
                : getUsagePercentage(currentBalance.usage, currentBalance.total) > 60
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            "
            :style="{ width: `${getUsagePercentage(currentBalance.usage, currentBalance.total)}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 今日使用统计 -->
    <div
      v-if="currentBalance"
      class="today-usage mb-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-100"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-medium text-gray-800 flex items-center space-x-2">
          <span>📈</span>
          <span>今日使用情况</span>
        </h4>
        <span class="text-xs text-gray-500">
          {{ new Date().toLocaleDateString() }}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="bg-white/50 rounded-lg p-2">
          <div class="text-lg font-bold text-blue-600">
            {{ formatBalance(todayUsage.totalCost) }}
          </div>
          <div class="text-xs text-gray-600">今日消费</div>
        </div>
        <div class="bg-white/50 rounded-lg p-2">
          <div class="text-lg font-bold text-green-600">
            {{ todayUsage.totalTokens.toLocaleString() }}
          </div>
          <div class="text-xs text-gray-600">使用Token</div>
        </div>
        <div class="bg-white/50 rounded-lg p-2">
          <div class="text-lg font-bold text-purple-600">
            {{ todayUsage.callCount }}
          </div>
          <div class="text-xs text-gray-600">调用次数</div>
        </div>
      </div>
    </div>

    <!-- 详细余额列表 -->
    <div v-if="showBalance" class="balance-details space-y-3">
      <h3 class="text-sm font-medium text-gray-700 flex items-center space-x-2">
        <span>📊</span>
        <span>所有模型余额详情</span>
      </h3>

      <div class="space-y-2">
        <div
          v-for="{ model, balance } in allBalances"
          :key="model.id"
          class="balance-item p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow duration-200"
          :class="{
            'ring-2 ring-blue-500 ring-opacity-50': model.id === modelsStore.selectedModelId,
          }"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-3">
              <span class="text-xl">{{ getModelIcon(model.id) }}</span>
              <div>
                <h4 class="font-medium text-gray-800">{{ model.name }}</h4>
                <p class="text-xs text-gray-500">{{ model.provider }}</p>
              </div>
            </div>

            <div v-if="balance" class="text-right">
              <div class="flex items-center space-x-2">
                <span :class="getStatusColor(balance.status)">
                  {{ getStatusIcon(balance.status) }}
                </span>
                <span
                  class="font-bold"
                  :class="balance.balance < 10 ? 'text-red-600' : 'text-green-600'"
                >
                  {{ formatBalance(balance.balance) }}
                </span>
              </div>
              <p class="text-xs text-gray-500">
                已用 {{ formatBalance(balance.usage) }} / {{ formatBalance(balance.total) }}
              </p>
            </div>

            <div v-else class="text-right">
              <span class="text-sm text-gray-400">暂无数据</span>
            </div>
          </div>

          <!-- 进度条 -->
          <div v-if="balance" class="mt-2">
            <div class="w-full bg-gray-200 rounded-full h-1.5">
              <div
                class="h-1.5 rounded-full transition-all duration-300"
                :class="
                  getUsagePercentage(balance.usage, balance.total) > 80
                    ? 'bg-red-400'
                    : getUsagePercentage(balance.usage, balance.total) > 60
                      ? 'bg-yellow-400'
                      : 'bg-green-400'
                "
                :style="{ width: `${getUsagePercentage(balance.usage, balance.total)}%` }"
              ></div>
            </div>
          </div>

          <!-- 最后更新时间 -->
          <div v-if="balance" class="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span
              >状态:
              {{
                balance.status === 'active'
                  ? '正常'
                  : balance.status === 'limited'
                    ? '余额不足'
                    : balance.status === 'expired'
                      ? '已过期'
                      : '错误'
              }}</span
            >
            <span>{{ balance.lastUpdated.toLocaleTimeString() }} 更新</span>
          </div>
        </div>
      </div>

      <!-- 刷新提示 -->
      <div class="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p class="text-xs text-yellow-700 flex items-center space-x-2">
          <span>💡</span>
          <span>余额每5分钟自动更新，也可手动刷新获取最新数据</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-display {
  /* 自定义样式 */
}

.balance-item {
  transition: all 0.2s ease-in-out;
}

.balance-item:hover {
  transform: translateY(-1px);
}

/* 动画效果 */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.animate-pulse {
  animation: pulse 1.5s infinite;
}
</style>
