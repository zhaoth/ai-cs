import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface SearchItem {
  id: string
  content: string
  timestamp: Date
}

export const useSearchHistoryStore = defineStore('searchHistory', () => {
  // 使用 VueUse 的 useLocalStorage 实现持久化存储
  const searchHistory = useLocalStorage<SearchItem[]>('ai-chat-search-history', [])

  // 当前搜索关键词
  const currentSearchQuery = ref('')

  // 最大存储条目数
  const MAX_HISTORY_ITEMS = 50

  // 添加搜索记录
  const addSearchItem = (content: string) => {
    if (!content.trim()) return

    const searchItem: SearchItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      content: content.trim(),
      timestamp: new Date(),
    }

    // 检查是否已存在相同内容，如果存在则删除旧的
    const existingIndex = searchHistory.value.findIndex((item) => item.content === content.trim())
    if (existingIndex !== -1) {
      searchHistory.value.splice(existingIndex, 1)
    }

    // 添加到开头
    searchHistory.value.unshift(searchItem)

    // 限制最大条目数
    if (searchHistory.value.length > MAX_HISTORY_ITEMS) {
      searchHistory.value = searchHistory.value.slice(0, MAX_HISTORY_ITEMS)
    }
  }

  // 删除特定搜索记录
  const removeSearchItem = (id: string) => {
    const index = searchHistory.value.findIndex((item) => item.id === id)
    if (index !== -1) {
      searchHistory.value.splice(index, 1)
    }
  }

  // 清空所有搜索历史
  const clearSearchHistory = () => {
    searchHistory.value = []
  }

  // 获取最近的搜索记录（用于搜索建议）
  const getRecentSearches = (limit: number = 10) => {
    return searchHistory.value.slice(0, limit)
  }

  // 搜索历史记录（模糊匹配）
  const searchInHistory = (query: string) => {
    if (!query.trim()) return searchHistory.value

    const lowerQuery = query.toLowerCase()
    return searchHistory.value.filter((item) => item.content.toLowerCase().includes(lowerQuery))
  }

  // 设置当前搜索查询
  const setCurrentSearchQuery = (query: string) => {
    currentSearchQuery.value = query
  }

  return {
    searchHistory,
    currentSearchQuery,
    addSearchItem,
    removeSearchItem,
    clearSearchHistory,
    getRecentSearches,
    searchInHistory,
    setCurrentSearchQuery,
  }
})
