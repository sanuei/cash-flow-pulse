import {
  Wallet,
  House,
  ChartLine,
  Settings as Gear,
  Banknote,
  CreditCard,
  BarChart3,
  Inbox,
  TriangleAlert,
  Sparkles,
  Lock,
  MapPin,
  Pencil,
  X,
  Plus,
  FileJson,
  FileSpreadsheet,
  Upload,
  Download,
  Check,
  // v0.3 新增
  TrendingDown,    // 投资（钱流出）
  Receipt,         // 账单
  Briefcase,       // 收入/工作
  Tv,              // 订阅/娱乐
  ChevronDown,     // 折叠展开
  ChevronRight,    // 折叠收起
  CalendarDays,    // 日历/周期
  TrendingUp,      // 上涨
  // v1.0 新增
  User,            // 用户头像
  LogOut,          // 注销
  Loader2,         // 加载 spinner
  // v1.2 新增
  Search,          // 搜索
  type LucideIcon,
} from 'lucide-react';
import { forwardRef } from 'react';

/**
 * 项目用到的 icon 名称清单
 *
 * 用 union type 限定拼写，编译期就能拦住 typo。
 * 如果要新增 icon，先在这里加映射。
 */
export type IconName =
  | 'wallet'      // 💰 Logo
  | 'home'        // 🏠 主页 Tab
  | 'chart'       // 📈 曲线 Tab
  | 'settings'    // ⚙️ 设置 Tab
  | 'cash'        // 💵 现金来源
  | 'card'        // 💳 信用卡
  | 'bar-chart'   // 📊 趋势图
  | 'inbox'       // 📭 通用空状态
  | 'warning'     // ⚠️ 错误
  | 'sparkle'     // ✨ 高亮
  | 'lock'        // 🔒 锁定
  | 'pin'         // 📍 采集点
  | 'edit'        // ✎ 编辑
  | 'close'       // × 关闭/删除
  | 'add'         // + 新增
  | 'export-json' // 📥 导出 JSON
  | 'export-csv'  // 📊 导出 CSV
  | 'import'      // 📤 导入
  | 'download'    // ⬇ 下载
  | 'check'       // ✓ 完成
  // v0.3 新增
  | 'investment'  // 投资（钱流出）
  | 'bill'        // 账单
  | 'income'      // 收入/工作
  | 'subscription'// 订阅/娱乐
  | 'chevron-down'// 折叠展开
  | 'chevron-right'// 折叠收起
  | 'calendar'    // 日历/周期
  | 'trending-up'// 上涨
  // v1.0 新增
  | 'user'       // 用户
  | 'logout'     // 注销
  | 'loading'    // 加载
  | 'search';    // 搜索

const map: Record<IconName, LucideIcon> = {
  wallet: Wallet,
  home: House,
  chart: ChartLine,
  settings: Gear,
  cash: Banknote,
  card: CreditCard,
  'bar-chart': BarChart3,
  inbox: Inbox,
  warning: TriangleAlert,
  sparkle: Sparkles,
  lock: Lock,
  pin: MapPin,
  edit: Pencil,
  close: X,
  add: Plus,
  'export-json': FileJson,
  'export-csv': FileSpreadsheet,
  import: Upload,
  download: Download,
  check: Check,
  // v0.3 新增
  investment: TrendingUp,
  bill: Receipt,
  income: Briefcase,
  subscription: Tv,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  calendar: CalendarDays,
  'trending-up': TrendingUp,
  // v1.0 新增
  user: User,
  logout: LogOut,
  loading: Loader2,
  search: Search,
};

type Props = {
  name: IconName;
  /** 图标尺寸（像素），默认 20 */
  size?: number;
  /** Tailwind className 控制颜色（用 currentColor 继承父元素 text-*） */
  className?: string;
  /** 线条粗细，默认 1.75（比 Lucide 默认 2 略细，配合 Notion 1px 边框） */
  strokeWidth?: number;
  /** 不可访问 label（屏幕阅读器） */
  'aria-label'?: string;
};

/**
 * 统一 Icon 组件
 *
 * 设计要点：
 * - 颜色靠 currentColor 继承父元素的 text-* 类，不要 hardcode 颜色
 * - strokeWidth 默认 1.75，比 Lucide 默认 2 更克制
 * - forwardRef 兼容未来可能接入的 Headless UI / Radix
 */
export const Icon = forwardRef<SVGSVGElement, Props>(function Icon(
  { name, size = 20, className, strokeWidth = 1.75, 'aria-label': ariaLabel },
  ref,
) {
  const Cmp = map[name];
  return (
    <Cmp
      ref={ref}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
});