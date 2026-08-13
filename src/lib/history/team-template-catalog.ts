export type TeamTemplateSeed = {
  category: string;
  label: string;
  prompt: string;
};

/** 大风车团队常用问法（基于 matador / super_mario / danube_* 等业务域） */
export const teamTemplateSeed: TeamTemplateSeed[] = [
  // —— 客户 CRM ——
  { category: "客户CRM", label: "手机号查客户", prompt: "我想知道客户手机号为 13166990795 的客户信息" },
  { category: "客户CRM", label: "微信号查客户", prompt: "我想知道客户微信号为 wxid_demo001 的客户信息" },
  { category: "客户CRM", label: "客户总量", prompt: "super_mario 库里 CRM 客户一共有多少条？" },
  { category: "客户CRM", label: "今日新增客户", prompt: "统计今天新增的 CRM 客户数量" },
  { category: "客户CRM", label: "客户来源分布", prompt: "按客户来源 source 统计 CRM 客户数量分布" },
  { category: "客户CRM", label: "客户等级分布", prompt: "按客户等级 grade 统计客户数量" },
  { category: "客户CRM", label: "门店客户数", prompt: "按 shop_code 统计各门店 CRM 客户数量 TOP 20" },
  { category: "客户CRM", label: "负责人客户数", prompt: "按 owner 统计各销售负责的客户数量 TOP 20" },
  { category: "客户CRM", label: "近7日新增", prompt: "统计最近 7 天每天新增的 CRM 客户数" },
  { category: "客户CRM", label: "客户表结构", prompt: "super_mario.customer 表有哪些字段？" },
  { category: "客户CRM", label: "跟进记录量", prompt: "super_mario 库里客户跟进相关表有哪些？各表大概多少行？" },
  { category: "客户CRM", label: "高意向客户", prompt: "查询最近 30 天有更新的 CRM 客户，按 date_update 倒序 LIMIT 50" },
  { category: "客户CRM", label: "无手机号客户", prompt: "统计 phone 为空的 CRM 客户有多少" },
  { category: "客户CRM", label: "客户按城市", prompt: "如果 customer 表有城市字段，按城市统计客户数量 TOP 20" },
  { category: "客户CRM", label: "客户ID查详情", prompt: "我想知道客户 id 为 ANwbnMyLF0 的客户信息" },

  // —— 车牛用户 ——
  { category: "车牛用户", label: "用户ID查详情", prompt: "查询车牛用户 id 为 xxx 的用户信息（matador.cheniu_user）" },
  { category: "车牛用户", label: "手机号查用户", prompt: "手机号 13800138000 对应的车牛用户是谁？" },
  { category: "车牛用户", label: "有效用户总量", prompt: "matador.cheniu_user 有效用户（date_delete IS NULL）一共有多少？" },
  { category: "车牛用户", label: "今日注册用户", prompt: "统计今天注册的车牛用户数量" },
  { category: "车牛用户", label: "用户表字段", prompt: "matador.cheniu_user 表有哪些字段和类型？" },
  { category: "车牛用户", label: "近7日注册趋势", prompt: "统计最近 7 天每天新注册的车牛用户数" },
  { category: "车牛用户", label: "已注销用户", prompt: "统计 date_delete 不为空的用户有多少" },
  { category: "车牛用户", label: "用户与CRM区别", prompt: "cheniu_user 和 super_mario.customer 分别是什么业务？各查什么场景？" },

  // —— 车源 ——
  { category: "车源", label: "车牌查车辆", prompt: "我想知道车牌号为 皖JV066M 的车辆信息" },
  { category: "车源", label: "正式车源总量", prompt: "大风车正式车源一共有多少辆？" },
  { category: "车源", label: "状态分布", prompt: "统计各状态的正式车源数量分布" },
  { category: "车源", label: "今日上架", prompt: "统计今天上架的正式车源数量（test_type=0）" },
  { category: "车源", label: "品牌分布", prompt: "按品牌统计正式车源数量 TOP 20" },
  { category: "车源", label: "城市分布", prompt: "按城市统计正式车源数量 TOP 20" },
  { category: "车源", label: "价格区间", prompt: "统计正式车源售价 price 的分布区间（可分段 COUNT）" },
  { category: "车源", label: "里程分布", prompt: "统计正式车源里程 mileage 的分布" },
  { category: "车源", label: "年款分布", prompt: "按上牌年份统计正式车源数量" },
  { category: "车源", label: "门店车源数", prompt: "按门店统计正式车源数量 TOP 20" },
  { category: "车源", label: "在售车源", prompt: "当前在售状态的正式车源有多少辆？" },
  { category: "车源", label: "已售车源", prompt: "已售出的正式车源有多少辆？" },
  { category: "车源", label: "car表结构", prompt: "matador.car 表有哪些核心字段？" },
  { category: "车源", label: "测试车源排除", prompt: "正式车源和测试车源各有多少？对比 test_type" },
  { category: "车源", label: "近30日上架趋势", prompt: "统计最近 30 天每天上架的正式车源数" },
  { category: "车源", label: "车源均价", prompt: "正式车源平均售价是多少？" },

  // —— 求购线索 ——
  { category: "求购线索", label: "求购总量", prompt: "正式求购线索总量是多少？" },
  { category: "求购线索", label: "今日新增求购", prompt: "统计今天新增的正式求购线索数" },
  { category: "求购线索", label: "求购状态分布", prompt: "按状态统计求购线索数量分布" },
  { category: "求购线索", label: "求购品牌偏好", prompt: "求购线索里最受欢迎的品牌 TOP 15" },
  { category: "求购线索", label: "求购预算分布", prompt: "按预算区间统计求购线索数量" },
  { category: "求购线索", label: "求购城市分布", prompt: "按城市统计求购线索数量 TOP 20" },
  { category: "求购线索", label: "buy_car表结构", prompt: "matador.buy_car 表有哪些字段？" },
  { category: "求购线索", label: "近7日求购趋势", prompt: "统计最近 7 天每天新增求购线索数" },
  { category: "求购线索", label: "有效求购线索", prompt: "当前有效状态的求购线索有多少？" },
  { category: "求购线索", label: "门店求购量", prompt: "按门店统计求购线索数量 TOP 20" },

  // —— 订单成交 ——
  { category: "订单成交", label: "主订单总量", prompt: "主订单一共有多少（排除已删除）？" },
  { category: "订单成交", label: "今日成交订单", prompt: "统计今天成交的主订单数量" },
  { category: "订单成交", label: "订单状态分布", prompt: "按订单状态统计主订单数量分布" },
  { category: "订单成交", label: "近30日成交趋势", prompt: "统计最近 30 天每天成交的主订单数" },
  { category: "订单成交", label: "成交金额汇总", prompt: "统计本月主订单成交金额合计（如有金额字段）" },
  { category: "订单成交", label: "门店成交排行", prompt: "按门店统计成交订单数 TOP 20" },
  { category: "订单成交", label: "main_order结构", prompt: "matador.main_order 表有哪些字段？" },
  { category: "订单成交", label: "common_order对比", prompt: "main_order 和 common_order 有什么区别？各有多少行？" },
  { category: "订单成交", label: "成交适配订单", prompt: "danube_deal_adapter 库里成交相关表有哪些？" },
  { category: "订单成交", label: "取消订单量", prompt: "统计已取消的主订单有多少" },
  { category: "订单成交", label: "待支付订单", prompt: "当前待支付状态的主订单有多少？" },
  { category: "订单成交", label: "客单价", prompt: "本月成交订单的平均客单价是多少？" },

  // —— 会员 ——
  { category: "会员", label: "会员总量", prompt: "danube_member 库里个人会员一共有多少？" },
  { category: "会员", label: "有效会员", prompt: "当前有效状态的会员有多少？" },
  { category: "会员", label: "会员类型分布", prompt: "按会员类型统计会员数量分布" },
  { category: "会员", label: "即将到期会员", prompt: "未来 30 天内到期的会员有多少？" },
  { category: "会员", label: "会员表结构", prompt: "danube_member.membership_personal_information 表有哪些字段？" },
  { category: "会员", label: "今日新增会员", prompt: "统计今天新增的会员数" },
  { category: "会员", label: "会员库有哪些表", prompt: "danube_member 库里有哪些表？" },
  { category: "会员", label: "VIP会员占比", prompt: "VIP 会员占总会员的比例是多少？" },

  // —— 金融 ——
  { category: "金融", label: "贷款订单总量", prompt: "danube_mammon 库里贷款/金融订单一共有多少？" },
  { category: "金融", label: "放款状态分布", prompt: "按放款状态统计金融订单数量分布" },
  { category: "金融", label: "本月放款额", prompt: "统计本月放款金额合计" },
  { category: "金融", label: "金融库表目录", prompt: "danube_mammon 库里有哪些核心业务表？" },
  { category: "金融", label: "待审批贷款", prompt: "当前待审批的贷款申请有多少？" },
  { category: "金融", label: "逾期订单", prompt: "统计逾期状态的金融订单数量" },
  { category: "金融", label: "金融产品分布", prompt: "按金融产品类型统计订单数量" },
  { category: "金融", label: "近7日进件趋势", prompt: "统计最近 7 天每天新增的金融进件数" },

  // —— 电子合同 ——
  { category: "电子合同", label: "合同总量", prompt: "danube_electronic_contract 库里电子合同一共有多少份？" },
  { category: "电子合同", label: "签署状态分布", prompt: "按签署状态统计电子合同数量" },
  { category: "电子合同", label: "今日新签合同", prompt: "统计今天新创建的电子合同数" },
  { category: "电子合同", label: "合同库表", prompt: "danube_electronic_contract 库里有哪些表？" },
  { category: "电子合同", label: "待签署合同", prompt: "当前待签署的电子合同有多少？" },
  { category: "电子合同", label: "已作废合同", prompt: "已作废的电子合同有多少？" },

  // —— 联盟 ——
  { category: "联盟", label: "联盟伙伴数", prompt: "danube_league 库里联盟伙伴一共有多少？" },
  { category: "联盟", label: "联盟库表", prompt: "danube_league 库里有哪些表？" },
  { category: "联盟", label: "活跃联盟商", prompt: "统计最近 30 天有交易的联盟商数量" },
  { category: "联盟", label: "联盟订单量", prompt: "联盟相关订单一共有多少？" },
  { category: "联盟", label: "souche_league对比", prompt: "danube_league 和 souche_league 有什么区别？" },

  // —— 服务市场 ——
  { category: "服务市场", label: "商品SKU数", prompt: "danube_service_market 库里商品 SKU 一共有多少？" },
  { category: "服务市场", label: "服务订单量", prompt: "服务市场订单一共有多少？" },
  { category: "服务市场", label: "热销服务TOP", prompt: "按销量统计服务市场 TOP 20 商品" },
  { category: "服务市场", label: "服务市场库表", prompt: "danube_service_market 库里有哪些表？" },
  { category: "服务市场", label: "本月GMV", prompt: "统计本月服务市场成交 GMV" },
  { category: "服务市场", label: "上架商品数", prompt: "当前上架中的服务商品有多少？" },

  // —— 找车源/撮合 ——
  { category: "找车源", label: "撮合车源量", prompt: "danube_topcars 库里撮合车源一共有多少？" },
  { category: "找车源", label: "topcars库表", prompt: "danube_topcars 库里有哪些表？" },
  { category: "找车源", label: "今日新增撮合", prompt: "统计今天新增的找车源撮合记录数" },
  { category: "找车源", label: "撮合成功率", prompt: "找车源撮合成功和失败各有多少？" },
  { category: "找车源", label: "热门车型", prompt: "找车源需求里最常见的车型 TOP 15" },
  { category: "找车源", label: "撮合城市分布", prompt: "按城市统计找车源需求数量" },

  // —— 二手车市场 ——
  { category: "二手车市场", label: "市场车源量", prompt: "danube_usedcar_market 市场里上架车源有多少？" },
  { category: "二手车市场", label: "市场库表", prompt: "danube_usedcar_market 库里有哪些表？" },
  { category: "二手车市场", label: "市场成交单", prompt: "二手车市场成交订单有多少？" },
  { category: "二手车市场", label: "市场品牌分布", prompt: "二手车市场按品牌统计车源数量 TOP 20" },
  { category: "二手车市场", label: "今日上架市场车", prompt: "统计今天上架到二手车市场的车源数" },

  // —— 运营报表 ——
  { category: "运营报表", label: "运营日报趋势", prompt: "看一下最近运营日报里新增车源和求购的趋势" },
  { category: "运营报表", label: "operate_report结构", prompt: "matador.operate_report 表有哪些字段？" },
  { category: "运营报表", label: "昨日PV UV", prompt: "查询昨天运营日报里的 PV 和 UV" },
  { category: "运营报表", label: "近7日DAU", prompt: "统计最近 7 天运营日报中的 DAU 趋势" },
  { category: "运营报表", label: "本月新增车源", prompt: "统计本月运营日报累计新增车源" },
  { category: "运营报表", label: "本月新增求购", prompt: "统计本月运营日报累计新增求购" },
  { category: "运营报表", label: "转化率", prompt: "最近 7 天求购转成交的转化率大概是多少？" },
  { category: "运营报表", label: "门店运营对比", prompt: "按门店对比最近 7 天新增车源和成交数 TOP 20" },
  { category: "运营报表", label: "周报口径车源", prompt: "按城市统计本周正式车源新增量" },
  { category: "运营报表", label: "月环比车源", prompt: "对比本月和上月正式车源新增量的环比" },
  { category: "运营报表", label: "统计报表库", prompt: "danube_statistics 和 danube_report_script 库里有哪些报表相关表？" },
  { category: "运营报表", label: "车源求购比", prompt: "当前正式车源和求购线索的数量比是多少？" },

  // —— 元数据探索 ——
  { category: "元数据", label: "核心表目录", prompt: "分析库有哪些核心表和字段说明？" },
  { category: "元数据", label: "项目有哪些库", prompt: "大风车项目现在有哪些数据库？" },
  { category: "元数据", label: "matador有哪些表", prompt: "matador 库里有哪些表？" },
  { category: "元数据", label: "super_mario表", prompt: "super_mario 库里有哪些表？" },
  { category: "元数据", label: "danube_member表", prompt: "列出 danube_member 数据库里所有表名" },
  { category: "元数据", label: "car表字段类型", prompt: "car 表有哪些字段？每个字段是什么类型？" },
  { category: "元数据", label: "搜索客户相关表", prompt: "搜索包含 customer 关键字的表和字段" },
  { category: "元数据", label: "搜索订单相关表", prompt: "搜索包含 order 关键字的表" },
  { category: "元数据", label: "car表索引", prompt: "matador.car 表有哪些索引？" },
  { category: "元数据", label: "car表样例", prompt: "预览 matador.car 表前 5 行数据" },

  // —— SCRM/营销 ——
  { category: "SCRM营销", label: "SCRM客户数", prompt: "marketing_scrm 库里私域客户一共有多少？" },
  { category: "SCRM营销", label: "企微标签分布", prompt: "按企微标签统计 SCRM 客户数量 TOP 20" },
  { category: "SCRM营销", label: "营销推送量", prompt: "souche_cannon 营销推送记录一共有多少？" },
  { category: "SCRM营销", label: "活动参与人数", prompt: "danube-activity-center 最近一场活动参与人数是多少？" },
  { category: "SCRM营销", label: "SCRM库表", prompt: "marketing_scrm 库里有哪些表？" },
  { category: "SCRM营销", label: "今日营销触达", prompt: "统计今天营销推送触达的用户数" },

  // —— 检测 ——
  { category: "检测", label: "检测单总量", prompt: "车况检测订单一共有多少？" },
  { category: "检测", label: "检测库表", prompt: "souche_detect 和 detect_business 库里有哪些表？" },
  { category: "检测", label: "今日检测单", prompt: "统计今天新增的车况检测单数" },
  { category: "检测", label: "检测通过率", prompt: "车况检测通过和未通过各有多少？" },
  { category: "检测", label: "检测门店排行", prompt: "按门店统计检测单数量 TOP 20" },

  // —— B2B ——
  { category: "B2B", label: "B2B订单量", prompt: "suez B2B 交易订单一共有多少？" },
  { category: "B2B", label: "B2B库表", prompt: "suez 库里有哪些表？" },
  { category: "B2B", label: "B2B本月成交", prompt: "统计本月 B2B 成交订单数和金额" },
  { category: "B2B", label: "B2B买家数", prompt: "B2B 活跃买家一共有多少？" },

  // —— 企业微信 ——
  { category: "企业微信", label: "企微部门数", prompt: "anduin 企业微信部门一共有多少？" },
  { category: "企业微信", label: "企微员工数", prompt: "企业微信同步的员工联系人有多少？" },
  { category: "企业微信", label: "anduin库表", prompt: "anduin 库里有哪些表？" },
  { category: "企业微信", label: "企微客户绑定", prompt: "已绑定企微的 CRM 客户有多少？" },

  // —— 跨库综合 ——
  { category: "跨库综合", label: "车源订单漏斗", prompt: "对比正式车源数、求购线索数、主订单数，看转化漏斗" },
  { category: "跨库综合", label: "客户到成交", prompt: "从 CRM 客户到主订单成交的整体转化路径涉及哪些表？" },
  { category: "跨库综合", label: "全业务库清单", prompt: "列出大风车全部 42 个业务库及说明" },
  { category: "跨库综合", label: "matador核心表", prompt: "matador 库里和车源、订单、用户相关的核心表有哪些？" },
  { category: "跨库综合", label: "danube系列库", prompt: "danube 开头的业务库分别负责什么业务？" },
  { category: "跨库综合", label: "测试数据识别", prompt: "各核心表里如何区分测试数据和正式数据？" },
  { category: "跨库综合", label: "大表行数排行", prompt: "matador 库里行数最多的 10 张表是哪些？" },
  { category: "跨库综合", label: "昨日业务概览", prompt: "汇总昨天新增车源、求购、订单、客户的核心指标" },
];

export const teamTemplateSeedCount = teamTemplateSeed.length;

export function teamTemplateCategorySeed() {
  const names = new Set<string>(["内置", "自定义"]);
  for (const item of teamTemplateSeed) {
    names.add(item.category);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
