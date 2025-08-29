<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  UploadOutlined,
  DeleteOutlined,
  FileOutlined,
  LoadingOutlined,
} from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { FileAttachment } from '@/stores/chatHistory'

// Props
interface Props {
  modelValue: FileAttachment[]
  disabled?: boolean
  maxSize?: number // MB
  maxCount?: number
  accept?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  maxSize: 10, // 默认10MB
  maxCount: 5, // 最多5个文件
  accept: '.txt,.md,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.mp3,.mp4,.avi,.mov',
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [files: FileAttachment[]]
  upload: [file: FileAttachment]
}>()

const fileInputRef = ref<HTMLInputElement>()
const isDragOver = ref(false)

// 计算属性
const canAddMore = computed(() => props.modelValue.length < props.maxCount)

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 检查文件类型
const isValidFileType = (file: File): boolean => {
  if (!props.accept) return true
  const acceptedTypes = props.accept.split(',').map((type) => type.trim().toLowerCase())
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  const mimeType = file.type.toLowerCase()

  return acceptedTypes.some((type) => {
    if (type.startsWith('.')) {
      return fileExtension === type
    }
    return mimeType.includes(type)
  })
}

// 检查文件大小
const isValidFileSize = (file: File): boolean => {
  return file.size <= props.maxSize * 1024 * 1024
}

// 生成文件预览URL
const generatePreviewUrl = (file: File): string => {
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file)
  }
  return ''
}

// 读取文本文件内容
const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

// 处理文件选择
const handleFileSelect = async (files: FileList | null) => {
  if (!files || files.length === 0) return

  const newFiles: FileAttachment[] = []

  for (
    let i = 0;
    i < files.length && props.modelValue.length + newFiles.length < props.maxCount;
    i++
  ) {
    const file = files[i]

    // 验证文件类型
    if (!isValidFileType(file)) {
      message.error(`文件 "${file.name}" 格式不支持`)
      continue
    }

    // 验证文件大小
    if (!isValidFileSize(file)) {
      message.error(`文件 "${file.name}" 大小超过 ${props.maxSize}MB`)
      continue
    }

    const fileAttachment: FileAttachment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      url: generatePreviewUrl(file),
      uploadStatus: 'pending',
    }

    // 如果是文本文件，读取内容
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      try {
        fileAttachment.content = await readTextFile(file)
      } catch (error) {
        console.error('读取文件内容失败:', error)
      }
    }

    newFiles.push(fileAttachment)
  }

  if (newFiles.length > 0) {
    const updatedFiles = [...props.modelValue, ...newFiles]
    emit('update:modelValue', updatedFiles)

    // 触发上传事件
    for (const file of newFiles) {
      emit('upload', file)
    }
  }

  // 清空文件输入
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// 移除文件
const removeFile = (fileId: string) => {
  const updatedFiles = props.modelValue.filter((file) => file.id !== fileId)

  // 释放预览URL
  const removedFile = props.modelValue.find((file) => file.id === fileId)
  if (removedFile?.url && removedFile.url.startsWith('blob:')) {
    URL.revokeObjectURL(removedFile.url)
  }

  emit('update:modelValue', updatedFiles)
}

// 拖拽事件
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (!props.disabled && canAddMore.value) {
    isDragOver.value = true
  }
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = false

  if (props.disabled || !canAddMore.value) return

  const files = e.dataTransfer?.files
  if (files) {
    handleFileSelect(files)
  }
}

// 获取文件图标
const getFileIcon = (file: FileAttachment) => {
  if (file.type.startsWith('image/')) return '🖼️'
  if (file.type.startsWith('video/')) return '🎥'
  if (file.type.startsWith('audio/')) return '🎵'
  if (file.type.includes('pdf')) return '📄'
  if (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx'))
    return '📝'
  if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt'))
    return '📃'
  return '📎'
}

// 获取状态颜色
const getStatusColor = (status: FileAttachment['uploadStatus']) => {
  switch (status) {
    case 'success':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    case 'uploading':
      return 'text-blue-500'
    default:
      return 'text-gray-500'
  }
}
</script>

<template>
  <div class="file-upload-container">
    <!-- 文件上传区域 -->
    <div
      v-if="canAddMore && !disabled"
      class="upload-area border-2 border-dashed rounded-lg p-4 transition-all duration-200 cursor-pointer"
      :class="[
        isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
      ]"
      @click="fileInputRef?.click()"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div class="text-center">
        <UploadOutlined class="text-2xl text-gray-400 mb-2" />
        <div class="text-sm text-gray-600">
          <span class="text-blue-500 font-medium">点击上传</span> 或拖拽文件到这里
        </div>
        <div class="text-xs text-gray-400 mt-1">
          支持 {{ accept }}，单个文件不超过 {{ maxSize }}MB，最多 {{ maxCount }} 个文件
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      :accept="accept"
      :disabled="disabled || !canAddMore"
      class="hidden"
      @change="(e) => handleFileSelect((e.target as HTMLInputElement).files)"
    />

    <!-- 文件列表 -->
    <div v-if="modelValue.length > 0" class="file-list mt-3 space-y-2">
      <div
        v-for="file in modelValue"
        :key="file.id"
        class="file-item flex items-center p-3 bg-gray-50 rounded-lg border"
      >
        <!-- 文件图标 -->
        <div class="file-icon text-lg mr-3">
          {{ getFileIcon(file) }}
        </div>

        <!-- 文件信息 -->
        <div class="file-info flex-1 min-w-0">
          <div class="file-name text-sm font-medium text-gray-900 truncate">
            {{ file.name }}
          </div>
          <div class="file-details flex items-center text-xs text-gray-500 mt-1">
            <span>{{ formatFileSize(file.size) }}</span>
            <span class="mx-2">•</span>
            <span :class="getStatusColor(file.uploadStatus)">
              <LoadingOutlined v-if="file.uploadStatus === 'uploading'" class="mr-1" />
              {{
                file.uploadStatus === 'pending'
                  ? '待上传'
                  : file.uploadStatus === 'uploading'
                    ? '上传中...'
                    : file.uploadStatus === 'success'
                      ? '上传成功'
                      : '上传失败'
              }}
            </span>
          </div>
        </div>

        <!-- 预览（图片） -->
        <div v-if="file.url && file.type.startsWith('image/')" class="file-preview mr-3">
          <img :src="file.url" :alt="file.name" class="w-10 h-10 object-cover rounded border" />
        </div>

        <!-- 删除按钮 -->
        <button
          v-if="!disabled"
          @click="removeFile(file.id)"
          class="delete-btn p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="删除文件"
        >
          <DeleteOutlined />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-area {
  min-height: 100px;
}

.file-item:hover {
  background-color: #f8f9fa;
}

.delete-btn {
  opacity: 0.7;
}

.delete-btn:hover {
  opacity: 1;
}
</style>
