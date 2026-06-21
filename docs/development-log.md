# Cash Flow Pulse — 开发日志

> 记录开发过程中的决策、踩坑、迭代。

## 2026-06-21

### v0.1 - 需求收敛
- 与用户进行三轮需求沟通，明确核心场景
- 用户选择「佛系提醒 + 强制落点 + 双 Y 轴 + 锁定金额」方案
- 完成 PRD v0.1 草案
- 建立项目脚手架（pnpm monorepo 待后续搭建）

### 关键决策
1. **单用户架构**：V1 不做账号系统，所有数据 `user_id = 'default'`
2. **数据存储**：Cloudflare D1（SQLite 兼容），免费额度充足
3. **部署方案**：Cloudflare Pages + Workers，全栈 TypeScript
4. **强制落点**：即便数据无变化，重复录入也生成新记录，用 `data_unchanged` 标记区分

### 待办
- [ ] 初始化 pnpm workspace + 前后端包
- [ ] 编写 D1 schema 并初始化
- [ ] 实现核心计算逻辑 + 单元测试
- [ ] 搭建前端页面骨架

### v0.2 - 视觉系统升级
- 决定使用 Notion 设计系统作为视觉规范
- 发现本地 `popular-web-designs` skill 已有完整 Notion 设计 token 资料
- 完成 PRD 附录 C：完整颜色 / 字体 / 间距 / 圆角 / 阴影 / 组件样式 token
- 提供可直接复制的 CSS Variables + Tailwind Config 示例
- 配套组件样式（按钮、徽章、卡片、输入框）
- 项目特定应用映射表（哪些场景用什么 token）