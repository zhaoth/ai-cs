import { marked } from 'marked'
import hljs from 'highlight.js'

// 配置 marked 选项
marked.setOptions({
  breaks: true, // 支持换行符转换为 <br>
  gfm: true, // 启用 GitHub Flavored Markdown
})

/**
 * 同步版本的 Markdown 渲染（为了兼容性）
 * @param markdown - Markdown 格式的文本
 * @returns 转换后的 HTML 字符串
 */
export function renderMarkdownSync(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return ''
  }

  try {
    // 预处理：处理特殊字符
    const preprocessed = markdown
      // 处理表格前后的空行
      .replace(/\n\s*\|/g, '\n|')
      // 确保代码块前后有空行
      .replace(/```/g, '\n```\n')
      // 处理列表项
      .replace(/\n(\d+\.|\*|\-|\+)\s/g, '\n\n$1 ')

    const result = marked.parse(preprocessed, { async: false })

    // 处理代码高亮
    const processedResult = typeof result === 'string' ? result : ''
    return processedResult.replace(
      /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
      (match, lang, code) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            const highlightedCode = hljs.highlight(code, { language: lang }).value
            return `<pre><code class="hljs language-${lang}">${highlightedCode}</code></pre>`
          } catch (err) {
            console.warn('代码高亮失败:', err)
          }
        }
        return match
      },
    )
  } catch (error) {
    console.error('Markdown 渲染失败:', error)
    // 失败时返回原始文本，但进行基本的 HTML 转义
    return markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>')
  }
}

/**
 * 检查文本是否包含 Markdown 语法
 * @param text - 要检查的文本
 * @returns 是否包含 Markdown 语法
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }

  // 检查常见的 Markdown 语法模式
  const markdownPatterns = [
    /^#{1,6}\s/, // 标题
    /\*\*.*?\*\*/, // 粗体
    /\*.*?\*/, // 斜体
    /`.*?`/, // 行内代码
    /```[\s\S]*?```/, // 代码块
    /^\s*[\*\-\+]\s/, // 无序列表
    /^\s*\d+\.\s/, // 有序列表
    /\[.*?\]\(.*?\)/, // 链接
    /!\[.*?\]\(.*?\)/, // 图片
    /^\s*\|.*\|/, // 表格
    /^\s*>\s/, // 引用
    /^---+$/, // 分割线
  ]

  return markdownPatterns.some((pattern) => pattern.test(text))
}

/**
 * 获取纯文本内容（去除 Markdown 语法）
 * @param markdown - Markdown 格式的文本
 * @returns 纯文本内容
 */
export function getPlainText(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return ''
  }

  try {
    // 使用同步版本转换为 HTML 后提取纯文本
    const html = renderMarkdownSync(markdown)
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    return tempDiv.textContent || tempDiv.innerText || ''
  } catch (error) {
    console.error('提取纯文本失败:', error)
    // 简单移除常见的 Markdown 语法
    return markdown
      .replace(/#{1,6}\s/g, '') // 移除标题标记
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
      .replace(/`(.*?)`/g, '$1') // 移除行内代码标记
      .replace(/```[\s\S]*?```/g, '[代码块]') // 替换代码块
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接，保留文本
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片: $1]') // 替换图片
      .trim()
  }
}
