<script setup lang="ts">
// Props
interface Props {
  visible: boolean
}
defineProps<Props>()

// Emits
const emit = defineEmits<{
  close: []
}>()

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-300 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="visible"
      class="fixed inset-0 bg-black bg-opacity-50 z-20"
      @click="handleClose"
    ></div>
  </Transition>
</template>
