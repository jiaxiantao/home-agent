# 演进路线图

大风车数据分析助手：自然语言 → 只读 SQL → HITL 确认 → 表格/图表。

## 已完成

- [x] matador test MySQL（`ANALYTICS_MYSQL_*`）
- [x] 只读 SQL guard + LIMIT + 超时
- [x] schema catalog + propose/execute/build_chart
- [x] A2UI 确认卡 / 表格 / 图表
- [x] SSE `a2ui` / `awaiting_input` / resume

## 下一阶段

- [ ] Session / Run 持久化
- [ ] 鉴权与只读账号
- [ ] `information_schema` 轻量刷新
- [ ] 多轮追问上下文
- [ ] 导出 / 收藏问法

## 协议

- **AG-UI**：事件流、用户动作回传
- **A2UI**：声明式 UI 结构

详见 `.cursor/rules/ag-ui-a2ui.mdc`。
