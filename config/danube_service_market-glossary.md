# danube_service_market 业务口径（服务市场）

## 核心表

### goods — 商品表
- `id` — 商品 ID
- `name` — 商品名称
- `sku_code` — SKU 编码
- `category` — 分类
- `price` — 价格（分）
- `status` — 状态
- `shop_code` — 所属门店

### order — 订单表
- `id` — 订单 ID
- `user_id` — 用户 ID
- `goods_id` — 关联商品
- `amount` — 订单金额（分）
- `status` — 订单状态
- `pay_time` — 支付时间
- `create_time` — 创建时间

## 常用过滤条件
- 有效订单：`status != 'cancelled'`
- 金额单位为「分」
