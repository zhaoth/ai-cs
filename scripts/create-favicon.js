const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 检查是否已安装svg2png
try {
  execSync('which convert')
  console.log('ImageMagick已安装，可以进行转换')
} catch (error) {
  console.error('需要安装ImageMagick来转换SVG到ICO。请运行: brew install imagemagick')
  process.exit(1)
}

// 执行转换命令
try {
  execSync(
    'convert -background none public/favicon.svg -define icon:auto-resize=16,32,48,64 public/favicon.ico',
  )
  console.log('成功创建favicon.ico')
} catch (error) {
  console.error('转换失败:', error)
}
