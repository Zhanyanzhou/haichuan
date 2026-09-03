export const TEMPLATE_CONTRACT_ROLE_LABELS: Record<string, string> = {
  action: "行动入口",
  actionText: "行动文案",
  after: "改造后",
  attribution: "署名",
  authorizedPhoto: "授权实拍",
  before: "改造前",
  bgImage: "背景图",
  buttonText: "按钮文字",
  categories: "分类卡片",
  certificates: "证书图片",
  copy: "文案",
  coverImage: "封面图",
  desktopImage: "桌面主图",
  detailImage: "细节图",
  detailImageOne: "细节图一",
  detailImageTwo: "细节图二",
  event: "活动主图",
  eyebrow: "引导文字",
  frames: "轮播画面",
  hotspots: "热区",
  image: "主图",
  leadImage: "引导图",
  list: "列表内容",
  mainImage: "主海报",
  mainQuote: "顾客分享",
  mobileImage: "移动端主图",
  points: "卖点",
  primaryAction: "主要行动",
  primaryText: "主要文字",
  product: "商品",
  productCards: "商品卡片",
  promises: "服务承诺",
  relatedProducts: "相关商品",
  sceneImage: "场景主图",
  scenes: "场景卡片",
  secondaryText: "补充文字",
  steps: "步骤",
  store: "门店",
  subtitle: "描述",
  time: "时间信息",
  title: "标题",
  wearingImage: "佩戴场景图",
  works: "作品图片",
};

export const TEMPLATE_CONTRACT_KIND_LABELS = {
  media: "图片槽位",
  video: "视频槽位",
  text: "文字区域",
  action: "行动入口",
  product: "商品内容",
  collection: "内容集合",
} as const;

export const TEMPLATE_CONTRACT_CAPABILITY_LABELS: Record<string, string> = {
  content: "内容",
  crop: "裁切",
  fit: "图片适配",
  focus: "画面焦点",
  items: "条目内容",
  layer: "层级",
  layout: "布局",
  link: "跳转",
  playback: "播放设置",
  position: "位置",
  reference: "内容关联",
  ratio: "比例",
  size: "尺寸",
  typography: "文字样式",
  visibility: "显示与隐藏",
  zoom: "缩放",
};

export function getTemplateContractRoleLabel(roleId: string, semantic?: string) {
  return TEMPLATE_CONTRACT_ROLE_LABELS[roleId] ?? semantic ?? roleId;
}

export function getTemplateContractNodeLabel(nodeId: string, roleId?: string) {
  return TEMPLATE_CONTRACT_ROLE_LABELS[nodeId]
    ?? (roleId ? TEMPLATE_CONTRACT_ROLE_LABELS[roleId] : undefined)
    ?? nodeId;
}
