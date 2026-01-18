---
name: Rufus AI 对话功能
overview: 在插件中添加与 Amazon Rufus AI 助手对话的功能，自动提问并提取"I wish it had..."句式相关的功能建议，并将数据上传到后端。
todos:
  - id: backend-schema
    content: 在 schemas.py 中创建 RufusConversationRequest 和 RufusConversationResponse schema
    status: completed
  - id: backend-model
    content: 创建 RufusConversation 数据库模型
    status: completed
  - id: backend-migration
    content: 创建数据库迁移脚本，添加 rufus_conversations 表
    status: completed
  - id: backend-api
    content: 创建 POST /api/v1/rufus/conversation API 端点
    status: completed
  - id: frontend-detect
    content: 实现 detectRufusChat() 和 openRufusChat() 函数
    status: completed
  - id: frontend-send
    content: 实现 sendRufusQuestion() 和 waitForRufusAnswer() 函数
    status: completed
  - id: frontend-extract
    content: 实现 extractRufusResponse() 函数，从 DOM 提取回答
    status: completed
  - id: frontend-upload
    content: 实现 uploadRufusConversation() 函数，上传数据到后端
    status: completed
  - id: frontend-ui
    content: 在 overlay 中添加 Rufus 对话按钮和结果显示区域
    status: completed
  - id: frontend-integration
    content: 集成所有功能，实现完整的对话流程
    status: completed
---

