# Notion 设计系统（Cash Flow Pulse 视觉规范）

> **项目**：Cash Flow Pulse
> **版本**：v1.0（与 PRD v0.3 同步）
> **日期**：2026-06-21
> **来源**：本设计规范完全照搬 Notion 官方设计 token，下表是可直接复制到 CSS Variables / Tailwind Config 的值。

---

## 为什么是 Notion 设计系统

- 暖中性色（黄棕底色）比冷灰更亲和
- 耳语边框（1px 透明度 0.1）比实色边框更轻盈
- 多层极淡阴影（4-5 层叠加）比单层厚阴影更高级
- 唯一饱和色（Notion 蓝）作强调，比"到处高亮"更克制

---

## 1. 颜色 Token

### 1.1 CSS Variables

```css
:root {
  /* === Primary === */
  --color-text-primary: rgba(0, 0, 0, 0.95);    /* 主文字：暖近黑 */
  --color-bg-primary: #ffffff;                   /* 主背景：纯白 */
  --color-accent: #0075de;                       /* Notion 蓝：CTA、链接 */
  --color-accent-hover: #005bab;                 /* 蓝按钮按下 */

  /* === Brand Secondary === */
  --color-deep-navy: #213183;                    /* 强调区（罕用） */
  --color-focus-ring: #097fe8;                   /* 焦点环 */

  /* === Warm Neutral Scale（暖中性） === */
  --color-bg-alt: #f6f5f4;                       /* 暖白：区块交替 */
  --color-surface-dark: #31302e;                 /* 暖深：深色面 */
  --color-text-secondary: #615d59;               /* 暖灰 500：次文字 */
  --color-text-muted: #a39e98;                   /* 暖灰 300：占位 */

  /* === Semantic Accent（语义色，少用） === */
  --color-success: #1aae39;                      /* 成功：预算充裕 */
  --color-warning: #dd5b00;                      /* 警告：信用卡待还 */
  --color-info: #2a9d99;                         /* 信息：提示 */
  --color-decorative: #ff64c8;                   /* 装饰粉：罕用 */
  --color-premium: #391c57;                      /* 高级紫：罕用 */

  /* === Interactive === */
  --color-link: #0075de;                         /* 链接 */
  --color-link-hover: #005bab;                   /* 链接 hover */
  --color-badge-bg: #f2f9ff;                     /* 徽章背景：淡蓝 */
  --color-badge-text: #097fe8;                   /* 徽章文字 */

  /* === Border === */
  --border-whisper: 1px solid rgba(0, 0, 0, 0.1); /* 标准耳语边框 */
  --border-input: 1px solid #dddddd;             /* 输入框边框 */
}
```

### 1.2 颜色角色速查

| 用途 | Token | 值 |
|------|-------|----|
| 主文字 | `--color-text-primary` | `rgba(0,0,0,0.95)` |
| 次文字 | `--color-text-secondary` | `#615d59` |
| 占位/弱化 | `--color-text-muted` | `#a39e98` |
| 主背景 | `--color-bg-primary` | `#ffffff` |
| 区块交替背景 | `--color-bg-alt` | `#f6f5f4` |
| 强调/CTA | `--color-accent` | `#0075de` |
| 强调 hover | `--color-accent-hover` | `#005bab` |
| 成功 | `--color-success` | `#1aae39` |
| 警告 | `--color-warning` | `#dd5b00` |
| 边框 | `--border-whisper` | `1px solid rgba(0,0,0,0.1)` |

---

## 2. 字体 Token

### 2.1 字体栈

```css
:root {
  --font-sans: 'Inter', -apple-system, system-ui, 'Segoe UI',
               'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
               'Liberation Mono', 'Courier New', monospace;

  /* 启用 OpenType 特性：等宽数字 + 本地化字形 */
  --font-features: 'lnum', 'locl';
}
```

### 2.2 字号字重字距表

