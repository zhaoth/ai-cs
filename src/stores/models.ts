import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Model {
  id: string
  name: string
  provider: string
  description: string
  capabilities: string[]
}

export const useModelsStore = defineStore('models', () => {
  const models = ref<Model[]>([
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'OpenAI',
      description: 'OpenAI最先进的模型，适用于复杂任务',
      capabilities: ['text', 'code']
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      description: '快速且功能强大的模型，适用于大多数任务',
      capabilities: ['text']
    },
    {
      id: 'claude-2',
      name: 'Claude 2',
      provider: 'Anthropic',
      description: '平衡性能和安全性的对话AI',
      capabilities: ['text']
    },
    {
      id: 'llama-2',
      name: 'Llama 2',
      provider: 'Meta',
      description: '开源大语言模型',
      capabilities: ['text']
    },
    {
      id: 'palm-2',
      name: 'PaLM 2',
      provider: 'Google',
      description: 'Google的大型语言模型',
      capabilities: ['text', 'code']
    }
  ])

  const selectedModelId = ref<string>('gpt-4')

  const selectedModel = computed(() => {
    return models.value.find(model => model.id === selectedModelId.value) || models.value[0]
  })

  function selectModel(modelId: string) {
    if (models.value.some(model => model.id === modelId)) {
      selectedModelId.value = modelId
    }
  }

  return {
    models,
    selectedModelId,
    selectedModel,
    selectModel
  }
})