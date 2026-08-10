# 演进路线图

Home Agent 已从学习型 Plan→Tool 演示，转向 **大风车数据分析助手**（自然语言 → 只读 SQL → HITL 确认 → 表格/图表）。

## 已完成（一期）

- [x] 对接 matador **test** MySQL（`ANALYTICS_MYSQL_*`）
- [x] 只读 SQL guard + LIMIT + 超时
- [x] 车源 / 订单 / 求购 / 运营报表 schema catalog
- [x] `propose_sql` → 用户确认 → `execute_sql` → A2UI 表格/图表
- [x] SSE 扩展 `a2ui` / `awaiting_input`（向 AG-UI 对齐）

## 下一阶段

- [ ] Session / Message / AgentRun 持久化
- [ ] 最小鉴权（API Key 或登录）
- [ ] 只读账号替换 `souche_rw`
- [ ] Schema 从 `information_schema` 轻量刷新
- [ ] 多轮追问带最近 SQL/结果上下文加深
- [ ] 导出 / 收藏问法 / 下钻

## 协议约定

- **AG-UI**：事件流、会话状态、用户动作回传
- **A2UI**：声明式 UI 结构（surface / component / action）

详见 `.cursor/rules/ag-ui-a2ui.mdc`。
