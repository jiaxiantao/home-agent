# super_mario 业务口径（CRM 客户管理）

## 核心表

### customer — 客户档案主表
- `id` — 客户 ID（varchar 主键，非自增）
- `name` — 客户姓名
- `phone` — 手机号
- `shop_code` — 门店编码
- `owner` — 负责人（销售顾问 user_id）
- `level` — 客户等级（A/B/C/D）
- `status` — 客户状态
- `intention` — 购车意向（新车/二手车/不明确）
- `source` — 来源渠道
- `create_time` — 创建时间
- `update_time` — 更新时间
- `delete_time` — 删除时间（软删除）

### follow_record — 跟进记录
- `id` — 跟进 ID
- `customer_id` — 关联 customer.id
- `user_id` — 跟进人
- `content` — 跟进内容
- `follow_type` — 跟进方式（电话/微信/到店/其他）
- `next_follow_time` — 下次跟进时间
- `create_time` — 创建时间

### customer_care — 客户关怀
- `id` — 关怀 ID
- `customer_id` — 关联 customer.id
- `care_type` — 关怀类型（生日/节日/保养提醒）
- `status` — 执行状态

## 常用过滤条件
- 有效客户：`delete_time IS NULL`
- 按门店筛选：`shop_code = ?`
- 按负责人筛选：`owner = ?`
- 高意向客户：`level IN ('A', 'B')`

## 与其他库的区分
- **super_mario.customer** 是 CRM 客户档案，用于门店销售跟进
- **matador.cheniu_user** 是车牛/大风车 C 端用户账号
- 两者通过 phone 可关联，但业务含义不同
