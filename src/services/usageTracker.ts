import { useModelsStore } from '@/stores/models'

// 使用情况记录接口
export interface UsageRecord {
  provider: string
  modelId: string
  timestamp: Date
  tokenCount: number
  cost: number // 人民币
  type: 'input' | 'output' | 'total'
}

// 价格配置（每1000个token的价格，人民币）
const PRICING_CONFIG: Record<string, { input: number; output: number }> = {
  Moonshot: {
    input: 0.012, // Kimi 输入token价格
    output: 0.012, // Kimi 输出token价格
  },
  DeepSeek: {
    input: 0.014, // DeepSeek 输入token价格
    output: 0.028, // DeepSeek 输出token价格
  },
}

export class UsageTracker {
  private modelsStore: ReturnType<typeof useModelsStore> | null = null
  private usageHistory: UsageRecord[] = []

  // 延迟初始化 modelsStore
  private getModelsStore() {
    if (!this.modelsStore) {
      this.modelsStore = useModelsStore()
    }
    return this.modelsStore
  }

  // 估算文本的token数量（简单估算：1个中文字符≈1.5个token，1个英文单词≈1.3个token）
  private estimateTokenCount(text: string): number {
    // 计算中文字符数量
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    // 计算英文单词数量
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    // 计算其他字符数量
    const otherChars = text.length - chineseChars - englishWords

    // 简单估算
    return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + otherChars * 0.5)
  }

  // 计算成本
  private calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING_CONFIG[provider]
    if (!pricing) return 0

    const inputCost = (inputTokens / 1000) * pricing.input
    const outputCost = (outputTokens / 1000) * pricing.output

    return inputCost + outputCost
  }

  // 记录API使用情况
  trackUsage(
    provider: string,
    modelId: string,
    inputText: string,
    outputText: string,
  ): UsageRecord {
    const inputTokens = this.estimateTokenCount(inputText)
    const outputTokens = this.estimateTokenCount(outputText)
    const totalTokens = inputTokens + outputTokens
    const cost = this.calculateCost(provider, inputTokens, outputTokens)

    const record: UsageRecord = {
      provider,
      modelId,
      timestamp: new Date(),
      tokenCount: totalTokens,
      cost,
      type: 'total',
    }

    // 添加到历史记录
    this.usageHistory.push(record)

    // 更新余额（扣除使用费用）
    const modelsStore = this.getModelsStore()
    const currentBalance = modelsStore.getBalance(provider)
    if (currentBalance) {
      const newBalance = Math.max(0, currentBalance.balance - cost)
      const newUsage = currentBalance.usage + cost

      modelsStore.updateBalance(provider, {
        balance: newBalance,
        usage: newUsage,
        status: newBalance > 10 ? 'active' : newBalance > 0 ? 'limited' : 'expired',
      })

      console.log(
        `[使用追踪] ${provider} - 消耗 ¥${cost.toFixed(4)}, 剩余 ¥${newBalance.toFixed(2)}`,
      )
    }

    return record
  }

  // 获取使用历史
  getUsageHistory(provider?: string): UsageRecord[] {
    if (provider) {
      return this.usageHistory.filter((record) => record.provider === provider)
    }
    return this.usageHistory
  }

  // 获取今日使用统计
  getTodayUsage(provider?: string): { totalCost: number; totalTokens: number; callCount: number } {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayRecords = this.usageHistory.filter((record) => {
      const recordDate = new Date(record.timestamp)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate.getTime() === today.getTime() && (!provider || record.provider === provider)
    })

    return {
      totalCost: todayRecords.reduce((sum, record) => sum + record.cost, 0),
      totalTokens: todayRecords.reduce((sum, record) => sum + record.tokenCount, 0),
      callCount: todayRecords.length,
    }
  }

  // 清理旧的使用记录（保留最近30天）
  cleanupOldRecords(): void {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    this.usageHistory = this.usageHistory.filter((record) => record.timestamp > thirtyDaysAgo)
  }

  // 导出使用报告
  exportUsageReport(provider?: string): string {
    const records = this.getUsageHistory(provider)
    const todayUsage = this.getTodayUsage(provider)

    const report = {
      summary: {
        totalRecords: records.length,
        todayUsage,
        totalCost: records.reduce((sum, record) => sum + record.cost, 0),
        totalTokens: records.reduce((sum, record) => sum + record.tokenCount, 0),
      },
      records: records.slice(-50), // 最近50条记录
    }

    return JSON.stringify(report, null, 2)
  }
}

// 使用单例模式创建全局使用追踪实例
let usageTrackerInstance: UsageTracker | null = null

export const getUsageTracker = (): UsageTracker => {
  if (!usageTrackerInstance) {
    usageTrackerInstance = new UsageTracker()
  }
  return usageTrackerInstance
}

// 为了向后兼容，提供一个getter
export const usageTracker = {
  get instance() {
    return getUsageTracker()
  },
  // 代理常用方法
  trackUsage: (...args: Parameters<UsageTracker['trackUsage']>) =>
    getUsageTracker().trackUsage(...args),
  getUsageHistory: (...args: Parameters<UsageTracker['getUsageHistory']>) =>
    getUsageTracker().getUsageHistory(...args),
  getTodayUsage: (...args: Parameters<UsageTracker['getTodayUsage']>) =>
    getUsageTracker().getTodayUsage(...args),
}
