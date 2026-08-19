# danube_topcars 业务口径（找车源）

## 核心表

### car_source — 车源主表
- `id` — 车源 ID
- `title` — 标题
- `brand` — 品牌
- `series` — 车系
- `model` — 车型
- `price` — 价格（万元）
- `mileage` — 里程（万公里）
- `city` — 所在城市
- `status` — 状态（on_sale/sold/off_shelf）
- `source_type` — 来源类型
- `create_time` — 发布时间

### car_demand — 求购需求
- `id` — 需求 ID
- `user_id` — 用户 ID
- `brand` — 期望品牌
- `price_min` / `price_max` — 预算区间
- `status` — 状态

## 常用过滤条件
- 在售车源：`status = 'on_sale'`
