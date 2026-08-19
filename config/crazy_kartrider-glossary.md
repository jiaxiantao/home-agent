# crazy_kartrider 业务口径（车辆管理）

## 核心表

### car — 车辆主表
- `id` — 车辆 ID
- `plate_number` — 车牌号（按车牌查车的主要字段）
- `vin_number` — VIN 码
- `brand` — 品牌
- `series` — 车系
- `model` — 车型
- `color` — 颜色
- `mileage` — 里程
- `price` — 售价
- `shop_code` — 所属门店
- `status` — 车辆状态
- `date_delete` — 删除标记（0=有效）
- `create_time` — 入库时间

## 常用过滤条件
- 有效车辆：`date_delete = 0`
- 按车牌查车：`plate_number = ?`
- 按门店筛选：`shop_code = ?`

## 与其他库的区分
- **crazy_kartrider.car** — 门店车辆管理（库存、在售）
- **matador.car** — matador 正式车源（test_type=0 为正式数据）
- 两者是不同系统，按车牌查车优先用 crazy_kartrider