| 角色 | 尺寸 | 字重 | 行高 | 字距 | 用途 |
|------|------|------|------|------|------|
| Display Hero | 64px | 700 | 1.00 | -2.125px | 主仪表盘日均预算（最大字号） |
| Section Heading | 48px | 700 | 1.00 | -1.5px | 区块大标题 |
| Sub-heading | 26px | 700 | 1.23 | -0.625px | 区块副标题 |
| Card Title | 22px | 700 | 1.27 | -0.25px | 卡片标题 |
| Body Large | 20px | 600 | 1.40 | -0.125px | 引导文案 |
| Body | 16px | 400 | 1.50 | normal | 正文 |
| Body Medium | 16px | 500 | 1.50 | normal | 导航 / 强调 UI |
| Nav / Button | 15px | 600 | 1.33 | normal | 按钮文字 |
| Caption | 14px | 500 | 1.43 | normal | 元信息 |
| Badge | 12px | 600 | 1.33 | 0.125px | 徽章 / 状态标签 |

**4 字重体系**：
- 400 — 阅读（body）
- 500 — 交互（UI / icon）
- 600 — 强调（导航 / 按钮）
- 700 — 标题（display）

---

## 3. 间距与圆角

```css
:root {
  /* 8px 基准间距 */
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 6px;
  --space-4: 8px;
  --space-5: 12px;
  --space-6: 16px;
  --space-7: 24px;
  --space-8: 32px;
  --space-9: 48px;
  --space-10: 64px;

  /* 6 档圆角 */
  --radius-micro: 4px;           /* 按钮、输入框 */
  --radius-subtle: 5px;          /* 链接、菜单项 */
  --radius-standard: 8px;        /* 小卡片 */
  --radius-comfortable: 12px;    /* 标准卡片、图片顶部 */
  --radius-large: 16px;          /* Hero 卡片 */
  --radius-pill: 9999px;         /* 徽章、标签 */
}
```

---

## 4. 阴影 Token（多层极淡叠加）

```css
:root {
  /* Level 1: 耳语边框（默认） */
  /* border: 1px solid rgba(0, 0, 0, 0.1); */

  /* Level 2: 软卡片（4 层叠加，单层 ≤ 0.04） */
  --shadow-card:
    rgba(0, 0, 0, 0.04) 0px 4px 18px,
    rgba(0, 0, 0, 0.027) 0px 2.025px 7.85px,
    rgba(0, 0, 0, 0.02) 0px 0.8px 2.93px,
    rgba(0, 0, 0, 0.01) 0px 0.175px 1.04px;

  /* Level 3: 深卡片（5 层，模态框） */
  --shadow-deep:
    rgba(0, 0, 0, 0.01) 0px 1px 3px,
    rgba(0, 0, 0, 0.02) 0px 3px 7px,
    rgba(0, 0, 0, 0.02) 0px 7px 15px,
    rgba(0, 0, 0, 0.04) 0px 14px 28px,
    rgba(0, 0, 0, 0.05) 0px 23px 52px;
}
```

| 层级 | 用途 |
|------|------|
| Level 1（耳语边框） | 默认卡片、分隔线 |
| Level 2（软卡片） | 内容卡片、Feature 块 |
| Level 3（深卡片） | 模态框、Hero 元素 |

---

## 5. 组件样式示例

### 5.1 Primary Button（Notion 蓝）

```css
.btn-primary {
  background: var(--color-accent);
  color: #ffffff;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 4px;
  font: 600 15px/1.33 var(--font-sans);
  transition: transform 0.1s, background 0.15s;
}
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-primary:active { transform: scale(0.95); }
.btn-primary:focus-visible { outline: 2px solid var(--color-focus-ring); }
```

### 5.2 Secondary Button（半透明灰）

```css
.btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-primary);
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 4px;
  font: 600 15px/1.33 var(--font-sans);
}
.btn-secondary:hover { background: rgba(0, 0, 0, 0.08); }
.btn-secondary:active { transform: scale(0.95); }
```

### 5.3 Pill Badge（胶囊徽章）

```css
.badge {
  background: var(--color-badge-bg);
  color: var(--color-badge-text);
  padding: 4px 8px;
  border-radius: 9999px;
  font: 600 12px/1.33 var(--font-sans);
  letter-spacing: 0.125px;
}
```

### 5.4 Card（标准卡片）

```css
.card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  padding: 24px;
}
```

