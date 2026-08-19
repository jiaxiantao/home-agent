# danube_mammon 业务口径（金融）

## 核心表

### loan_order — 贷款订单
- `id` — 订单 ID
- `user_id` — 用户 ID
- `amount` — 贷款金额（分）
- `period` — 期数
- `rate` — 利率
- `status` — 状态（apply/audit/approved/rejected/disbursed/closed）
- `car_id` — 关联车辆
- `shop_code` — 门店
- `create_time` — 申请时间

### fund_order — 放款记录
- `id` — 放款 ID
- `loan_order_id` — 关联 loan_order
- `fund_amount` — 放款金额
- `fund_channel` — 放款渠道
- `fund_time` — 放款时间
- `status` — 放款状态

## 常用过滤条件
- 有效订单：`status NOT IN ('cancelled', 'rejected')`
- 已放款：`status = 'disbursed'`

## 金额单位
- 金额字段统一为「分」，展示时需 / 100
