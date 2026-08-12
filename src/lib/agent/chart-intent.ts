/** 用户是否在问题中明确要求生成图表/可视化 */
const CHART_INTENT_PATTERN =
  /(?:图表|统计图|柱状图|折线图|饼图|条形图|扇形图|可视化|趋势图|分布图|画(?:个|一)?图|绘制(?:图表|统计图)?|用图(?:表)?(?:展示|看|显示)|生成(?:相关)?图(?:表)?|做成图(?:表)?|出(?:个)?图(?:表)?|以图(?:表)?(?:展示|呈现)|\bchart\b|\bgraph\b|visuali[sz]e|\bplot\b)/iu;

export function userRequestedChart(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return CHART_INTENT_PATTERN.test(text);
}
