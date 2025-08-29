#!/bin/bash

# 部署脚本 - 用于手动部署到GitHub Pages

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}开始部署到GitHub Pages...${NC}"

# 1. 构建项目
echo -e "${GREEN}1. 构建项目...${NC}"
npm run build

# 检查构建是否成功
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}构建失败，请检查错误并修复后重试${NC}"
  exit 1
fi

echo -e "${GREEN}构建成功!${NC}"

# 2. 提交代码到GitHub
echo -e "${GREEN}2. 提交代码到GitHub...${NC}"
git add .
git commit -m "更新: 部署到GitHub Pages"

# 3. 推送到GitHub
echo -e "${GREEN}3. 推送到GitHub...${NC}"
git push origin main

echo -e "${GREEN}代码已推送到GitHub!${NC}"
echo -e "${YELLOW}GitHub Actions将自动部署网站，请稍后访问 https://zhaoth.github.io/ai-cs/ 查看结果${NC}"