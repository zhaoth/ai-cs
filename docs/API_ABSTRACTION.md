# AI API调用抽象化系统

## 概述

基于Kimi和DeepSeek的API调用模式，我们成功抽象化了一套统一的AI API调用系统，实现了：

- 🏗️ **统一架构**：所有AI模型都使用相同的调用接口
- 🔧 **扩展性**：新增AI模型只需要实现相应的Provider
- 📁 **文件处理**：统一的文件上传和处理流程
- 🎛️ **配置灵活**：支持个性化的API配置和参数
- 🔄 **流式响应**：统一处理所有模型的流式输出

## 核心架构

### 1. API服务抽象层 (`/src/services/aiApiService.ts`)

#### 抽象基类

```typescript
abstract class BaseApiProvider {
  // 统一的调用接口
  async call(messages, config): Promise<string>

  // 子类需实现的抽象方法
  protected abstract getApiKey(): string
  protected abstract getAuthHeaders(apiKey: string): Record<string, string>
}
```

#### 具体实现

- **KimiApiProvider** - Moonshot AI的Kimi模型
- **DeepSeekApiProvider** - DeepSeek v3.1模型
- **OpenAiApiProvider** - GPT-4/GPT-3.5-turbo
- **ClaudeApiProvider** - Anthropic Claude

#### 工厂模式

```typescript
// 统一获取API提供商
const provider = ApiProviderFactory.getProvider(modelId)
const result = await provider.call(messages, config)
```

### 2. 文件服务抽象层 (`/src/services/fileService.ts`)

#### 文件处理器接口

```typescript
interface FileProcessor {
  processFiles(files: FileAttachment[]): Promise<string>
  supportsFileUpload(): boolean
}
```

#### 具体实现

- **KimiFileProcessor** - 处理Kimi的文件上传和引用
- **DefaultFileProcessor** - 其他模型的默认文件处理

#### 统一文件处理

```typescript
// 自动根据模型选择合适的文件处理器
await processFilesForModel(modelId, files)
```

### 3. 统一调用接口

```typescript
// 基础API调用
const result = await callUnifiedAiApi(modelId, messages, config)

// 包含文件的API调用
const result = await callAiApiWithFiles(modelId, messages, files)
```

## 支持的模型

| 模型ID          | 模型名称      | API提供商 | 文件支持    | 流式输出 |
| --------------- | ------------- | --------- | ----------- | -------- |
| `kimi`          | Kimi          | Moonshot  | ✅ 完整支持 | ✅       |
| `deepseek-v3.1` | DeepSeek v3.1 | DeepSeek  | ⚠️ 基础支持 | ✅       |

## 配置说明

### API密钥配置

每个模型需要在设置中配置相应的API密钥：

- Kimi: Moonshot API Key
- DeepSeek: DeepSeek API Key

### 请求配置

```typescript
interface ApiRequestConfig {
  temperature?: number // 创造性，默认0.7
  maxTokens?: number // 最大输出长度，默认1000
  stream?: boolean // 是否流式输出，默认true
  systemMessage?: string // 系统提示词
}
```

## 文件处理特性

### Kimi模型 (完整支持)

- ✅ 文本文件直接上传到Kimi API
- ✅ 获取文件ID进行引用
- ✅ 支持大文件分析 (最大3000 tokens)
- ✅ 文件内容和文件引用双重支持

### 其他模型 (基础支持)

- ✅ 文本文件内容直接包含在消息中
- ⚠️ 不支持文件上传API
- ⚠️ 受消息长度限制

## 扩展新模型

1. **创建API提供商类**：

```typescript
export class NewModelApiProvider extends BaseApiProvider {
  constructor() {
    super({
      endpoint: 'https://api.newmodel.com/v1/chat',
      model: 'new-model-name',
      headers: {},
    })
  }

  protected getApiKey(): string {
    return this.modelsStore.getApiKey('NewModel')
  }

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` }
  }
}
```

2. **在工厂中注册**：

```typescript
// 在 ApiProviderFactory.createProvider 中添加
case 'new-model-id':
  return new NewModelApiProvider()
```

3. **添加文件处理器**（可选）：

```typescript
export class NewModelFileProcessor implements FileProcessor {
  // 实现文件处理逻辑
}
```

## 优势总结

### 🔧 **开发效率**

- 新增AI模型无需修改业务逻辑
- 统一的错误处理和重试机制
- 一致的配置和调用方式

### 🎯 **用户体验**

- 所有模型都支持流式输出
- 统一的文件处理体验
- 会话级的模型独立选择

### 🏗️ **架构优势**

- 低耦合，高内聚
- 工厂模式便于扩展
- 统一接口便于测试和维护

### 📈 **可维护性**

- 抽象层隔离API细节
- 类型安全的TypeScript实现
- 清晰的错误处理和日志

## 使用示例

```typescript
// 在组件中使用
const result = await callUnifiedAiApi(
  'kimi',
  [{ role: 'user', content: '你好，请介绍一下你自己' }],
  {
    temperature: 0.7,
    maxTokens: 1000,
    stream: true,
  },
)

// 包含文件的调用
const resultWithFiles = await callAiApiWithFiles('kimi', messages, files)
```

这个抽象化系统为AI聊天应用提供了坚实的技术基础，既保证了当前功能的稳定性，又为未来的扩展提供了充分的灵活性。
