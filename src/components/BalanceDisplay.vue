<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useModelsStore } from '@/stores/models'
import { useChatHistoryStore } from '@/stores/chatHistory'
import { message } from 'ant-design-vue'
import { usageTracker } from '@/services/usageTracker'
import { balanceService } from '@/services/balanceService'

const modelsStore = useModelsStore()
const chatStore = useChatHistoryStore()

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

// 获取实时余额数据（使用真实API）
const refreshBalances = async () => {
  if (isRefreshing.value) return

  isRefreshing.value = true

  try {
    console.log('开始刷新余额...')
    message.info('正在获取最新余额信息...')

    // 使用真实的余额服务
    await balanceService.updateAllBalances(false) // false表示使用真实API，不用模拟数据

    message.success('余额信息已更新')
    console.log('余额刷新完成')
  } catch (error) {
    console.error('获取余额失败:', error)
    message.warning('API调用失败，使用模拟数据')

    // 如果真实API失败，降级使用模拟数据
    try {
      await balanceService.updateAllBalances(true) // true表示使用模拟数据
      message.info('已切换到模拟数据模式')
    } catch (mockError) {
      console.error('模拟数据也失败:', mockError)
      message.error('获取余额失败')
    }
  } finally {
    isRefreshing.value = false
  }
}

// 定期更新余额（每5分钟）
let updateInterval: number | null = null

onMounted(async () => {
  // 页面加载时立即获取一次真实余额
  await refreshBalances()

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

// 当前会话的模型信息（使用会话级别的模型选择）
const currentChatModelId = computed(() => {
  const modelId =
    chatStore.currentChat?.selectedModelId ||
    chatStore.currentChat?.model ||
    modelsStore.selectedModelId
  console.log('ℹ️ 当前会话模型ID:', modelId, {
    chatSelectedModelId: chatStore.currentChat?.selectedModelId,
    chatModel: chatStore.currentChat?.model,
    globalSelectedModelId: modelsStore.selectedModelId,
  })
  return modelId
})

const currentChatModel = computed(() => {
  const modelId = currentChatModelId.value
  const model = modelsStore.models.find((model) => model.id === modelId) || modelsStore.models[0]
  console.log('ℹ️ 当前会话模型:', model)
  return model
})

// 当前模型的余额信息（基于会话模型）
const currentBalance = computed(() => {
  const model = currentChatModel.value
  const balance = model ? modelsStore.getBalance(model.provider) : undefined
  console.log('ℹ️ 当前模型余额:', model?.provider, balance)
  return balance
})

// 所有模型的余额信息
const allBalances = computed(() => modelsStore.allBalances)

// 今日使用统计（基于当前会话模型）
const todayUsage = computed(() => {
  const currentProvider = currentChatModel.value.provider
  return usageTracker.getTodayUsage(currentProvider)
})

// 切换模型帮助调试
const toggleModel = () => {
  // 切换到另一个模型
  if (currentChatModelId.value === 'kimi') {
    if (chatStore.currentChat) {
      chatStore.currentChat.selectedModelId = 'deepseek-v3.1'
      message.info('已切换到 DeepSeek v3.1')
    }
  } else {
    if (chatStore.currentChat) {
      chatStore.currentChat.selectedModelId = 'kimi'
      message.info('已切换到 Kimi')
    }
  }
}

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
        class="flex items-center space-x-1 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors duration-200"
        :class="{ 'opacity-50': isRefreshing }"
        title="获取真实余额"
      >
        <span class="text-sm" :class="{ 'animate-spin': isRefreshing }">🔄</span>
        <span class="text-sm font-medium">
          {{ isRefreshing ? '获取中...' : '刷新余额' }}
        </span>
      </button>

      <!-- 模型切换测试按钮 -->
      <button
        @click="toggleModel"
        class="flex items-center space-x-1 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors duration-200"
        title="测试模型切换"
      >
        <span class="text-sm">🔀</span>
        <span class="text-sm font-medium">切换模型</span>
      </button>
    </div>

    <!-- 当前模型余额快速显示 -->
    <div
      class="current-balance mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">{{ getModelIcon(currentChatModelId) }}</span>
          <div>
            <h4 class="font-medium text-gray-800">{{ currentChatModel.name }}</h4>
            <p class="text-xs text-gray-500">当前会话模型余额</p>
            <!-- 调试信息 -->
            <p class="text-xs text-blue-600 mt-1">
              模型ID: {{ currentChatModelId }} | 提供商: {{ currentChatModel.provider }}
            </p>
          </div>
        </div>
        <div v-if="currentBalance" class="text-right">
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
        <div v-else class="text-right">
          <span class="text-sm text-red-500">暂无余额数据</span>
          <p class="text-xs text-gray-500">请点击刷新获取</p>
        </div>
      </div>

      <!-- 使用进度条 -->
      <div v-if="currentBalance" class="mt-3">
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
            'ring-2 ring-blue-500 ring-opacity-50': model.id === currentChatModelId,
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
      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div class="text-sm text-blue-700 space-y-1">
          <p class="flex items-center space-x-2">
            <span>💡</span>
            <span>余额每5分钟自动更新，也可手动刷新获取最新数据</span>
          </p>
          <p class="flex items-center space-x-2">
            <span>🔑</span>
            <span>使用真实API查询余额，如果失败会自动降级到模拟数据</span>
          </p>
          <p class="flex items-center space-x-2">
            <span>🔀</span>
            <span class="font-medium">使用“切换模型”按钮测试 DeepSeek 余额显示！</span>
          </p>
          <p class="text-xs text-blue-600 mt-2">
            API端点: Moonshot (/v1/users/me/balance) 和 DeepSeek (/user/balance)
          </p>
        </div>
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
