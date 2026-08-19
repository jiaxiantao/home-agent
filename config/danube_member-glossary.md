# danube_member 业务口径

## 核心表

### membership_personal_information — 会员个人信息主表
- `user_id` — 大风车用户 ID（关联 matador.cheniu_user）
- `member_id` — 会员 ID
- `member_level` — 会员等级
- `status` — 状态（1=有效）
- `phone` — 手机号
- `real_name` — 真实姓名
- `id_card` — 身份证号（脱敏字段）

### membership_rights — 会员权益
- `member_id` — 关联 membership_personal_information
- `rights_code` — 权益编码
- `rights_name` — 权益名称
- `expire_time` — 过期时间

### membership_points — 积分记录
- `member_id` — 会员 ID
- `points` — 积分数
- `type` — 积分类型（earn/consume）
- `source` — 来源

## 常用过滤条件
- 有效会员：`status = 1`
- 按会员等级筛选：`member_level IN (...)`

## 关联关系
- `membership_personal_information.user_id` → `matador.cheniu_user.user_id`
