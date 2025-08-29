# GitHub Pages 部署指南

## 已完成的配置

✅ **已完成的部署准备工作**:
1. ✅ 创建GitHub Actions工作流配置文件 (.github/workflows/deploy.yml)
2. ✅ 修改Vite配置，添加正确的base路径 (vite.config.ts)
3. ✅ 项目已推送到GitHub仓库 (https://github.com/zhaoth/ai-cs)

## 启用GitHub Pages

要完成部署，您需要在GitHub仓库设置中启用GitHub Pages:

1. 访问您的GitHub仓库 (https://github.com/zhaoth/ai-cs)
2. 点击 **"Settings"** 选项卡
3. 在左侧菜单中，点击 **"Pages"**
4. 在 **"Build and deployment"** 部分:
   - **Source**: 选择 **"GitHub Actions"**
5. 此时系统会自动识别我们创建的工作流文件

## 触发部署

部署可以通过以下方式触发:

1. **自动触发**: 每次推送到main分支时
2. **手动触发**: 
   - 访问仓库的 **"Actions"** 选项卡
   - 选择 **"Deploy to GitHub Pages"** 工作流
   - 点击 **"Run workflow"** 按钮

## 查看部署状态

1. 访问仓库的 **"Actions"** 选项卡
2. 查看最新的工作流运行状态
3. 部署成功后，您可以通过以下URL访问您的应用:
   ```
   https://zhaoth.github.io/ai-cs/
   ```

## 常见问题解决

### 资源加载失败

如果部署后发现资源无法正确加载 (如CSS、JS文件404错误):

1. 确认 `vite.config.ts` 中的 `base` 配置正确设置为 `/ai-cs/`
2. 检查应用中的资源引用路径是否使用了绝对路径

### 路由问题

如果使用Vue Router的history模式，可能会在刷新页面时遇到404错误:

1. 考虑使用hash模式 (`createRouter({ history: createWebHashHistory() })`)
2. 或者在仓库中添加自定义404.html页面进行重定向

### 部署失败

如果GitHub Actions工作流失败:

1. 检查工作流日志中的错误信息
2. 确保所有依赖项都正确列在package.json中
3. 验证构建命令 (`npm run build`) 在本地能正常工作

## 后续维护

每次要更新网站时:

1. 在本地进行更改并测试
2. 提交并推送到GitHub仓库的main分支
3. GitHub Actions会自动构建并部署最新版本

## 自定义域名 (可选)

如果您想使用自定义域名:

1. 在GitHub仓库的Settings > Pages中添加自定义域名
2. 在您的域名提供商处添加相应的DNS记录
3. 在项目根目录创建一个名为`CNAME`的文件，内容为您的自定义域名