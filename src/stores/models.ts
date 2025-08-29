import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface Model {
  id: string
  name: string
  provider: string
  description: string
  capabilities: string[]
}

export interface ApiKey {
  provider: string
  key: string
}

// 余额信息接口
export interface BalanceInfo {
  provider: string
  balance: number // 余额（人民币）
  usage: number // 已使用（人民币）
  total: number // 总额度（人民币）
  lastUpdated: Date // 上次更新时间
  status: 'active' | 'expired' | 'limited' | 'error' // 状态
}

export const useModelsStore = defineStore('models', () => {
  const models = ref<Model[]>([
    {
      id: 'kimi',
      name: 'Kimi',
      provider: 'Moonshot',
      description: 'Moonshot AI的智能助手，擅长长文本理解和多语言对话',
      capabilities: ['text', 'long-context'],
    },
    {
      id: 'deepseek-v3.1',
      name: 'DeepSeek v3.1',
      provider: 'DeepSeek',
      description: 'DeepSeek最新一代模型，具备强大的推理和代码能力',
      capabilities: ['text', 'code', 'reasoning'],
    },
  ])

  const selectedModelId = ref<string>('kimi')

  // API Keys 管理 - 支持多种模型提供商
  const apiKeys = ref<ApiKey[]>([
    {
      provider: 'Moonshot',
      key: 'sk-D8ZaSoL1WeO2j2eFY1WPGTp2iLh4wxWtOLslyMPwGeWWfnR9',
    },
    {
      provider: 'DeepSeek',
      key: 'sk-c25c66f14a0f411186b74fa5c93ec6db',
    },
    // 其他提供商的API密钥可以在这里添加
    // {
    //   provider: 'OpenAI',
    //   key: '您的OpenAI-API-KEY',
    // },
    // {
    //   provider: 'Anthropic',
    //   key: '您的Anthropic-API-KEY',
    // },
  ])

  // 余额信息管理
  const balances = ref<BalanceInfo[]>([
    {
      provider: 'Moonshot',
      balance: 128.5,
      usage: 21.5,
      total: 150.0,
      lastUpdated: new Date(),
      status: 'active',
    },
    {
      provider: 'DeepSeek',
      balance: 85.2,
      usage: 14.8,
      total: 100.0,
      lastUpdated: new Date(),
      status: 'active',
    },
  ])

  const selectedModel = computed(() => {
    return models.value.find((model) => model.id === selectedModelId.value) || models.value[0]
  })

  function selectModel(modelId: string) {
    if (models.value.some((model) => model.id === modelId)) {
      selectedModelId.value = modelId
    }
  }

  function getApiKey(provider: string): string | undefined {
    return apiKeys.value.find((api) => api.provider === provider)?.key
  }

  function setApiKey(provider: string, key: string) {
    const existingIndex = apiKeys.value.findIndex((api) => api.provider === provider)
    if (existingIndex >= 0) {
      apiKeys.value[existingIndex].key = key
    } else {
      apiKeys.value.push({ provider, key })
    }
  }

  // 余额管理方法
  function getBalance(provider: string): BalanceInfo | undefined {
    return balances.value.find((balance) => balance.provider === provider)
  }

  function updateBalance(provider: string, balanceInfo: Partial<BalanceInfo>) {
    const existingIndex = balances.value.findIndex((balance) => balance.provider === provider)
    if (existingIndex >= 0) {
      balances.value[existingIndex] = {
        ...balances.value[existingIndex],
        ...balanceInfo,
        lastUpdated: new Date(),
      }
    } else {
      balances.value.push({
        provider,
        balance: 0,
        usage: 0,
        total: 0,
        lastUpdated: new Date(),
        status: 'error',
        ...balanceInfo,
      })
    }
  }

  // 获取当前模型的余额信息
  const currentModelBalance = computed(() => {
    const model = selectedModel.value
    return model ? getBalance(model.provider) : undefined
  })

  // 获取所有模型的余额状态
  const allBalances = computed(() => {
    return models.value.map((model) => ({
      model,
      balance: getBalance(model.provider),
    }))
  })

  return {
    models,
    selectedModelId,
    selectedModel,
    selectModel,
    apiKeys,
    getApiKey,
    setApiKey,
    balances,
    getBalance,
    updateBalance,
    currentModelBalance,
    allBalances,
  }
})
