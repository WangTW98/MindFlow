// @ts-nocheck
const CARD_WIDTH = 300;
const CARD_MIN_HEIGHT = 230;
const PROJECT_OVERVIEW_NODE_ID = "projectOverview";
const PROJECT_OVERVIEW_WIDTH = 340;
const PROJECT_OVERVIEW_DEFAULT_X = -760;
const PROJECT_OVERVIEW_DEFAULT_Y = 0;
const CARD_DRAG_THRESHOLD_PX = 4;
const CARD_CLICK_SUPPRESS_MS = 100;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2.6;
const EDGE_TYPE_OPTIONS = [
  {
    value: "interaction",
    group: "interaction",
    label: "交互触发",
    color: "var(--vscode-charts-blue, #3794ff)",
    description: "用户通过执行操作(如鼠标点击、屏幕触控等行为)主动触发的跳转行为；"
  },
  {
    value: "autoNavigate",
    group: "auto",
    label: "自动跳转",
    color: "var(--vscode-charts-green, #89d185)",
    description: "应用/系统自动执行的跳转行为(如后台计算完成、支付完成等)；"
  },
  {
    value: "dataFlow",
    group: "data",
    label: "数据流转",
    color: "var(--vscode-charts-purple, #b180d7)",
    description: "当用户主动触发或系统自动触发某些条件时，控制数据同步(如后台发布文章，APP端进行查看)；"
  },
  {
    value: "statusChange",
    group: "status",
    label: "状态变更",
    color: "var(--vscode-charts-pink, #f472b6)",
    description: "用户主动或系统自动触发，但跳转或执行目标仅在相同状态组内执行(用于状态变更);"
  },
  {
    value: "nestedRelation",
    group: "nesting",
    label: "嵌套关系",
    color: "var(--vscode-charts-yellow, #facc15)",
    description: "此类型仅描述页面元素/组件间的嵌套关系(如父子组件/元素组的嵌套)"
  }
];
const PAGE_TYPE_OPTIONS = [
  { value: "page", label: "页面", icon: "file-text" },
  { value: "popup", label: "弹窗", icon: "panel-top" },
  { value: "component", label: "组件", icon: "component" },
  { value: "navigation", label: "导航", icon: "navigation" },
  { value: "skeleton", label: "骨架", icon: "layout-template" }
];
const APP_SURFACE_TYPE_OPTIONS = [
  { value: "admin", label: "管理后台", icon: "shield-check" },
  { value: "web", label: "Web 端", icon: "globe" },
  { value: "app", label: "App 端", icon: "smartphone" },
  { value: "miniapp", label: "小程序", icon: "scan-line" },
  { value: "desktop", label: "桌面端", icon: "monitor" },
  { value: "other", label: "其他端", icon: "monitor-smartphone" }
];
const PENDING_EDGE_DETAILS_TTL_MS = 15000;
const APP_SURFACE_SOURCE_X = -360;
const APP_SURFACE_SOURCE_Y = 0;
const APP_SURFACE_SOURCE_GAP = 240;
