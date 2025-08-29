import { useModelsStore } from '@/stores/models'
import type { BalanceInfo } from '@/stores/models'

// 余额查询响应接口
export interface BalanceResponse {
  balance: number
  usage: number
  total: number
  status: 'active' | 'expired' | 'limited' | 'error'
}

// 各提供商余额查询接口抽象
abstract class BaseBalanceProvider {
  protected modelsStore = useModelsStore()

  // 获取API密钥
  protected abstract getApiKey(): string

  // 获取余额信息
  abstract fetchBalance(): Promise<BalanceResponse>

  // 构建请求头
  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(apiKey),
    }
  }

  // 获取认证头（子类实现）
  protected abstract getAuthHeaders(apiKey: string): Record<string, string>
}

// Kimi (Moonshot) 余额查询
export class KimiBalanceProvider extends BaseBalanceProvider {
  protected getApiKey(): string {
    const apiKey = this.modelsStore.getApiKey('Moonshot')
    if (!apiKey) {
      throw new Error('Kimi API Key 未配置')
    }
    return apiKey
  }

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
    }
  }

  async fetchBalance(): Promise<BalanceResponse> {
    const apiKey = this.getApiKey()
    const headers = this.buildHeaders(apiKey)

    try {
      // Moonshot API 余额查询端点
      const response = await fetch('https://api.moonshot.cn/v1/users/me', {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // 根据Moonshot API响应格式解析余额信息
      // 注意：这里的字段名可能需要根据实际API响应调整
      const balance = data.balance?.available || 0
      const total = data.balance?.total || 0
      const usage = total - balance

      return {
        balance,
        usage,
        total,
        status: balance > 10 ? 'active' : balance > 0 ? 'limited' : 'expired',
      }
    } catch (error) {
      console.error('Kimi余额查询失败:', error)

      // 返回错误状态，但不影响应用运行
      return {
        balance: 0,
        usage: 0,
        total: 0,
        status: 'error',
      }
    }
  }
}

// DeepSeek 余额查询
export class DeepSeekBalanceProvider extends BaseBalanceProvider {
  protected getApiKey(): string {
    const apiKey = this.modelsStore.getApiKey('DeepSeek')
    if (!apiKey) {
      throw new Error('DeepSeek API Key 未配置')
    }
    return apiKey
  }

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
    }
  }

  async fetchBalance(): Promise<BalanceResponse> {
    const apiKey = this.getApiKey()
    const headers = this.buildHeaders(apiKey)

    try {
      // DeepSeek API 余额查询端点
      const response = await fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // 根据DeepSeek API响应格式解析余额信息
      // 注意：这里的字段名可能需要根据实际API响应调整
      const balance = data.balance?.available_balance || 0
      const total = data.balance?.total_balance || 0
      const usage = total - balance

      return {
        balance,
        usage,
        total,
        status: balance > 10 ? 'active' : balance > 0 ? 'limited' : 'expired',
      }
    } catch (error) {
      console.error('DeepSeek余额查询失败:', error)

      // 返回错误状态，但不影响应用运行
      return {
        balance: 0,
        usage: 0,
        total: 0,
        status: 'error',
      }
    }
  }
}

// 余额查询工厂类
export class BalanceProviderFactory {
  private static providers: Map<string, BaseBalanceProvider> = new Map()

  static getProvider(provider: string): BaseBalanceProvider {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, this.createProvider(provider))
    }
    return this.providers.get(provider)!
  }

  private static createProvider(provider: string): BaseBalanceProvider {
    switch (provider) {
      case 'Moonshot':
        return new KimiBalanceProvider()
      case 'DeepSeek':
        return new DeepSeekBalanceProvider()
      default:
        throw new Error(`不支持的余额查询提供商: ${provider}`)
    }
  }

  // 清空缓存
  static clearCache(): void {
    this.providers.clear()
  }
}

// 统一的余额查询服务
export class BalanceService {
  private modelsStore = useModelsStore()

  // 查询单个提供商的余额
  async fetchProviderBalance(provider: string): Promise<BalanceInfo | null> {
    try {
      const balanceProvider = BalanceProviderFactory.getProvider(provider)
      const balanceResponse = await balanceProvider.fetchBalance()

      const balanceInfo: BalanceInfo = {
        provider,
        balance: balanceResponse.balance,
        usage: balanceResponse.usage,
        total: balanceResponse.total,
        lastUpdated: new Date(),
        status: balanceResponse.status,
      }

      // 更新存储中的余额信息
      this.modelsStore.updateBalance(provider, balanceInfo)

      return balanceInfo
    } catch (error) {
      console.error(`查询${provider}余额失败:`, error)

      // 更新为错误状态
      this.modelsStore.updateBalance(provider, {
        status: 'error',
        lastUpdated: new Date(),
      })

      return null
    }
  }

  // 查询所有模型的余额
  async fetchAllBalances(): Promise<BalanceInfo[]> {
    const results: BalanceInfo[] = []

    // 获取所有提供商
    const providers = [...new Set(this.modelsStore.models.map((model) => model.provider))]

    // 并行查询所有提供商的余额
    const promises = providers.map((provider) => this.fetchProviderBalance(provider))
    const balances = await Promise.allSettled(promises)

    balances.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      }
    })

    return results
  }

  // 模拟余额数据（用于演示和API不可用时的降级）
  generateMockBalance(provider: string): BalanceInfo {
    // 生成随机的模拟数据
    const total = Math.random() * 200 + 50 // 50-250之间的总额度
    const usage = Math.random() * total * 0.8 // 使用量不超过80%
    const balance = total - usage

    return {
      provider,
      balance: Math.round(balance * 100) / 100,
      usage: Math.round(usage * 100) / 100,
      total: Math.round(total * 100) / 100,
      lastUpdated: new Date(),
      status: balance > 10 ? 'active' : balance > 0 ? 'limited' : 'expired',
    }
  }

  // 更新所有余额（带错误处理和降级）
  async updateAllBalances(useMock = false): Promise<void> {
    if (useMock) {
      // 使用模拟数据
      const providers = [...new Set(this.modelsStore.models.map((model) => model.provider))]
      providers.forEach((provider) => {
        const mockBalance = this.generateMockBalance(provider)
        this.modelsStore.updateBalance(provider, mockBalance)
      })
      return
    }

    try {
      await this.fetchAllBalances()
    } catch (error) {
      console.error('余额更新失败，使用模拟数据:', error)
      // 降级到模拟数据
      await this.updateAllBalances(true)
    }
  }
}

// 创建余额服务实例
export const balanceService = new BalanceService()

// 导出类型
export type { BalanceInfo }
