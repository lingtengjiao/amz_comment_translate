# 隐私政策部署指南

## 📋 概述

已创建隐私政策页面：`privacy-policy.html`

此页面包含中英文双语内容，符合 Google Chrome Web Store 的要求。

## 🚀 部署步骤

### 方案 1：使用 GitHub Pages（推荐，免费）

1. **创建 GitHub 仓库**（如果还没有）：
   ```bash
   cd /Users/lingtengjiao/AI项目/amz_comment_translate
   git init  # 如果还没有初始化
   ```

2. **将隐私政策文件添加到仓库**：
   ```bash
   git add extension/privacy-policy.html
   git commit -m "Add privacy policy for Chrome Web Store"
   ```

3. **推送到 GitHub**：
   ```bash
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

4. **启用 GitHub Pages**：
   - 进入仓库 Settings
   - 找到 Pages 选项
   - 选择 Source: `main` branch，文件夹选择 `/ (root)`
   - 保存后访问：`https://your-username.github.io/your-repo/extension/privacy-policy.html`

### 方案 2：使用自己的网站

1. **上传文件到服务器**：
   - 将 `privacy-policy.html` 上传到您的网站服务器
   - 确保可以通过 HTTPS 访问

2. **访问 URL**：
   - 例如：`https://yourdomain.com/privacy-policy.html`

### 方案 3：使用 Netlify/Vercel（免费静态托管）

1. **Netlify**：
   - 访问 https://www.netlify.com
   - 拖拽包含 `privacy-policy.html` 的文件夹
   - 获得免费 URL：`https://your-site.netlify.app/privacy-policy.html`

2. **Vercel**：
   - 访问 https://vercel.com
   - 连接 GitHub 仓库
   - 自动部署，获得 URL

## ✏️ 需要更新的信息

在提交到 Chrome Web Store 之前，请更新以下信息：

### 1. 联系信息（在 `privacy-policy.html` 中）

找到第 13 节"联系我们"，更新：

```html
<li><strong>邮箱 / Email</strong>：support@voc-master.com</li>
<li><strong>网站 / Website</strong>：https://voc-master.com</li>
```

替换为您的实际联系邮箱和网站。

### 2. 版权信息

页面底部的版权信息：
```html
© 2026 VOC-Master. 保留所有权利。
```

### 3. 最后更新日期

页面顶部的日期：
```html
<p class="last-updated">最后更新日期 / Last Updated: 2026年1月16日</p>
```

## 📝 Chrome Web Store 提交清单

在提交扩展时，确保：

- [ ] 隐私政策 URL 已部署并可公开访问
- [ ] 隐私政策使用 HTTPS（必需）
- [ ] 联系信息已更新为实际信息
- [ ] 隐私政策内容准确反映了扩展的实际行为
- [ ] 已阅读并遵守 Chrome Web Store 的隐私政策要求

## 🔗 Chrome Web Store 要求

根据 Google 的要求，隐私政策必须：

1. ✅ **公开可访问**：任何人都可以访问，无需登录
2. ✅ **使用 HTTPS**：必须通过安全连接提供
3. ✅ **准确完整**：准确描述数据收集和使用方式
4. ✅ **易于理解**：使用清晰的语言
5. ✅ **及时更新**：当数据处理方式改变时及时更新

## 📄 隐私政策内容概览

已包含的章节：

1. ✅ 信息收集（用户认证、产品信息、评论数据、使用数据）
2. ✅ 信息使用方式
3. ✅ 数据存储（本地存储、服务器存储、数据保留）
4. ✅ 数据共享（不会出售数据、有限共享、第三方服务）
5. ✅ 数据安全措施
6. ✅ 用户权利（访问、更正、删除、导出、撤回同意）
7. ✅ Cookie 和本地存储说明
8. ✅ 儿童隐私保护
9. ✅ 国际数据传输
10. ✅ 隐私政策变更说明
11. ✅ 第三方网站说明
12. ✅ 权限详细说明
13. ✅ 联系方式

## ⚠️ 重要提醒

1. **法律合规**：根据您的目标市场，可能需要遵守：
   - GDPR（欧盟）
   - CCPA（加利福尼亚）
   - PIPEDA（加拿大）
   - 其他地区的数据保护法律

2. **定期审查**：建议每 6-12 个月审查一次隐私政策，确保内容仍然准确。

3. **用户通知**：如果隐私政策有重大变更，应通知现有用户。

## 🆘 需要帮助？

如果对隐私政策内容有疑问，建议咨询：
- 法律顾问
- 数据保护专家
- Chrome Web Store 支持团队

---

**下一步**：部署隐私政策后，在 Chrome Web Store 开发者控制台的"隐私实践"部分填写隐私政策 URL。