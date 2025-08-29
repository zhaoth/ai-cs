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
  protected modelsStore: ReturnType<typeof useModelsStore> | null = null

  // 延迟初始化 modelsStore
  protected getModelsStore() {
    if (!this.modelsStore) {
      this.modelsStore = useModelsStore()
    }
    return this.modelsStore
  }

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
    const apiKey = this.getModelsStore().getApiKey('Moonshot')
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

    try {
      // Moonshot API 余额查询端点（根据您提供的真实API）
      console.log('正在查询Moonshot余额...')
      const response = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Moonshot API响应错误:', response.status, errorText)
        throw new Error(`Moonshot API调用失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Moonshot API响应:', data)

      // 根据Moonshot API响应格式解析余额信息（根据您提供的真实格式）
      let balance = 0
      let total = 0
      let usage = 0

      // 根据您提供的API响应格式解析
      if (data.code === 0 && data.data) {
        // 主要使用available_balance作为可用余额
        balance = data.data.available_balance || 0

        // 计算总余额（可用余额 + 代金券余额 + 现金余额）
        const voucherBalance = data.data.voucher_balance || 0
        const cashBalance = data.data.cash_balance || 0
        total = balance + voucherBalance + cashBalance

        // 如果没有总使用量信息，将usage设为0（因为API只返回余额信息）
        usage = 0

        console.log(
          `Moonshot余额解析结果: 可用=${balance}, 代金券=${voucherBalance}, 现金=${cashBalance}, 总计=${total}`,
        )
      } else {
        console.warn('Moonshot API返回格式异常:', data)
        // 尝试兼容其他可能的格式
        if (data.available_balance !== undefined) {
          balance = data.available_balance
          total = data.total_balance || data.available_balance
          usage = total - balance
        } else if (data.balance !== undefined) {
          if (typeof data.balance === 'number') {
            balance = data.balance
            total = data.total_balance || data.balance
            usage = total - balance
          } else if (data.balance.available !== undefined) {
            balance = data.balance.available
            total = data.balance.total || data.balance.available
            usage = total - balance
          }
        }
      }

      console.log(`Moonshot余额解析结果: 余额=${balance}, 总额=${total}, 已用=${usage}`)

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
    const apiKey = this.getModelsStore().getApiKey('DeepSeek')
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

    try {
      // DeepSeek API 余额查询端点 (根据您提供的真实API)
      console.log('正在查询DeepSeek余额...')
      const response = await fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DeepSeek API响应错误:', response.status, errorText)
        throw new Error(`DeepSeek API调用失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('DeepSeek API响应:', data)

      // 根据DeepSeek API响应格式解析余额信息
      let balance = 0
      let total = 0
      let usage = 0

      // 尝试多种可能的字段格式
      if (data.balance_infos && Array.isArray(data.balance_infos)) {
        // 如果返回的是余额信息数组
        const balanceInfo = data.balance_infos[0] || {}
        balance = balanceInfo.available_balance || balanceInfo.balance || 0
        total = balanceInfo.total_balance || balanceInfo.total || balance
        usage = total - balance
      } else if (data.available_balance !== undefined) {
        balance = data.available_balance
        total = data.total_balance || data.available_balance
        usage = total - balance
      } else if (data.balance !== undefined) {
        balance = data.balance
        total = data.total || data.balance
        usage = total - balance
      }

      console.log(`DeepSeek余额解析结果: 余额=${balance}, 总额=${total}, 已用=${usage}`)

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
  private modelsStore: ReturnType<typeof useModelsStore> | null = null

  // 延迟初始化 modelsStore
  private getModelsStore() {
    if (!this.modelsStore) {
      this.modelsStore = useModelsStore()
    }
    return this.modelsStore
  }

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
      this.getModelsStore().updateBalance(provider, balanceInfo)

      return balanceInfo
    } catch (error) {
      console.error(`查询${provider}余额失败:`, error)

      // 更新为错误状态
      this.getModelsStore().updateBalance(provider, {
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
    const providers = [...new Set(this.getModelsStore().models.map((model) => model.provider))]

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
      const providers = [...new Set(this.getModelsStore().models.map((model) => model.provider))]
      providers.forEach((provider) => {
        const mockBalance = this.generateMockBalance(provider)
        this.getModelsStore().updateBalance(provider, mockBalance)
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

// 使用单例模式创建余额服务实例
let balanceServiceInstance: BalanceService | null = null

export const getBalanceService = (): BalanceService => {
  if (!balanceServiceInstance) {
    balanceServiceInstance = new BalanceService()
  }
  return balanceServiceInstance
}

// 为了向后兼容，提供一个getter
export const balanceService = {
  get instance() {
    return getBalanceService()
  },
  // 代理常用方法
  fetchProviderBalance: (...args: Parameters<BalanceService['fetchProviderBalance']>) =>
    getBalanceService().fetchProviderBalance(...args),
  fetchAllBalances: () => getBalanceService().fetchAllBalances(),
  updateAllBalances: (...args: Parameters<BalanceService['updateAllBalances']>) =>
    getBalanceService().updateAllBalances(...args),
  generateMockBalance: (...args: Parameters<BalanceService['generateMockBalance']>) =>
    getBalanceService().generateMockBalance(...args),
}

// 导出类型
export type { BalanceInfo }
