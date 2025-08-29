<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '@/stores/models'

const modelsStore = useModelsStore()

const currentModel = computed(() => modelsStore.selectedModel)

const getModelIcon = (modelId: string) => {
  const icons: Record<string, string> = {
    kimi: '🌙',
    'gpt-4': '🤖',
    'gpt-3.5-turbo': '⚡',
    'claude-2': '🧠',
    'llama-2': '🦙',
    'palm-2': '🌟',
  }
  return icons[modelId] || '🤖'
}

const getModelBadgeColor = (capability: string) => {
  const colors: Record<string, string> = {
    text: 'bg-blue-100 text-blue-800',
    code: 'bg-green-100 text-green-800',
    'long-context': 'bg-purple-100 text-purple-800',
  }
  return colors[capability] || 'bg-gray-100 text-gray-800'
}

// 处理模型选择变化
const handleModelChange = (modelId: string) => {
  modelsStore.selectModel(modelId)
}
</script>

<template>
  <div
    class="bg-gradient-to-r from-blue-50 to-purple-50 border border-gray-200 rounded-lg p-4 mb-4"
  >
    <!-- 模型选择下拉框 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-700 mb-2">选择 AI 模型：</label>
      <a-select
        :value="modelsStore.selectedModelId"
        @change="handleModelChange"
        style="width: 100%"
        size="large"
        :options="
          modelsStore.models.map((m) => ({
            label: `${getModelIcon(m.id)} ${m.name} (${m.provider})`,
            value: m.id,
          }))
        "
      />
    </div>

    <!-- 当前选择的模型信息 -->
    <div class="flex items-center space-x-3 mb-3">
      <div class="text-2xl">{{ getModelIcon(currentModel.id) }}</div>
      <div>
        <h3 class="font-semibold text-gray-800">{{ currentModel.name }}</h3>
        <p class="text-sm text-gray-600">{{ currentModel.provider }}</p>
      </div>
    </div>

    <p class="text-sm text-gray-700 mb-3">{{ currentModel.description }}</p>

    <div class="flex flex-wrap gap-2">
      <span
        v-for="capability in currentModel.capabilities"
        :key="capability"
        class="px-2 py-1 text-xs font-medium rounded-full"
        :class="getModelBadgeColor(capability)"
      >
        {{
          capability === 'long-context'
            ? '长文本理解'
            : capability === 'text'
              ? '文本对话'
              : capability === 'code'
                ? '代码能力'
                : capability
        }}
      </span>
    </div>

    <div
      v-if="currentModel.id === 'kimi'"
      class="mt-3 p-2 bg-purple-50 rounded border border-purple-200"
    >
      <div class="flex items-center space-x-2">
        <span class="text-purple-600 font-medium text-sm">💡 特色功能</span>
      </div>
      <p class="text-xs text-purple-700 mt-1">
        Kimi 擅长处理长文本内容，支持深度理解和多轮对话，特别适合复杂问题分析和文档理解。
      </p>
    </div>
  </div>
</template>