### 5.5 Input（输入框）

```css
.input {
  background: #ffffff;
  color: var(--color-text-primary);
  border: 1px solid #dddddd;
  border-radius: 4px;
  padding: 6px;
  font: 400 16px/1.50 var(--font-sans);
}
.input:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 0;
}
```

---

## 6. Tailwind Config（Cash Flow Pulse 实际配置）

```javascript
// apps/web/tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Notion 主色
        notion: {
          text: 'rgba(0, 0, 0, 0.95)',
          'text-secondary': '#615d59',
          'text-muted': '#a39e98',
          bg: '#ffffff',
          'bg-alt': '#f6f5f4',
          'bg-dark': '#31302e',
          blue: '#0075de',
          'blue-hover': '#005bab',
          'blue-soft': '#f2f9ff',
          'blue-text': '#097fe8',
          warning: '#dd5b00',
          success: '#1aae39',
          border: 'rgba(0, 0, 0, 0.1)',
        },
      },
      borderRadius: {
        micro: '4px',
        subtle: '5px',
        standard: '8px',
        comfortable: '12px',
        large: '16px',
        pill: '9999px',
      },
      boxShadow: {
        card: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px',
        deep: 'rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'system-ui',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      letterSpacing: {
        'tight-display': '-0.0332em', // -2.125px / 64px
        'tight-section': '-0.0234em', // -1.5px / 64px
      },
    },
  },
  plugins: [],
};
```

---

## 7. 关键设计原则（应用此项目时）

1. **暖中性优先**：所有灰都带黄棕底色（`#f6f5f4` 米白），禁止使用冷灰（如 `#e5e7eb`）
2. **耳语边框**：默认边框用 `rgba(0,0,0,0.1)`，不要用实色灰
3. **唯一饱和色**：只有 Notion 蓝 `#0075de` 用作强调；信用卡应还可用警告橙 `#dd5b00`，但仅在真正需要警示时
4. **多层极淡阴影**：单层 opacity 不超过 0.05，4-5 层叠加
5. **等宽数字**：所有金额数字启用 Inter 的 `lnum` 特性，避免宽度抖动
6. **字距随字号缩放**：64px → -2.125px，16px → normal
7. **区块交替**：白色 `#ffffff` 与暖白 `#f6f5f4` 交替，不使用硬边框分割
8. **块级留白**：大区块之间垂直 padding 64-80px，不要堆砌

---

## 8. 此项目特定应用（Cash Flow Pulse 实际用法）

| 场景 | 使用 Token |
|------|-----------|
| 主页日均预算大字 | `--color-text-primary` + `font-feature-settings: lnum` |
| 净可用现金卡片 | `--shadow-card` 软阴影 + `--color-bg-primary` |
| 活跃信用卡提示 | `--color-warning` 文字 + `--color-badge-bg` 风格徽章 |
| 采集点提示条 | `--color-bg-alt` 暖白底 + `--color-accent` 强调 |
| 区块交替 | 白 `#ffffff` ↔ 暖白 `#f6f5f4` |
| 数据未变快照点 | `--color-text-muted` `#a39e98` 浅灰 |
| v0.3 本期支出汇总 | `--color-warning` 橙色 + 折叠卡片 |
| v0.3 本期收入汇总 | `--color-success` 绿色 + 折叠卡片 |
| v0.3 投资 icon | `trending-down` Lucide icon + `text-notion-warning` |

---

## 9. 给开发者的速查清单

- **新建组件时**先问：能用现有 `.btn-primary` / `.card` / `.badge` / `.input` 吗？能用就用
- **不要 hardcode 颜色**，全部用 `notion-*` Tailwind 类
- **不要 hardcode 圆角**，用 `rounded-micro/subtle/standard/comfortable/large/pill`
- **不要 hardcode 阴影**，用 `shadow-card` 或 `shadow-deep`
- **数字加 `font-numeric` 类**确保等宽
- **icon 用 `<Icon name="...">` 组件**，参考 `apps/web/src/components/Icon.tsx`

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 1.0 | 2026-06-21 | 从 PRD v0.3 附录 C 拆出独立文件 |