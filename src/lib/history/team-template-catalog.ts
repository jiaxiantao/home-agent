export type TeamTemplateSeed = {
  category: string;
  label: string;
  prompt: string;
};

/** 大风车团队常用问法：面向业务同学，不出现库名/表名/字段名 */
export const teamTemplateSeed: TeamTemplateSeed[] = [
  // —— 客户 CRM ——
  { category: "客户CRM", label: "手机号查客户", prompt: "我想知道客户手机号为 13166990795 的客户信息" },
  { category: "客户CRM", label: "微信号查客户", prompt: "我想知道客户微信号为 wxid_demo001 的客户信息" },
  { category: "客户CRM", label: "客户总量", prompt: "现在 CRM 里一共有多少客户？" },
  { category: "客户CRM", label: "今日新增客户", prompt: "今天新进了多少 CRM 客户？" },
  { category: "客户CRM", label: "客户来源分布", prompt: "这些 CRM 客户分别是从哪些渠道来的？各有多少？" },
  { category: "客户CRM", label: "客户等级分布", prompt: "按客户等级看一下客户数量分布" },
  { category: "客户CRM", label: "门店客户数", prompt: "各门店分别有多少 CRM 客户？看前 20 名" },
  { category: "客户CRM", label: "负责人客户数", prompt: "各销售名下分别有多少客户？看前 20 名" },
  { category: "客户CRM", label: "近7日新增", prompt: "最近 7 天每天新进了多少 CRM 客户？" },
  { category: "客户CRM", label: "客户档案概况", prompt: "CRM 客户档案一般能看到哪些信息？" },
  { category: "客户CRM", label: "跟进记录量", prompt: "最近客户跟进多不多？大概有多少条跟进记录？" },
  { category: "客户CRM", label: "高意向客户", prompt: "最近 30 天有跟进更新的客户有哪些？按更新时间从近到远看前 50 条" },
  { category: "客户CRM", label: "无手机号客户", prompt: "有多少 CRM 客户还没有登记手机号？" },
  { category: "客户CRM", label: "客户按城市", prompt: "按城市统计 CRM 客户数量，看前 20 名" },
  { category: "客户CRM", label: "客户ID查详情", prompt: "我想知道客户编号为 ANwbnMyLF0 的客户信息" },

  // —— 车牛用户 ——
  { category: "车牛用户", label: "用户ID查详情", prompt: "查询车牛用户编号为 xxx 的用户信息" },
  { category: "车牛用户", label: "手机号查用户", prompt: "手机号 13800138000 对应的车牛用户是谁？" },
  { category: "车牛用户", label: "有效用户总量", prompt: "现在有效的车牛用户一共有多少？" },
  { category: "车牛用户", label: "今日注册用户", prompt: "今天新注册了多少车牛用户？" },
  { category: "车牛用户", label: "用户资料概况", prompt: "车牛用户资料一般能看到哪些信息？" },
  { category: "车牛用户", label: "近7日注册趋势", prompt: "最近 7 天每天新注册了多少车牛用户？" },
  { category: "车牛用户", label: "已注销用户", prompt: "已经注销的车牛用户有多少？" },
  { category: "车牛用户", label: "用户与CRM区别", prompt: "车牛用户和 CRM 客户有什么区别？分别什么时候查？" },

  // —— 车源 ——
  { category: "车源", label: "车牌查车辆", prompt: "我想知道车牌号为 皖JV066M 的车辆信息" },
  { category: "车源", label: "正式车源总量", prompt: "大风车正式车源一共有多少辆？" },
  { category: "车源", label: "状态分布", prompt: "统计各状态的正式车源数量分布" },
  { category: "车源", label: "今日上架", prompt: "今天新上架了多少辆正式车源？" },
  { category: "车源", label: "品牌分布", prompt: "按品牌统计正式车源数量，看前 20 名" },
  { category: "车源", label: "城市分布", prompt: "按城市统计正式车源数量，看前 20 名" },
  { category: "车源", label: "价格区间", prompt: "正式车源售价大概落在哪些区间？各有多少辆？" },
  { category: "车源", label: "里程分布", prompt: "正式车源的行驶里程大概怎么分布？" },
  { category: "车源", label: "年款分布", prompt: "按上牌年份统计正式车源数量" },
  { category: "车源", label: "门店车源数", prompt: "各门店分别有多少辆正式车源？看前 20 名" },
  { category: "车源", label: "在售车源", prompt: "当前在售状态的正式车源有多少辆？" },
  { category: "车源", label: "已售车源", prompt: "已经卖出去的正式车源有多少辆？" },
  { category: "车源", label: "车源信息概况", prompt: "查一辆车一般能看到哪些信息？" },
  { category: "车源", label: "测试车源排除", prompt: "正式车源和测试车源各有多少辆？" },
  { category: "车源", label: "近30日上架趋势", prompt: "最近 30 天每天上架了多少辆正式车源？" },
  { category: "车源", label: "车源均价", prompt: "正式车源平均售价是多少？" },

  // —— 求购线索 ——
  { category: "求购线索", label: "求购总量", prompt: "正式求购线索总量是多少？" },
  { category: "求购线索", label: "今日新增求购", prompt: "今天新进来多少条正式求购线索？" },
  { category: "求购线索", label: "求购状态分布", prompt: "按状态统计求购线索数量分布" },
  { category: "求购线索", label: "求购品牌偏好", prompt: "求购线索里最受欢迎的品牌有哪些？看前 15 名" },
  { category: "求购线索", label: "求购预算分布", prompt: "按预算区间统计求购线索数量" },
  { category: "求购线索", label: "求购城市分布", prompt: "按城市统计求购线索数量，看前 20 名" },
  { category: "求购线索", label: "求购信息概况", prompt: "一条求购线索一般能看到哪些信息？" },
  { category: "求购线索", label: "近7日求购趋势", prompt: "最近 7 天每天新增了多少条求购线索？" },
  { category: "求购线索", label: "有效求购线索", prompt: "当前还有效的求购线索有多少？" },
  { category: "求购线索", label: "门店求购量", prompt: "各门店分别有多少条求购线索？看前 20 名" },

  // —— 订单成交 ——
  { category: "订单成交", label: "主订单总量", prompt: "有效主订单一共有多少单？" },
  { category: "订单成交", label: "今日成交订单", prompt: "今天成交了多少单？" },
  { category: "订单成交", label: "订单状态分布", prompt: "按订单状态看一下主订单数量分布" },
  { category: "订单成交", label: "近30日成交趋势", prompt: "最近 30 天每天成交了多少单？" },
  { category: "订单成交", label: "成交金额汇总", prompt: "本月主订单成交金额合计是多少？" },
  { category: "订单成交", label: "门店成交排行", prompt: "各门店成交订单数排行，看前 20 名" },
  { category: "订单成交", label: "订单信息概况", prompt: "一笔成交订单一般能看到哪些信息？" },
  { category: "订单成交", label: "订单类型对比", prompt: "主订单和普通订单有什么区别？各有多少单？" },
  { category: "订单成交", label: "成交适配订单", prompt: "成交适配相关的订单现在有多少？" },
  { category: "订单成交", label: "取消订单量", prompt: "已经取消的主订单有多少？" },
  { category: "订单成交", label: "待支付订单", prompt: "当前待支付的主订单有多少？" },
  { category: "订单成交", label: "客单价", prompt: "本月成交订单的平均客单价是多少？" },

  // —— 会员 ——
  { category: "会员", label: "会员总量", prompt: "现在个人会员一共有多少？" },
  { category: "会员", label: "有效会员", prompt: "当前还有效的会员有多少？" },
  { category: "会员", label: "会员类型分布", prompt: "按会员类型看一下会员数量分布" },
  { category: "会员", label: "即将到期会员", prompt: "未来 30 天内到期的会员有多少？" },
  { category: "会员", label: "会员资料概况", prompt: "会员资料一般能看到哪些信息？" },
  { category: "会员", label: "今日新增会员", prompt: "今天新开通了多少会员？" },
  { category: "会员", label: "会员到期情况", prompt: "已经到期和即将到期的会员大概各有多少？" },
  { category: "会员", label: "VIP会员占比", prompt: "VIP 会员占总会员的比例是多少？" },

  // —— 金融 ——
  { category: "金融", label: "贷款订单总量", prompt: "贷款/金融订单一共有多少？" },
  { category: "金融", label: "放款状态分布", prompt: "按放款状态看一下金融订单数量分布" },
  { category: "金融", label: "本月放款额", prompt: "本月放款金额合计是多少？" },
  { category: "金融", label: "金融产品概况", prompt: "现在有哪些金融产品？各自做了多少单？" },
  { category: "金融", label: "待审批贷款", prompt: "当前待审批的贷款申请有多少？" },
  { category: "金融", label: "逾期订单", prompt: "逾期状态的金融订单有多少？" },
  { category: "金融", label: "金融产品分布", prompt: "按金融产品类型统计订单数量" },
  { category: "金融", label: "近7日进件趋势", prompt: "最近 7 天每天新进了多少金融进件？" },

  // —— 电子合同 ——
  { category: "电子合同", label: "合同总量", prompt: "电子合同一共有多少份？" },
  { category: "电子合同", label: "签署状态分布", prompt: "按签署状态看一下电子合同数量" },
  { category: "电子合同", label: "今日新签合同", prompt: "今天新创建了多少份电子合同？" },
  { category: "电子合同", label: "合同签署概况", prompt: "电子合同现在签到哪一步的多？待签、已签、作废各多少？" },
  { category: "电子合同", label: "待签署合同", prompt: "当前待签署的电子合同有多少？" },
  { category: "电子合同", label: "已作废合同", prompt: "已经作废的电子合同有多少？" },

  // —— 联盟 ——
  { category: "联盟", label: "联盟伙伴数", prompt: "联盟伙伴一共有多少？" },
  { category: "联盟", label: "联盟合作概况", prompt: "联盟合作现在覆盖哪些类型的伙伴？各有多少？" },
  { category: "联盟", label: "活跃联盟商", prompt: "最近 30 天有成交的联盟商有多少？" },
  { category: "联盟", label: "联盟订单量", prompt: "联盟相关订单一共有多少？" },
  { category: "联盟", label: "联盟渠道对比", prompt: "不同联盟渠道的伙伴数和订单量有什么差别？" },

  // —— 服务市场 ——
  { category: "服务市场", label: "商品SKU数", prompt: "服务市场里商品规格一共有多少？" },
  { category: "服务市场", label: "服务订单量", prompt: "服务市场订单一共有多少？" },
  { category: "服务市场", label: "热销服务TOP", prompt: "服务市场卖得最好的商品有哪些？看前 20 名" },
  { category: "服务市场", label: "服务商品概况", prompt: "服务市场现在有哪些在售服务？大概能看到什么信息？" },
  { category: "服务市场", label: "本月GMV", prompt: "本月服务市场成交 GMV 是多少？" },
  { category: "服务市场", label: "上架商品数", prompt: "当前上架中的服务商品有多少？" },

  // —— 找车源/撮合 ——
  { category: "找车源", label: "撮合车源量", prompt: "现在找车源里一共有多少车源在撮合？" },
  { category: "找车源", label: "找车需求概况", prompt: "最近大家找车都在找什么？需求大概长什么样？" },
  { category: "找车源", label: "今日新增撮合", prompt: "今天新增加了多少找车源撮合？" },
  { category: "找车源", label: "撮合成功率", prompt: "找车源撮合成功和失败各有多少？" },
  { category: "找车源", label: "热门车型", prompt: "找车源需求里最常见的车型有哪些？看前 15 名" },
  { category: "找车源", label: "撮合城市分布", prompt: "按城市看一下找车源需求数量" },

  // —— 二手车市场 ——
  { category: "二手车市场", label: "市场车源量", prompt: "二手车市场里现在上架了多少车源？" },
  { category: "二手车市场", label: "市场车源概况", prompt: "二手车市场上架的车一般能看到哪些信息？" },
  { category: "二手车市场", label: "市场成交单", prompt: "二手车市场成交订单有多少？" },
  { category: "二手车市场", label: "市场品牌分布", prompt: "二手车市场按品牌看车源数量，看前 20 名" },
  { category: "二手车市场", label: "今日上架市场车", prompt: "今天新上架到二手车市场的车源有多少？" },

  // —— 运营报表 ——
  { category: "运营报表", label: "运营日报趋势", prompt: "看一下最近运营日报里新增车源和求购的趋势" },
  { category: "运营报表", label: "日报指标概况", prompt: "运营日报里通常有哪些核心指标？" },
  { category: "运营报表", label: "昨日PV UV", prompt: "昨天运营日报里的 PV 和 UV 是多少？" },
  { category: "运营报表", label: "近7日DAU", prompt: "最近 7 天运营日报里的 DAU 趋势怎样？" },
  { category: "运营报表", label: "本月新增车源", prompt: "本月运营日报累计新增了多少车源？" },
  { category: "运营报表", label: "本月新增求购", prompt: "本月运营日报累计新增了多少求购？" },
  { category: "运营报表", label: "转化率", prompt: "最近 7 天求购转成交的转化率大概是多少？" },
  { category: "运营报表", label: "门店运营对比", prompt: "按门店对比最近 7 天新增车源和成交数，看前 20 名" },
  { category: "运营报表", label: "周报口径车源", prompt: "按城市统计本周正式车源新增量" },
  { category: "运营报表", label: "月环比车源", prompt: "对比本月和上月正式车源新增量的环比" },
  { category: "运营报表", label: "核心报表口径", prompt: "日常看数一般看哪些运营报表指标？" },
  { category: "运营报表", label: "车源求购比", prompt: "当前正式车源和求购线索的数量比是多少？" },

  // —— 元数据 / 能查什么 ——
  { category: "元数据", label: "核心表目录", prompt: "现在用数据智能体能查哪些业务数据？" },
  { category: "元数据", label: "项目有哪些库", prompt: "大风车现在覆盖哪些业务线？分别能问什么？" },
  { category: "元数据", label: "车源能查什么", prompt: "查车源一般可以问哪些问题？" },
  { category: "元数据", label: "客户能查什么", prompt: "查客户一般可以问哪些问题？" },
  { category: "元数据", label: "会员能查什么", prompt: "查会员一般可以问哪些问题？" },
  { category: "元数据", label: "车源信息范围", prompt: "看一辆车通常能看到哪些信息？" },
  { category: "元数据", label: "搜索客户相关", prompt: "和客户相关的数据都能查什么？" },
  { category: "元数据", label: "搜索订单相关", prompt: "和订单成交相关的数据都能查什么？" },
  { category: "元数据", label: "车源样例", prompt: "随便看几辆最近上架的正式车源长什么样？" },
  { category: "元数据", label: "测试数据识别", prompt: "正式数据和测试数据一般怎么区分？" },

  // —— SCRM/营销 ——
  { category: "SCRM营销", label: "SCRM客户数", prompt: "私域客户一共有多少？" },
  { category: "SCRM营销", label: "企微标签分布", prompt: "按企微标签看一下私域客户数量，看前 20 名" },
  { category: "SCRM营销", label: "营销推送量", prompt: "营销推送记录一共有多少？" },
  { category: "SCRM营销", label: "活动参与人数", prompt: "最近一场活动参与人数是多少？" },
  { category: "SCRM营销", label: "私域客户概况", prompt: "私域客户一般能看到哪些信息？" },
  { category: "SCRM营销", label: "今日营销触达", prompt: "今天营销推送触达了多少用户？" },

  // —— 检测 ——
  { category: "检测", label: "检测单总量", prompt: "车况检测订单一共有多少？" },
  { category: "检测", label: "检测结果概况", prompt: "车况检测一般能看到哪些结果？通过和未通过各多少？" },
  { category: "检测", label: "今日检测单", prompt: "今天新增加了多少车况检测单？" },
  { category: "检测", label: "检测通过率", prompt: "车况检测通过和未通过各有多少？" },
  { category: "检测", label: "检测门店排行", prompt: "各门店检测单数量排行，看前 20 名" },

  // —— B2B ——
  { category: "B2B", label: "B2B订单量", prompt: "B2B 交易订单一共有多少？" },
  { category: "B2B", label: "B2B交易概况", prompt: "B2B 交易一般能看到哪些信息？" },
  { category: "B2B", label: "B2B本月成交", prompt: "本月 B2B 成交订单数和金额是多少？" },
  { category: "B2B", label: "B2B买家数", prompt: "B2B 活跃买家一共有多少？" },

  // —— 企业微信 ——
  { category: "企业微信", label: "企微部门数", prompt: "企业微信部门一共有多少？" },
  { category: "企业微信", label: "企微员工数", prompt: "企业微信同步的员工联系人有多少？" },
  { category: "企业微信", label: "企微组织概况", prompt: "企业微信现在同步了哪些组织和人员信息？" },
  { category: "企业微信", label: "企微客户绑定", prompt: "已经绑定企微的 CRM 客户有多少？" },

  // —— 跨库综合 ——
  { category: "跨库综合", label: "车源订单漏斗", prompt: "对比正式车源数、求购线索数、主订单数，看转化漏斗" },
  { category: "跨库综合", label: "客户到成交", prompt: "从 CRM 客户到主订单成交，整体转化大概怎样？" },
  { category: "跨库综合", label: "业务全景", prompt: "大风车现在能一起看哪些核心业务指标？" },
  { category: "跨库综合", label: "车源订单用户", prompt: "车源、订单、用户这几块分别怎么问最合适？" },
  { category: "跨库综合", label: "会员与成交", prompt: "会员里有多少已经成交过？" },
  { category: "跨库综合", label: "测试数据识别", prompt: "去掉测试数据后，车源、求购、订单这些核心量是多少？" },
  { category: "跨库综合", label: "城市供需对比", prompt: "车源多的城市，成交是不是也高？" },
  { category: "跨库综合", label: "昨日业务概览", prompt: "汇总昨天新增车源、求购、订单、客户的核心指标" },

  // —— 图表（问法需明确要求可视化，才会调用 build_chart）——
  // 每种 supported chartType 至少 1 条；label 含图形名便于筛选测试

  // bar 柱状图
  { category: "图表", label: "柱状图·车源品牌", prompt: "按品牌统计正式车源数量，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·车源城市", prompt: "按城市统计正式车源数量，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·售价区间", prompt: "正式车源售价大概落在哪些区间？各有多少辆？用柱状图展示" },
  { category: "图表", label: "柱状图·客户城市", prompt: "按城市统计 CRM 客户数量，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·求购品牌", prompt: "求购线索里最受欢迎的品牌有哪些？看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·门店成交", prompt: "各门店成交订单数排行，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·门店运营", prompt: "按门店对比最近 7 天新增车源和成交数，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·城市供需", prompt: "按城市对比正式车源数和成交订单数，看前 15 名，用柱状图展示" },
  { category: "图表", label: "柱状图·业务漏斗", prompt: "对比正式车源数、求购线索数、主订单数，看转化漏斗，用柱状图展示" },

  // groupedBar 分组柱状图
  { category: "图表", label: "分组柱·城市供需", prompt: "按城市对比正式车源数和成交订单数，看前 10 名，用分组柱状图展示" },

  // stackedBar 堆积柱状图
  { category: "图表", label: "堆积柱·城市供需", prompt: "按城市对比正式车源数和成交订单数，看前 10 名，用堆积柱状图展示" },

  // horizontalBar 条形图
  { category: "图表", label: "条形图·车源品牌", prompt: "按品牌统计正式车源数量，看前 15 名，用条形图展示" },

  // histogram 直方图
  { category: "图表", label: "直方图·售价分布", prompt: "正式车源售价大概落在哪些区间？各有多少辆？用直方图展示" },

  // waterfall 瀑布图
  { category: "图表", label: "瀑布图·业务转化", prompt: "对比正式车源数、求购线索数、主订单数，用瀑布图展示" },

  // line 折线图
  { category: "图表", label: "折线图·车源上架", prompt: "最近 30 天每天上架了多少辆正式车源？画折线图" },
  { category: "图表", label: "折线图·客户新增", prompt: "最近 7 天每天新进了多少 CRM 客户？画折线图" },
  { category: "图表", label: "折线图·求购新增", prompt: "最近 7 天每天新增了多少条求购线索？画折线图" },
  { category: "图表", label: "折线图·成交趋势", prompt: "最近 30 天每天成交了多少单？画折线图" },
  { category: "图表", label: "折线图·金融进件", prompt: "最近 7 天每天新进了多少金融进件？画折线图" },
  { category: "图表", label: "折线图·运营DAU", prompt: "最近 7 天运营日报里的 DAU 趋势怎样？画折线图" },

  // area 面积图
  { category: "图表", label: "面积图·成交趋势", prompt: "最近 30 天每天成交了多少单？用面积图展示" },

  // stackedArea 堆积面积图
  { category: "图表", label: "堆积面积·车源求购", prompt: "最近 30 天每天新增车源和求购线索各有多少？用堆积面积图展示" },

  // stepLine 阶梯图
  { category: "图表", label: "阶梯图·成交趋势", prompt: "最近 7 天每天成交了多少单？用阶梯图展示" },

  // pie 饼图
  { category: "图表", label: "饼图·车源状态", prompt: "统计各状态的正式车源数量，用饼图展示" },
  { category: "图表", label: "饼图·客户来源", prompt: "这些 CRM 客户分别是从哪些渠道来的？各有多少？用饼图展示" },
  { category: "图表", label: "饼图·求购状态", prompt: "按状态统计求购线索数量分布，用饼图展示" },
  { category: "图表", label: "饼图·订单状态", prompt: "按订单状态看一下主订单数量分布，用饼图展示" },
  { category: "图表", label: "饼图·会员类型", prompt: "按会员类型看一下会员数量分布，用饼图展示" },
  { category: "图表", label: "饼图·金融产品", prompt: "按金融产品类型统计订单数量，用饼图展示" },
  { category: "图表", label: "饼图·合同签署", prompt: "按签署状态看一下电子合同数量，用饼图展示" },

  // doughnut 环形图
  { category: "图表", label: "环形图·车源状态", prompt: "统计各状态的正式车源数量，用环形图展示" },

  // rose 玫瑰图
  { category: "图表", label: "玫瑰图·订单状态", prompt: "按订单状态看一下主订单数量分布，用玫瑰图展示" },

  // funnel 漏斗图
  { category: "图表", label: "漏斗图·业务转化", prompt: "对比正式车源数、求购线索数、主订单数，生成漏斗图" },

  // radar 雷达图
  { category: "图表", label: "雷达图·品牌供需", prompt: "按品牌对比正式车源数、求购线索数和成交订单数，看前 8 名，用雷达图展示" },

  // scatter 散点图
  { category: "图表", label: "散点图·城市供需", prompt: "各城市正式车源数和成交订单数，用散点图展示" },

  // bubble 气泡图
  { category: "图表", label: "气泡图·城市供需", prompt: "各城市正式车源数、成交订单数和平均售价，用气泡图展示" },

  // treemap 矩形树图
  { category: "图表", label: "树图·品牌占比", prompt: "按品牌看正式车源数量占比，用矩形树图展示" },

  // sunburst 旭日图
  { category: "图表", label: "旭日图·城市品牌", prompt: "按城市和品牌层级看正式车源数量，用旭日图展示" },

  // sankey 桑基图
  { category: "图表", label: "桑基图·渠道转化", prompt: "客户从哪些渠道进来、最后落在哪些订单状态？用桑基图展示" },

  // radialBar 径向柱图
  { category: "图表", label: "径向柱·门店成交", prompt: "各门店成交订单数排行，看前 10 名，用径向柱图展示" },

  // composed 组合图
  { category: "图表", label: "组合图·成交趋势", prompt: "最近 30 天每天成交单数和成交金额，用组合图展示" },

  // candlestick K线图
  { category: "图表", label: "K线图·成交价格", prompt: "最近 30 天每天成交的最高价、最低价、开盘价和收盘价，用K线图展示" },

  // gauge 仪表盘
  { category: "图表", label: "仪表盘·车源总量", prompt: "大风车正式车源一共有多少辆？用仪表盘展示" },

  // heatmap 热力图
  { category: "图表", label: "热力图·城市品牌", prompt: "按城市和品牌交叉看正式车源数量，看数量最多的组合，用热力图展示" },
];

export const teamTemplateSeedCount = teamTemplateSeed.length;

export function teamTemplateCategorySeed() {
  const names = new Set<string>(["内置", "自定义"]);
  for (const item of teamTemplateSeed) {
    names.add(item.category);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
