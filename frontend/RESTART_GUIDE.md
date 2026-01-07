# 前端服务重启指南

如果首页没有更新，请按以下步骤操作：

## 1. 停止当前开发服务器
按 `Ctrl + C` 停止正在运行的开发服务器

## 2. 清理缓存
```bash
# 清理 Vite 缓存
rm -rf node_modules/.vite
rm -rf dist

# 如果还是不行，清理整个 node_modules（可选）
# rm -rf node_modules
# npm install
```

## 3. 重启开发服务器
```bash
npm run dev
```

## 4. 浏览器硬刷新
- **Chrome/Edge**: `Ctrl + Shift + R` (Windows) 或 `Cmd + Shift + R` (Mac)
- **Firefox**: `Ctrl + F5` (Windows) 或 `Cmd + Shift + R` (Mac)
- 或者打开开发者工具 (F12)，右键刷新按钮，选择"清空缓存并硬性重新加载"

## 5. 检查控制台
打开浏览器开发者工具 (F12)，查看 Console 是否有错误信息

## 6. 验证路由
访问 `http://localhost:5173/` 应该看到"产品资产库"页面

如果还是不行，请检查：
- 确认 `frontend/src/app/App.tsx` 中路由配置正确
- 确认 `frontend/src/app/components/WorkbenchPage.tsx` 文件存在且正确导出
- 查看浏览器 Network 标签，确认加载的文件是否正确

