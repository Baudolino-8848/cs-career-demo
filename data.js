"use strict";

// 14 维属性：前 6 项是「基础属性」（角色的硬件：机械能力），后 8 项是「表现属性」
// （能否把能力打成成绩）。总评为 14 项按位置权重的加权和；权重不低于 0.10 的标记为核心。
const ATTRS = [
  ["reaction", "反应"],
  ["preaim", "预瞄"],
  ["spray", "压枪"],
  ["positioning", "定位"],
  ["utility", "道具"],
  ["movement", "身法"],
  ["entry", "突破"],
  ["clutch", "残局"],
  ["info", "信息"],
  ["trade", "补枪"],
  ["comms", "沟通"],
  ["composure", "抗压"],
  ["stability", "稳定性"],
  ["focus", "专注"]
];
const ATTR_BASE_KEYS = ATTRS.slice(0, 6).map(([key]) => key);
const ATTR_PERF_KEYS = ATTRS.slice(6).map(([key]) => key);
// 29 岁起的年龄成长：身体类衰退，意识/心态类仍缓慢增长，道具持平。
const ATTR_DECLINE = ["reaction", "preaim", "spray", "movement", "entry", "trade"];
const ATTR_GROWTH_LATE = ["positioning", "info", "comms", "composure", "stability", "focus", "clutch"];
const ROLES = {
  "狙击手": {
    "reaction": 0.12, "preaim": 0.13, "spray": 0.05, "positioning": 0.10, "utility": 0.02, "movement": 0.05,
    "entry": 0.04, "clutch": 0.08, "info": 0.07, "trade": 0.03, "comms": 0.02, "composure": 0.08, "stability": 0.10, "focus": 0.11
  },
  "突破手": {
    "reaction": 0.11, "preaim": 0.10, "spray": 0.09, "positioning": 0.06, "utility": 0.02, "movement": 0.10,
    "entry": 0.14, "clutch": 0.03, "info": 0.04, "trade": 0.08, "comms": 0.03, "composure": 0.07, "stability": 0.06, "focus": 0.07
  },
  "步枪手": {
    "reaction": 0.08, "preaim": 0.11, "spray": 0.10, "positioning": 0.08, "utility": 0.05, "movement": 0.06,
    "entry": 0.09, "clutch": 0.06, "info": 0.06, "trade": 0.09, "comms": 0.04, "composure": 0.06, "stability": 0.06, "focus": 0.06
  },
  "指挥": {
    "reaction": 0.05, "preaim": 0.04, "spray": 0.04, "positioning": 0.06, "utility": 0.10, "movement": 0.03,
    "entry": 0.02, "clutch": 0.07, "info": 0.15, "trade": 0.05, "comms": 0.14, "composure": 0.10, "stability": 0.07, "focus": 0.08
  },
  "辅助": {
    "reaction": 0.05, "preaim": 0.05, "spray": 0.04, "positioning": 0.06, "utility": 0.14, "movement": 0.04,
    "entry": 0.02, "clutch": 0.05, "info": 0.11, "trade": 0.10, "comms": 0.12, "composure": 0.08, "stability": 0.07, "focus": 0.07
  },
  "自由人": {
    "reaction": 0.07, "preaim": 0.09, "spray": 0.06, "positioning": 0.11, "utility": 0.06, "movement": 0.08,
    "entry": 0.05, "clutch": 0.12, "info": 0.09, "trade": 0.05, "comms": 0.04, "composure": 0.07, "stability": 0.06, "focus": 0.05
  }
};
const ATTR_KEYS = ATTRS.map(([key]) => key);
const ATTR_LABEL = Object.fromEntries(ATTRS);
const ROLE_NAMES = Object.keys(ROLES);

// 位置侧重对随机事件成长的影响：某位置越看重某个属性，从事件中获得的该属性成长越多。
// 以十四维平均权重 1/14 为基准归一化，并限制在 0.3～1.3，避免单项成长过猛或完全不长。
// 例如道具：指挥（权重 0.10）拿到的成长高于突破手（权重 0.02）。
function role_attr_factor(role, key) {
    return Math.min(1.3, Math.max(0.3, ROLES[role][key] * ATTRS.length));
}

// 表现属性对基础属性的「下限」约束（单向保底）：表现属性达到某值时，相关基础属性不会低于
// 「表现 − 落差」。例如突破 90 → 反应 ≥ 85、定位 ≥ 82、身法 ≥ 80。反向不成立：基础属性高
// 不会抬高表现属性，因此不会出现「预瞄 99 但突破 20」这类极端。心态类表现属性不与基础挂钩。
const ATTR_FLOORS = {
    entry: [["reaction", 5], ["positioning", 8], ["movement", 10], ["preaim", 8]],
    clutch: [["positioning", 6], ["preaim", 5], ["reaction", 8]],
    info: [["positioning", 4], ["utility", 5]],
    trade: [["preaim", 5], ["spray", 6], ["positioning", 8]],
    comms: [["utility", 6]],
    focus: [["preaim", 8], ["reaction", 8]],
    composure: [],
    stability: []
};

// 角色状态（与稳定性关联）：高到低共 6 档，个人表现按 FORM_MOD 修正；FORM_BASE_DAYS 是各档
// 基础持续天数，稳定性越高，好状态（≥4）越久、差状态（≤2）越短。
const FORM_STATES = ["昏迷", "低迷", "较差", "普通", "火热", "Life Game"];
const FORM_MOD = [-0.15, -0.10, -0.05, 0, 0.05, 0.10];
const FORM_BASE_DAYS = [5, 6, 7, 7, 6, 5];
const FORM_NEUTRAL = 3;   // 「普通」的索引
const FORM_TICK_DAYS = 7; // 每个更新周期（一周或一个比赛阶段）扣掉的天数

// 两个联赛：VRS 联赛是榜单前 50 名，扩展联赛是本地生成的第 51～100 名。前 50 名在人数、
// 潜力、积分和权重上都压过扩展联赛，因此世界前 50 依旧是实力的前 50。
const LEAGUES = [
    {key: "vrs", name: "VRS 联赛", short: "VRS", min_rank: 1, max_rank: 50},
    {key: "extra", name: "扩展联赛", short: "EXT", min_rank: 51, max_rank: 100},
];

// 俱乐部按快照排名固定分档。base 为该档潜力下限，churn 为年度交易概率；同档内按名次线性
// 加 0～4 点潜力，使档内名次靠前的俱乐部拥有更强的人才基准。
// 每个档位对应一段固定的总评区间，BOUNDS 就是这个梯子的踏板。100 支战队按实力排成 8 档，
// 档位索引随实力递增（索引 0 最弱，索引 7 最强）：
//   索引 0～2  扩展联赛三档  基数 48 / 52 / 56（名单第 91～100、71～90、51～70 名）
//   索引 3～7  VRS 联赛五档  基数 64 / 72 / 80 / 87 / 94（名单第 43～50、31～42、17～30、6～16、1～5 名）
// 潜力基数现在用于**补位新人**：退役或转会后补进的新人按队伍当前档位的潜力基数、结合年龄
// 反推生成属性，因此升档的队伍能补到更强的新人。开局的 500 名选手则来自固定数据库
// PLAYER_DB（players.js），其属性是按同一套潜力档位生成并固化下来的，因此两段梯子之间的
// 60 → 64 断层同样体现在开局阵容里，前 50 依旧是实力的前 50，100 支队伍的名次、实力与档位
// 三者单调一致（补位新人的成长会让这条不变式在赛季推进中自然漂移）。
const TIERS = [
    {name: "扩展联赛·丙级", base: 48, churn: 0.60, short: "EXT3"},
    {name: "扩展联赛·乙级", base: 52, churn: 0.60, short: "EXT2"},
    {name: "扩展联赛·甲级", base: 56, churn: 0.60, short: "EXT1"},
    {name: "挑战者", base: 64, churn: 0.60, short: "CH"},
    {name: "二线队", base: 72, churn: 0.40, short: "T2"},
    {name: "一线队", base: 80, churn: 0.22, short: "T1"},
    {name: "世界强队", base: 87, churn: 0.10, short: "WL"},
    {name: "顶级豪门", base: 94, churn: 0.04, short: "ELITE"},
];

// 名次区间与档位的对应表：档位由「本赛季结束时的实时名次」决定，每年重排一次。
// 这是升降级规则：名次进入前 5 就是顶级豪门，掉到 91～100 就是扩展联赛丙级。
const RANK_BANDS = [
    {tier: 7, min_rank: 1, max_rank: 5},
    {tier: 6, min_rank: 6, max_rank: 16},
    {tier: 5, min_rank: 17, max_rank: 30},
    {tier: 4, min_rank: 31, max_rank: 42},
    {tier: 3, min_rank: 43, max_rank: 50},
    {tier: 2, min_rank: 51, max_rank: 70},
    {tier: 1, min_rank: 71, max_rank: 90},
    {tier: 0, min_rank: 91, max_rank: 100},
];

// 名次落在哪个联赛、哪个档位。两个函数都只看名次，因此实时排名一变，联赛和档位立刻跟着变。
function league_of(rank) {
    return rank <= LEAGUES[0].max_rank ? 0 : 1;
}

function vrs_tier(rank) {
    return RANK_BANDS.find(band => band.min_rank <= rank && rank <= band.max_rank).tier;
}

// 联赛键名，用于赛历与转会筛选。
function league_key(rank) {
    return LEAGUES[league_of(rank)].key;
}

// 判定总评属于哪一档：BOUNDS 是十个档位基数按实力升序排成的踏板。tier_of 从高往低找
// 第一个不超过总评的踏板，因此低于最低档时返回 0，高于最高档时返回 9。
const BOUNDS = TIERS.map(tier => tier.base).sort((a, b) => a - b);

// 游戏 Top20 权重按实时名次线性递减：前 50 名从 1.20 降到 0.80，扩展联赛从 0.80 继续降到 0.40。
// 权重只由名次决定，每年重排名次后随之更新；这不是 Valve 或 HLTV 的官方个人排名公式。
const VRS_WEIGHT_COUNT = 50;
function vrs_weight(rank) {
    if (rank <= VRS_WEIGHT_COUNT) return 1.20 - (rank - 1) / (VRS_WEIGHT_COUNT - 1) * 0.40;
    return 0.80 - (rank - VRS_WEIGHT_COUNT) / 50 * 0.40;
}

// 赛季积分（累积制）。每支队伍每赛季从 START_RATING 起算，每打完一场系列赛（整场胜负，非单图）
// 立刻结算一次，不再等到赛事结束按名次发分：
//     赢: +WIN_K × (1 − 期望胜率)          输: −LOSS_K × 期望胜率
// 期望胜率只由「双方的实时排名差」决定——排名差越大（以强胜弱），赢球拿得越少，差距拉满时趋近 0；
// 以弱胜强的爆冷拿得最多。输球方向同理：输给越弱的对手扣得越多，输给强队几乎不扣。
//
// 双方各自独立结算，增减之和不再为零（WIN_K > LOSS_K），因此多打一场、多赢一场都实打实地累积，
// 不会出现「战绩符合预期就原地踏步」。积分只用于赛季末重排名次，随后归零重来。
const START_RATING = 1000;
const WIN_K = 55;          // 赢球基准：同排名取胜拿 WIN_K / 2 = 27.5 分；排名差拉满的爆冷接近 +54
const LOSS_K = 45;         // 输球基准：同排名落败扣 LOSS_K / 2 = 22.5 分；排名差拉满的惨败接近 −44
                           // 两者相差 10：这个差值就是「多打多赢必然累积」的来源。若取相等（严格对称的
                           // ±50）则退回零和，战绩符合预期就会原地踏步，正是这套机制要避免的。
const RANK_SLOPE = 60;     // 排名每差 RANK_SLOPE 名，胜率相差约 10 倍；差 60 名时约 9:1
const STRENGTH_SLOPE = 33; // 实力差到比赛胜负：每差 33 点总评，胜率相差约 10 倍（只决定胜负，不参与积分）
const MIN_RATING = 200;
const MAX_RATING = 3000;
// 赛季末重排名次时旧名次占的权重：0.5 表示新名次与积分排名各占一半。
// 单赛季样本量小，积分带噪，完全按积分重排会让 100 支队伍的档位年年剧烈换血。
const RANK_CARRY = 0.5;

// 实时排名差到期望胜率：rank_self / rank_opp 是双方的当前排名（1 最强、100 最弱）。
// 对手排名比自己靠后（数字更大）时期望高于 0.5，对手更强时低于 0.5。
function rank_expected(rank_self, rank_opp) {
    return 1 / (1 + 10 ** (-(rank_opp - rank_self) / RANK_SLOPE));
}

// 单场系列赛的积分变化：win 为真表示自己取胜。双方各自调用一次（参数互换、胜负取反），合计不为零。
function match_delta(rank_self, rank_opp, win) {
    const expected = rank_expected(rank_self, rank_opp);
    return win ? WIN_K * (1 - expected) : -LOSS_K * expected;
}

// 比赛胜负只由真实实力决定，与积分无关，避免积分自我强化。
function win_chance(a, b) {
    return 1 / (1 + 10 ** ((b - a) / STRENGTH_SLOPE));
}

// 世界时间与退役边界。NPC 按年龄概率退役；玩家另外受最低总评和强制退役年龄限制。
const START_YEAR = 2026;
const MAX_YEARS = 22;
const FORCE_RETIRE_AGE = 32;
const NPC_MAX_AGE = 40;
const MIN_OVERALL = 22;

/* ==========================================================================
 * 时间系统：把「1 月 1 日为周一」的模板年日历平移到真实年份
 * --------------------------------------------------------------------------
 * 《CS 赛事赛制与年度赛历》用模板日序描述全年（第 1 天 = 1 月 1 日 = 周一），
 * 每天的星期几因此完全固定。真实年份只需整体平移：设当年 1 月 1 日为星期 X，
 * 则平移 shift = (7 − X) % 7 天，平移后所有日期的星期几与模板完全一致，
 * 「决赛永远在周日」「B 级周三开赛」这些硬约束在任意年份都成立。
 * 模板最后一场赛事是第 350 天（12 月 16 日），最大平移 6 天也不会越出日历年。
 * ========================================================================== */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const YEAR_DAYS = 365;
// 赛历覆盖模板年第 1～350 天，最后两周到年末为冬歇期，逐日模拟推进到第 350 天为止。
const SEASON_DAYS = 350;

function month_day(day) {
    let rest = day;
    for (let m = 0; m < 12; m++) {
        if (rest <= MONTH_DAYS[m]) return {month: m + 1, day: rest};
        rest -= MONTH_DAYS[m];
    }
    return {month: 12, day: 31};
}

// 某年 1 月 1 日的星期（0 = 周一 … 6 = 周日）。以 START_YEAR（2026-01-01 为周四）为基准
// 逐个日历年推进：平年 365 天（+1 天），闰年 366 天（+2 天），因此必须按真实闰年累积，
// 不能用简单取模。游戏只使用 ≥ START_YEAR 的年份，因此从基准年向后累加即可。
function is_leap_year(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function year_start_weekday(year) {
    let weekday = 3;   // 2026-01-01 是周四
    for (let y = START_YEAR; y < year; y++) weekday += is_leap_year(y) ? 2 : 1;
    return ((weekday % 7) + 7) % 7;
}

// 模板日序 → 真实年份的月日与星期。返回结构供界面渲染「2026年1月14日 (周三)」。
//
// 平移把「模板第 1 天」对齐到当年 1 月 1 日，星期几因此完全一致；月日则用真实日历推算，
// 闰年的 2 月 29 日会被自动算进去（模板年本身是平年，不能直接拿月长表硬套）。
function game_date(year, day) {
    const shift = (7 - year_start_weekday(year)) % 7;
    const real = new Date(Date.UTC(year, 0, 1 + day - 1 + shift));
    return {
        year, day, shift, real_day: day + shift,
        // 日序为负（引用期落在上一年年末）时真实年份会退回上一年，因此单独给一份。
        real_year: real.getUTCFullYear(),
        month: real.getUTCMonth() + 1,
        day_of_month: real.getUTCDate(),
        weekday: (day - 1) % 7,
        weekday_name: WEEKDAY_NAMES[(day - 1) % 7],
    };
}

// 「M月D日」；配合 game_date 的 weekday_name 组成完整日期行。
function date_label(date) {
    return `${date.month}月${date.day_of_month}日`;
}

function date_full(date) {
    return `${date.year}年${date.month}月${date.day_of_month}日 (${date.weekday_name})`;
}

// 「YYYY/M/D」；用于加载动画的紧凑日期。
// 年份取真实日历年份而非传入值：引用期的日序可能为负，那时日期落在上一年年末。
function date_short(date) {
    return `${date.real_year}/${date.month}/${date.day_of_month}`;
}

// 「M/D」；生涯日志的日期列用，不带年份，与设计稿一致。
function date_md(date) {
    return `${date.month}/${date.day_of_month}`;
}

// 第 n 周的周一（模板日序），用于把赛期折算成周次。
function week_monday(week) {
    return 1 + 7 * (week - 1);
}

function week_of(day) {
    return Math.min(52, Math.floor((day - 1) / 7) + 1);
}

// 名次分档：每档 25 队，档位号即签位池编号。赛历的所有名额、分档与地区赛分组都以它为准。
const BAND_SIZE = 25;
const BAND_COUNT = 4;
const MAIN_DRAW_MAX = 44;
const BANDS = Array.from({length: BAND_COUNT}, (_, i) => ({
    band: i, min_rank: i * BAND_SIZE + 1, max_rank: (i + 1) * BAND_SIZE,
}));

function band_of(rank) {
    return Math.min(BAND_COUNT - 1, Math.floor((rank - 1) / BAND_SIZE));
}

function rank_in_band(band, rank) {
    return band_of(rank) === band;
}

// 「引用期」= 开赛日往前 4 周（28 天）所在周的周一。每站的受邀名单、补位与赛事内种子都以
// 那一刻的实时名次为准（见 World.apply_entry_ranks）：引用期一过这一站就定死，之后无论
// 积分怎么升降都不再改变它；而引用期之前打出的成绩，会决定后面站点的名单。
function reference_day(day) {
    return week_monday(week_of(day - 28));
}

// 级别参数：field_offset 是相对本站参赛队伍平均实力的强弱偏移，
// form 为个人 Rating 的主场系数（越高越容易刷出个人数据），worth 为荣誉权重。
// Major 的偏移沿用原档位差，因此顶级赛事依旧最难也最有价值。
const GRADE_CFG = {
  "MAJOR": {field_offset: 16,  form: 1.12, worth: 1.00},
  "S":     {field_offset: 8,   form: 1.06, worth: 0.60},
  "A":     {field_offset: -2,  form: 1.00, worth: 0.30},
  "B":     {field_offset: -15, form: 0.96, worth: 0.10},
  "C":     {field_offset: -32, form: 0.90, worth: 0.02},
  "E":     {field_offset: -22, form: 0.92, worth: 0.02},
};

// 赛制模板：队伍规模、分组/轮次与决赛地图数（八强/半决赛一律 Bo3，逐场由 game.js 模拟）。
// 赛制按级别归为三套，全部收敛到同一个 8 强单败淘汰赛：
//   major    —— Major 与 S 级：32 队按引用期名次分三段，走三阶段阶梯瑞士轮
//               （竞争组 16 → 挑战组 16 → 传奇组 16，每阶段先取 3 胜者晋级、先吞 3 负者淘汰，
//                恰好 8 队出线），最终 8 强单败，决赛 Bo5。rounds 是**每个阶段**的轮数；
//   standard —— A 级与 B 级：32 队 4 组 × 8 队单循环取前二（per_group 2），决赛 Bo5；
//   regional —— 地区赛：30 队 4 轮瑞士轮取 8 强（不设锁线），决赛 Bo3。
const FORMATS = {
    "major":    {teams: 32, rounds: 5, stages: 3, final_bo: 5},
    "standard": {teams: 32, groups: 4, per_group: 2, final_bo: 5},
    "regional": {teams: 30, rounds: 4, final_bo: 3},
};

// 地区赛分档：主赛只覆盖到 1～32 名，因此地区赛兜住 **33～100 名**（68 支队伍），按引用期名次
// 切成四档（每档 17 队），每档全年打 4 站，合计 16 站。这样 33 名以后的每支队伍都至少有 4 站固定赛程。
// 「同一天不撞主赛名单」的约束决定各档能排在哪些日子：
//   第一档 33～49 与 S/Major 预选（29～36）在 33～36 重叠、又与 B 级（1～60）重叠 → 只能排在 A 级日期；
//   第二档 50～66 与 B 级（1～60）在 50～60 重叠 → 必须避开 B 级日期（可排在 S/Major/A 级日期）；
//   第三档 67～83、第四档 84～100 与任何主赛名单都不重叠，可铺在全年任意一站。
// 分档只影响地区赛的参赛名单；主赛名额一律按每站自己的 draw 判定。
const REGIONAL_BANDS = [
    {band: 0, min_rank: 33, max_rank: 49, name: "挑战者档"},
    {band: 1, min_rank: 50, max_rank: 66, name: "甲级档"},
    {band: 2, min_rank: 67, max_rank: 83, name: "乙级档"},
    {band: 3, min_rank: 84, max_rank: 100, name: "丙级档"},
];

// 16 站地区赛的档位排班（按主赛模板顺序 B1,A1,S1,S2,S3,B2,A2,A3,A4,S4,S5,S6,B5,A5,B6,A6）：
// 每档恰好 4 站。第一档只落在 A 级日期（位置 1/7/8/15），第二档落在 S/Major 日期（位置 2/4/9/11），
// 第三、四档铺在其余日期，满足上面的避让约束。
const REGIONAL_ROTA = [2, 0, 1, 3, 1, 3, 2, 0, 0, 1, 2, 1, 2, 3, 3, 0];

// 大众级线下总决赛与年度盛典：玩家不参赛，但时间系统要照常推进，赛历也要显示。
const GRASSROOTS_FINALS = [
    {name: "大众级春季总决赛", grade: "E", start_day: 152, end_day: 154},
    {name: "大众级年终总决赛", grade: "E", start_day: 341, end_day: 343},
];

/* ==========================================================================
 * 年度赛历：全年 18 站 S/A/B 级主赛（零日期冲突）+ 16 站地区赛
 * --------------------------------------------------------------------------
 * 主赛名额全部来自「引用期」名次（该站开赛日前 4 周那一刻的实时排名），因此每站都是强弱混杂的
 * 16～32 队，弱队有爆冷机会；同期地区赛由 33～100 名的球队按档位参加，日期完全一致。
 * 两个赛场在同一天使用互不重叠的名单，满足「同一支队伍同一天不承担两场官方赛事」。
 * ========================================================================== */
const EVENT_TEMPLATES = [
    // —— 春季周期（W2–W13）：B 级 #1 → A 级 #1 → BLAST → IEM → Major 春季赛 —— //
    {key: "B1", name: "CCT 欧洲区", grade: "B", circuit: "main", format: "standard",
     start_day: 10, end_day: 14, draw: [17, 48], qual_draw: null, region: "欧洲区",
     regional: [{name: "CCT 亚太区", region: "亚太区"}]},
    {key: "A1", name: "裂变天地 上海", grade: "A", circuit: "main", format: "standard", flagship: true,
     start_day: 23, end_day: 28, draw: [1, 32], qual_draw: null, region: "中国区",
     regional: [{name: "ESEA Advanced 亚洲区", region: "亚洲区"}]},
    {key: "S1", name: "BLAST Spring", grade: "S", circuit: "main", format: "major",
     start_day: 37, end_day: 49, draw: [1, 28], qual_draw: [29, 36], region: "欧洲区",
     regional: [{name: "CCT 欧洲区", region: "欧洲区"}]},
    {key: "S2", name: "IEM Katowice", grade: "S", circuit: "main", format: "major",
     start_day: 58, end_day: 70, draw: [1, 28], qual_draw: [29, 36], region: "欧洲区",
     regional: [{name: "CCT 南美区", region: "南美区"}]},
    {key: "S3", name: "Major 春季赛", grade: "MAJOR", circuit: "main", format: "major", is_major: true,
     start_day: 77, end_day: 91, draw: [1, 28], qual_draw: [29, 36], region: "欧洲区",
     regional: [{name: "ESEA Advanced 北美区", region: "北美区"}]},
    // —— 春季次级巡回（W14–W23）—— //
    {key: "B2", name: "ESL 挑战者联赛 北美区", grade: "B", circuit: "main", format: "standard",
     start_day: 101, end_day: 105, draw: [17, 48], qual_draw: null, region: "北美区",
     regional: [{name: "NEST 中国区", region: "中国区"}]},
    {key: "A2", name: "ESL 挑战者 墨尔本", grade: "A", circuit: "main", format: "standard",
     start_day: 114, end_day: 119, draw: [1, 32], qual_draw: null, region: "大洋洲区",
     regional: [{name: "ESEA Advanced 欧洲区", region: "欧洲区"}]},
    {key: "B3", name: "Funspark ULTI 亚洲区", grade: "B", circuit: "main", format: "standard",
     start_day: 129, end_day: 133, draw: [17, 48], qual_draw: null, region: "亚洲区"},
    {key: "A3", name: "ESL Pro League 马耳他", grade: "A", circuit: "main", format: "standard", flagship: true,
     start_day: 142, end_day: 147, draw: [1, 32], qual_draw: null, region: "马耳他",
     regional: [{name: "United21 欧洲区", region: "欧洲区"}]},
    // —— 秋季周期（W29–W40）—— //
    {key: "B4", name: "United21 欧洲区", grade: "B", circuit: "main", format: "standard",
     start_day: 199, end_day: 203, draw: [17, 48], qual_draw: null, region: "欧洲区"},
    {key: "A4", name: "PGL 布加勒斯特", grade: "A", circuit: "main", format: "standard",
     start_day: 212, end_day: 217, draw: [1, 32], qual_draw: null, region: "东欧区",
     regional: [{name: "CCT 欧洲区", region: "欧洲区"}]},
    {key: "S4", name: "BLAST Fall", grade: "S", circuit: "main", format: "major",
     start_day: 226, end_day: 238, draw: [1, 28], qual_draw: [29, 36], region: "欧洲区",
     regional: [{name: "ESEA Advanced 南美区", region: "南美区"}]},
    {key: "S5", name: "IEM Fall", grade: "S", circuit: "main", format: "major",
     start_day: 247, end_day: 259, draw: [1, 28], qual_draw: [29, 36], region: "亚洲区",
     regional: [{name: "Elisa Invitational 北欧区", region: "北欧区"}]},
    {key: "S6", name: "Major 秋季赛", grade: "MAJOR", circuit: "main", format: "major", is_major: true,
     start_day: 266, end_day: 280, draw: [1, 28], qual_draw: [29, 36], region: "美洲区",
     regional: [{name: "完美世界城市挑战赛 中国区", region: "中国区"}]},
    // —— 秋季次级巡回（W41–W50）—— //
    {key: "B5", name: "ESEA Advanced 南美区", grade: "B", circuit: "main", format: "standard",
     start_day: 290, end_day: 294, draw: [17, 48], qual_draw: null, region: "南美区",
     regional: [{name: "ESEA Advanced 大洋洲区", region: "大洋洲区"}]},
    {key: "A5", name: "BetBoom Dacha 迪拜", grade: "A", circuit: "main", format: "standard", flagship: true,
     start_day: 303, end_day: 308, draw: [1, 32], qual_draw: null, region: "中东区",
     regional: [{name: "CCT 亚洲区", region: "亚洲区"}]},
    {key: "B6", name: "NEST 中国区", grade: "B", circuit: "main", format: "standard",
     start_day: 318, end_day: 322, draw: [17, 48], qual_draw: null, region: "中国区",
     regional: [{name: "CCT 北美区", region: "北美区"}]},
    {key: "A6", name: "CS 亚洲锦标赛 上海", grade: "A", circuit: "main", format: "standard", flagship: true,
     start_day: 331, end_day: 336, draw: [1, 32], qual_draw: null, region: "中国区",
     regional: [{name: "CCT 南美区", region: "南美区"}]},
];

// 展开成扁平赛历：主赛在前、同期的地区赛紧随其后（日期完全相同，按 start_day 稳定排序）。
// 地区赛按 REGIONAL_ROTA 依次分到四个档位，保证每档全年恰好 4 站。
function build_annual_calendar() {
    const list = [];
    let rota_index = 0;
    for (const item of EVENT_TEMPLATES) {
        const cfg = GRADE_CFG[item.grade];
        const format = FORMATS[item.format];
        list.push({
            key: item.key, name: item.name, grade: item.grade, circuit: "main",
            format: item.format, teams: format.teams, is_major: Boolean(item.is_major),
            flagship: Boolean(item.flagship), region: item.region,
            start_day: item.start_day, end_day: item.end_day,
            draw: item.draw, qual_draw: item.qual_draw,
            // swiss_rounds 是瑞士轮的轮数：阶梯赛制（major）是每阶段轮数，固定轮数赛制（regional）是总轮数。
            groups: format.groups, per_group: format.per_group, swiss_rounds: format.rounds,
            ladder_stages: format.stages,
            field_offset: cfg.field_offset, form: cfg.form, worth: cfg.worth,
            final_bo: format.final_bo,
        });
        for (const regional of item.regional || []) {
            const rcfg = GRADE_CFG[regional.grade || "C"];
            const rformat = FORMATS.regional;
            // 档位由「第几站地区赛」决定，16 站均匀分给四档（每档 4 站）。
            const band = REGIONAL_BANDS[REGIONAL_ROTA[rota_index % REGIONAL_ROTA.length]];
            rota_index += 1;
            list.push({
                key: `${item.key}r${band.band}`, name: regional.name, grade: regional.grade || "C",
                circuit: "regional", format: "regional", teams: rformat.teams,
                is_major: false, flagship: false, region: regional.region,
                start_day: item.start_day, end_day: item.end_day,
                draw: [band.min_rank, band.max_rank], band: band.band, qual_draw: null,
                per_group: rformat.per_group, swiss_rounds: rformat.rounds,
                field_offset: rcfg.field_offset, form: rcfg.form, worth: rcfg.worth,
                final_bo: rformat.final_bo,
            });
        }
    }
    return list.sort((a, b) => a.start_day - b.start_day || a.circuit.localeCompare(b.circuit));
}

const ANNUAL_CALENDAR = build_annual_calendar();
const A_EVENTS = ANNUAL_CALENDAR.filter(event => event.grade === "A" && event.circuit === "main");
// 没有疲劳设定（只有角色状态起伏），因此不限制单赛季的参赛站数。

// 引用期名次落在哪一档；地区赛与主赛的名额都由它决定。
function rank_band(rank) {
    return BANDS[band_of(rank)];
}

// 名额、补位与赛事内种子一律按「当前站点的引用期名次」判定——即该站开赛日前 4 周那一刻的
// 实时排名。entry_rank 由 World 在每站开赛前写入，因此赛季中的积分变化会改变后面站点的名单，
// 而一站锁定之后（引用期已过）就不再变动。没有站点上下文时（赛季初估算赛程）退回赛季初名次。
function rank_of(team) {
    if (team.entry_rank !== undefined) return team.entry_rank;
    return team.ref_rank === undefined ? team.rank : team.ref_rank;
}

// 某队能不能参加某站赛事。名额分两段：
//   直邀 —— 引用期名次落在 draw 区间（Major / S 级 1–28、A 级 1–32、B 级 17–48、地区赛整档）；
//   预选 —— 该站名额没填满时，从 qual_draw 区间补齐。
// 没有疲劳设定，因此不做「一年最多几站」的限制，一路打进所有受邀赛事即可。
function team_invited(team, event) {
    if (!team) return false;
    return event_allows(event, rank_of(team));
}

function event_allows(event, rank) {
    if (rank >= event.draw[0] && rank <= event.draw[1]) return true;
    return Boolean(event.qual_draw) && rank >= event.qual_draw[0] && rank <= event.qual_draw[1];
}

// 某队当年能参加的主赛与地区赛（用于展示赛历）。
function eligible_tournaments(rank) {
    return ANNUAL_CALENDAR.filter(event => event.circuit === "main" && event_allows(event, rank));
}

// 成绩阈值决定球队名次；RESULT_BONUS 调整个人 Rating。
const RESULT_TABLE = [
  [
    0.18,
    "小组出局"
  ],
  [
    0.45,
    "八强"
  ],
  [
    0.7,
    "四强"
  ],
  [
    0.88,
    "亚军"
  ],
  [
    1.01,
    "冠军"
  ]
];
const RESULT_BONUS = {
  "冠军": 0.1,
  "亚军": 0.05,
  "四强": 0.01,
  "八强": -0.03,
  "小组出局": -0.07
};

// 事件属性增益统一缩放，特殊效果（转会 / 转职 / 伤病 / 临场加成）使用各自结算规则。
// 事件每周触发一次，系数取 0.5 使单次主项涨 1~3 点、年累计与年度自然成长同量级；
// 再叠加 role_attr_factor 的位置侧重。系数过小（如 0.1）会让取整后的小区间恒为 0。
const EVENT_SCALE = 0.5;

// 事件结构：cond 检查选手状态和下一站是否为 Major，weight 控制符合条件后的抽中概率。
// options 中 fx 的属性数组为闭区间；role 修改位置，tier 表示档位增量，buff 在下一场赛事消耗。
// 转职事件通过 year - last_role_year 限制三年冷却；同一赛季优先抽取尚未发生的事件。
// 事件总量供 100 支战队的全部现役选手共用，玩家和 NPC 走同一套条件与权重。
//
// 档位条件全部写成「相对本联赛最低档的偏移」：相对偏移 0 是本联赛最低档，1 是第二档，
// 2 是第三档及以上。VRS 联赛最低档是挑战者（档位索引 3），扩展联赛最低档是丙级（索引 0），
// 因此两个联赛各自从 0 起算，用同一套事件条件。
const VRS_BASE_TIER = 3;
const EXTRA_BASE_TIER = 0;

function tier_offset(tier, league) {
    return league === LEAGUES[0].key ? VRS_BASE_TIER : EXTRA_BASE_TIER;
}

// 相对档位：把绝对档位索引换算回「本联赛最低档 = 0、每升一档 +1 ……」。
function tier_rank(p) {
    return p.tier_index - tier_offset(p.tier_index, p.team.league);
}

const EVENTS = [
{
  "id": "rookie_practice",
  "title": "青训营的加练",
  "desc": "熄灯后教练留下你: \"想出头, 就比别人多练两小时。\"",
  "weight": 4,
  "options": [
    {"text": "留下来加练到凌晨", "fx": {"preaim": [2, 4], "spray": [1, 3], "focus": [-1, 0]}, "result": "枪感肉眼可见地涨了, 只是黑眼圈也涨了。"},
    {"text": "跟队友开黑放松一下", "fx": {"composure": [1, 3], "comms": [1, 2], "preaim": [-1, 1]}, "result": "队伍氛围融洽了不少, 手上的活儿生疏了一点。"},
    {"text": "回去早睡, 研究录像", "fx": {"info": [2, 3], "positioning": [1, 2]}, "result": "你对地图的理解又深了一层。"}
  ],
  "cond": (p, m) => tier_rank(p) <= 1
},
{
  "id": "allnight_queue",
  "title": "通宵排位",
  "desc": "凌晨两点, 训练室只剩你和显示器幽幽的光。",
  "weight": 3,
  "options": [
    {"text": "干到天亮", "fx": {"preaim": [1, 3], "reaction": [1, 2], "focus": [-2, -1]}, "result": "操作是练出来了, 人快废了。"},
    {"text": "见好就收", "fx": {"composure": [1, 2], "stability": [1, 2]}, "result": "作息规律, 状态在线。"},
    {"text": "去研究职业选手 demo", "fx": {"info": [1, 3], "utility": [1, 2]}, "result": "偷学了几手职业细节。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "utility_practice",
  "title": "道具专项训练",
  "desc": "教练给你安排了一整套道具投掷练习。",
  "weight": 3,
  "options": [
    {"text": "把每张图的点位刷到烂熟", "fx": {"utility": [3, 5], "info": [1, 2]}, "result": "你的道具已经能封死半个包点。"},
    {"text": "随便练练", "fx": {"utility": [1, 2]}, "result": "聊胜于无。"}
  ],
  "cond": (p, m) => ["辅助", "指挥", "步枪手"].includes(p.role)
},
{
  "id": "aim_train",
  "title": "枪法特训",
  "desc": "你在 aim_botz 里一练就是一下午。",
  "weight": 3,
  "options": [
    {"text": "死磕预瞄与甩狙", "fx": {"preaim": [3, 5], "reaction": [1, 3]}, "result": "准星像是长在了敌人头上。"},
    {"text": "练练身法走位", "fx": {"movement": [2, 4], "preaim": [1, 2]}, "result": "你的走位更加飘忽。"}
  ],
  "cond": (p, m) => ["狙击手", "突破手", "步枪手"].includes(p.role)
},
{
  "id": "preaim_lab",
  "title": "预瞄专项",
  "desc": "教练让你把每一条可能出现的枪线都提前架好。",
  "weight": 3,
  "options": [
    {"text": "死磕常见架点", "fx": {"preaim": [3, 5], "spray": [1, 2]}, "result": "你的准星永远停在敌人该出现的位置。"},
    {"text": "连拉枪一起练", "fx": {"preaim": [2, 3], "reaction": [1, 2]}, "result": "枪线衔接更顺了。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "spray_control",
  "title": "压枪训练",
  "desc": "你在练枪图里一梭一梭地对着墙找弹道。",
  "weight": 3,
  "options": [
    {"text": "把主流枪的弹道刻进肌肉", "fx": {"spray": [3, 5], "preaim": [1, 2]}, "result": "长枪局的中距离对枪稳了很多。"},
    {"text": "顺带练练点射", "fx": {"spray": [1, 3], "preaim": [1, 2]}, "result": "点射与压枪都更扎实。"}
  ],
  "cond": (p, m) => ["突破手", "步枪手", "自由人"].includes(p.role)
},
{
  "id": "transfer",
  "title": "转会邀约",
  "desc": "一支同档或更高一档的战队向你抛出橄榄枝, 但意味着要抛下老队友。",
  "weight": 2,
  "options": [
    {"text": "接受挑战, 往上走", "fx": {"transfer": true}, "result": "你跳上了新的舞台。"},
    {"text": "留守老东家", "fx": {"comms": [2, 3], "stability": [1, 2], "chem": [8, 14]}, "result": "队友们把你当成了主心骨, 队伍更拧成一股绳。"}
  ],
  "cond": (p, m) => 1 <= tier_rank(p) && tier_rank(p) <= 3
},
{
  "id": "role_awp",
  "title": "改打狙击位",
  "desc": "教练看中你的枪法与反应: \"队里缺个能扛狙的, 你试试?\"",
  "weight": 2,
  "options": [
    {"text": "转型狙击手", "fx": {"role": "狙击手", "preaim": [1, 3], "reaction": [1, 3], "utility": [-2, 0]}, "result": "你开始用 AWP 主宰长枪局。"},
    {"text": "还是打自己擅长的", "fx": {"composure": [1, 2]}, "result": "你决定继续深耕本行。"}
  ],
  "cond": (p, m) => (tier_rank(p) >= 1 && p.role !== "狙击手" && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_igl",
  "title": "临危受命当指挥",
  "desc": "老指挥即将退役, 队伍希望你能接过战术板。",
  "weight": 2,
  "options": [
    {"text": "接过指挥权", "fx": {"role": "指挥", "info": [2, 4], "comms": [2, 3]}, "result": "你成了场上的大脑。"},
    {"text": "只想专心打枪", "fx": {"preaim": [1, 3]}, "result": "你婉拒了教练的提议。"}
  ],
  "cond": (p, m) => (tier_rank(p) >= 2 && p.role !== "指挥" && p.age >= 20 && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_support",
  "title": "转型辅助位",
  "desc": "队伍体系需要一名专职道具手, 教练问你愿不愿意牺牲个人数据。",
  "weight": 2,
  "options": [
    {"text": "为团队转型辅助", "fx": {"role": "辅助", "utility": [3, 5], "comms": [1, 2]}, "result": "你甘愿做那个默默闪光的人。"},
    {"text": "不做绿叶", "fx": {"preaim": [1, 3], "composure": [-1, 1]}, "result": "你更相信自己的枪。"}
  ],
  "cond": (p, m) => (tier_rank(p) >= 1 && !["辅助", "指挥"].includes(p.role) && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_lurker",
  "title": "改打自由人",
  "desc": "教练觉得你的意识适合独自潜入, 打乱对手节奏。",
  "weight": 2,
  "options": [
    {"text": "转型自由人", "fx": {"role": "自由人", "info": [2, 4], "movement": [1, 3]}, "result": "你成了对手后排的幽灵。"},
    {"text": "保持现位置", "fx": {"composure": [1, 2]}, "result": "你选择待在舒适区。"}
  ],
  "cond": (p, m) => (tier_rank(p) >= 1 && p.role !== "自由人" && (p.year - p.last_role_year) >= 3)
},
{
  "id": "benched",
  "title": "被下放替补",
  "desc": "近期状态低迷, 教练把你放进了替补席。",
  "weight": 3,
  "options": [
    {"text": "疯狂加练证明自己", "fx": {"preaim": [3, 5], "focus": [-2, 0]}, "result": "你在训练室里把自己练到脱稿。"},
    {"text": "申请转会换个环境", "fx": {"tier": -1}, "result": "你降级去了级别更低的队伍重新开始。"},
    {"text": "找教练谈心", "fx": {"composure": [2, 3], "info": [1, 2]}, "result": "解开了心结, 教练答应再给你机会。"}
  ],
  "cond": (p, m) => tier_rank(p) >= 2
},
{
  "id": "sponsor",
  "title": "赞助代言",
  "desc": "外设品牌找上门, 代言费很香, 但要占用大量训练时间拍广告。",
  "weight": 3,
  "options": [
    {"text": "全部接下, 赚一波", "fx": {"preaim": [-2, 1]}, "result": "银行卡鼓了, 手感凉了。"},
    {"text": "只接一个象征性代言", "fx": {"comms": [1, 2]}, "result": "名利与训练兼顾。"},
    {"text": "拒掉, 专心训练", "fx": {"preaim": [1, 3], "utility": [1, 2]}, "result": "你把时间都砸在了训练上。"}
  ],
  "cond": (p, m) => p.overall() >= 62
},
{
  "id": "injury",
  "title": "腱鞘炎发作",
  "desc": "手腕传来阵阵刺痛, 队医建议你立刻减量。",
  "weight": 3,
  "options": [
    {"text": "立刻休养", "fx": {"injured": true, "composure": [1, 3]}, "result": "你选择养伤, 但整个赛季的手感打了折扣。"},
    {"text": "打封闭硬撑比赛", "fx": {"preaim": [-5, -3], "injured": true}, "result": "你带伤上阵赢得掌声, 手腕却落下了病根。"},
    {"text": "找队医做理疗", "fx": {"preaim": [-1, 1]}, "result": "及时处理, 影响不大。"}
  ],
  "cond": (p, m) => p.age >= 19
},
{
  "id": "stream",
  "title": "直播副业",
  "desc": "直播平台邀你签约, 打赏可比工资高多了。",
  "weight": 3,
  "options": [
    {"text": "认真经营直播", "fx": {"preaim": [-2, 1]}, "result": "你成了小有名气的主播。"},
    {"text": "偶尔播播", "fx": {"composure": [1, 2]}, "result": "涨了点粉, 主业没耽误。"},
    {"text": "不播, 保住训练", "fx": {"info": [1, 3]}, "result": "你把精力留给了赛场。"}
  ],
  "cond": (p, m) => p.overall() >= 50
},
{
  "id": "cheater",
  "title": "天梯遇外挂",
  "desc": "对面明显开了挂, 队友已经在对喷。",
  "weight": 2,
  "options": [
    {"text": "冷静举报", "fx": {"composure": [1, 3]}, "result": "你保持了好心态。"},
    {"text": "对喷回去", "fx": {"composure": [-3, -1]}, "result": "气是出了, 心态也崩了。"},
    {"text": "无视他, 继续练枪", "fx": {"preaim": [2, 4]}, "result": "你把注意力放回了自己的枪法。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "prematch",
  "title": "大赛前夜",
  "desc": "明天就是关键比赛, 今晚怎么过?",
  "weight": 2,
  "options": [
    {"text": "早睡养神", "fx": {"composure": [2, 4], "stability": [1, 2]}, "result": "以最佳状态迎接比赛。"},
    {"text": "通宵 rank 找手感", "fx": {"preaim": [1, 3], "focus": [-2, -1]}, "result": "手感热得发烫, 眼皮也烫。"},
    {"text": "开小会研究对手", "fx": {"info": [2, 4]}, "result": "对手的套路被你们摸透了。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "patch",
  "title": "版本大更新",
  "desc": "新版本削弱了你最擅长的枪械, 一切得从头适应。",
  "weight": 2,
  "options": [
    {"text": "连夜适应新枪", "fx": {"preaim": [2, 4], "spray": [1, 3], "focus": [-1, 1]}, "result": "你比别人更快吃透了新版本。"},
    {"text": "等职业队先摸清套路", "fx": {"info": [1, 2]}, "result": "你稳扎稳打, 后发制人。"},
    {"text": "抱怨版本太烂", "fx": {"composure": [-2, 0]}, "result": "抱怨解决不了任何问题。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "veteran",
  "title": "老将带教",
  "desc": "队里的老将愿意带你复盘, 但他脾气不太好。",
  "weight": 3,
  "options": [
    {"text": "虚心请教", "fx": {"info": [2, 3], "positioning": [1, 2]}, "result": "你从老将身上学到了很多。"},
    {"text": "我行我素", "fx": {"preaim": [1, 3], "composure": [-1, 1]}, "result": "你坚持自己的打法。"}
  ],
  "cond": (p, m) => p.age <= 20
},
{
  "id": "fanmeet",
  "title": "粉丝线下见面会",
  "desc": "俱乐部安排了一场粉丝见面会, 现场人山人海。",
  "weight": 2,
  "options": [
    {"text": "全程参与互动", "fx": {"composure": [-1, 2]}, "result": "粉丝数量暴涨。"},
    {"text": "露个面就走", "fx": {"preaim": [1, 2]}, "result": "露脸打卡, 回去接着练。"}
  ],
  "cond": (p, m) => p.overall() >= 75
},
{
  "id": "roster_shuffle",
  "title": "战队重组",
  "desc": "俱乐部大换血, 队友走了一半, 你的位置也变得微妙。",
  "weight": 2,
  "options": [
    {"text": "留守, 跟新阵容磨合", "fx": {"comms": [2, 3], "stability": [1, 2]}, "result": "你成了队伍里的定海神针。"},
    {"text": "借机跳槽去强队", "fx": {"tier": 1, "composure": [-2, 0]}, "result": "你跳上了更高的台阶。"}
  ],
  "cond": (p, m) => tier_rank(p) >= 2
},
{
  "id": "relationship",
  "title": "感情生活",
  "desc": "一位粉丝的真诚打动了你, 但恋爱意味着分心。",
  "weight": 2,
  "options": [
    {"text": "开始一段感情", "fx": {"composure": [2, 4], "stability": [1, 3], "preaim": [-1, 2]}, "result": "心态更稳了, 训练时间少了一点。"},
    {"text": "专注事业, 保持单身", "fx": {"preaim": [1, 3], "focus": [1, 2]}, "result": "你把全部精力都给了 CS。"}
  ],
  "cond": (p, m) => p.age >= 18
},
{
  "id": "major_final_eve",
  "title": "Major 决赛前夜",
  "desc": "明天就是 Major 决赛, 全世界都在看着你。",
  "weight": 6,
  "options": [
    {"text": "冥想调整心态", "fx": {"composure": [3, 5], "focus": [2, 4], "stability": [1, 3]}, "result": "你的心跳慢了下来, 眼神无比平静。"},
    {"text": "加练到深夜", "fx": {"preaim": [2, 4], "focus": [-2, 0]}, "result": "手感火热, 但身体很疲惫。"},
    {"text": "跟家人通个电话", "fx": {"composure": [2, 4], "stability": [1, 3]}, "result": "你找回了打 CS 的初心。"}
  ],
  "cond": (p, m) => (m && tier_rank(p) >= 2)
},
{
  "id": "major_stage",
  "title": "Major 决赛舞台",
  "desc": "站上 Major 决赛的舞台, 聚光灯刺眼, 观众席山呼海啸。",
  "weight": 6,
  "options": [
    {"text": "放手一搏, 火力全开", "fx": {"buff": 0.1, "preaim": [1, 3], "composure": [-2, 1]}, "result": "你在总决赛上彻底放开了。"},
    {"text": "稳扎稳打, 打体系", "fx": {"buff": 0.05, "info": [1, 2], "stability": [1, 2]}, "result": "你选择相信团队的战术。"},
    {"text": "把舞台交给队友", "fx": {"buff": 0.07, "comms": [1, 3]}, "result": "你成了队友身后最可靠的后盾。"}
  ],
  "cond": (p, m) => (m && tier_rank(p) >= 2)
},
{
  "id": "aim_bootcamp",
  "title": "瞄准特训营",
  "desc": "俱乐部给你报了为期数天的瞄准特训营, 教练盯着你打满每一发子弹。",
  "weight": 4,
  "options": [
    {"text": "全程高强度跟练", "fx": {"preaim": [3, 5], "spray": [2, 4], "focus": [-2, 0]}, "result": "枪感明显变扎实, 人也累瘫了。"},
    {"text": "挑重点练", "fx": {"preaim": [2, 3], "reaction": [1, 2]}, "result": "针对性地补上了短板。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "vod_review",
  "title": "录像复盘",
  "desc": "教练拉你一起逐帧复看上赛季的关键比赛。",
  "weight": 4,
  "options": [
    {"text": "把每个失误都拆开看", "fx": {"info": [2, 4], "positioning": [1, 2]}, "result": "你对局势的判断更清楚了。"},
    {"text": "只研究对手习惯", "fx": {"info": [1, 3], "utility": [1, 2], "trade": [1, 2]}, "result": "你摸清了对手的套路。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "gym_day",
  "title": "体能训练日",
  "desc": "体能师把你按在健身房里: \"手腕和腰才是你吃饭的本钱。\"",
  "weight": 3,
  "options": [
    {"text": "加练核心与灵敏", "fx": {"movement": [2, 4], "reaction": [1, 3]}, "result": "身法和反应都更利落了。"},
    {"text": "只做恢复拉伸", "fx": {"movement": [1, 2], "stability": [1, 2]}, "result": "身体状态稳住了。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "mental_coach",
  "title": "心理教练",
  "desc": "俱乐部新请了心理教练, 想帮你扛住大赛压力。",
  "weight": 3,
  "options": [
    {"text": "认真做心态训练", "fx": {"composure": [3, 5], "stability": [1, 2]}, "result": "心态肉眼可见地稳了。"},
    {"text": "顺便请教大局观", "fx": {"composure": [1, 3], "info": [1, 3]}, "result": "心态和阅读比赛的能力一起涨了。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "nade_lab",
  "title": "道具实验室",
  "desc": "你在创意工坊里一遍遍校准每一颗闪光与烟雾。",
  "weight": 3,
  "options": [
    {"text": "把点位刷到肌肉记忆", "fx": {"utility": [3, 5], "info": [1, 2]}, "result": "你的道具成了队伍的战术基石。"},
    {"text": "琢磨几套即兴组合", "fx": {"utility": [1, 3], "positioning": [1, 2]}, "result": "你多了一手临场变招。"}
  ],
  "cond": (p, m) => ["辅助", "指挥", "步枪手", "自由人"].includes(p.role)
},
{
  "id": "reaction_drill",
  "title": "反应速度训练",
  "desc": "训练软件里一个又一个靶子闪过, 挑战你的极限反应。",
  "weight": 3,
  "options": [
    {"text": "死磕到破个人纪录", "fx": {"reaction": [3, 5], "preaim": [1, 2]}, "result": "开镜速度又快了一截。"},
    {"text": "练到够用就收", "fx": {"reaction": [1, 3]}, "result": "反应更稳定了。"}
  ],
  "cond": (p, m) => ["狙击手", "突破手", "步枪手"].includes(p.role)
},
{
  "id": "map_run",
  "title": "地图跑图",
  "desc": "你决定用脚步重新丈量每一张比赛地图。",
  "weight": 3,
  "options": [
    {"text": "把路线与出生点位走熟", "fx": {"info": [2, 4], "movement": [1, 3], "positioning": [1, 2]}, "result": "你对地图的理解又精进了。"},
    {"text": "只记关键卡点", "fx": {"info": [1, 3], "utility": [1, 2]}, "result": "关键位置心里有数了。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "entry_drill",
  "title": "突破训练",
  "desc": "你一遍遍演练进场的第一枪该怎么打。",
  "weight": 3,
  "options": [
    {"text": "打磨进场时机", "fx": {"entry": [3, 5], "movement": [1, 3]}, "result": "你的进场越来越能撕开防线。"},
    {"text": "连闪身与预瞄一起练", "fx": {"entry": [1, 3], "preaim": [1, 2]}, "result": "进场前的处理更干净了。"}
  ],
  "cond": (p, m) => ["突破手", "步枪手", "自由人"].includes(p.role)
},
{
  "id": "trade_drill",
  "title": "补枪配合",
  "desc": "你和队友反复练习一人倒下、另一人立刻补上的节奏。",
  "weight": 3,
  "options": [
    {"text": "和队友练同步补枪", "fx": {"trade": [3, 5], "comms": [1, 2]}, "result": "你俩的补枪像一个人。"},
    {"text": "先磨自己的枪", "fx": {"preaim": [1, 3], "trade": [1, 2]}, "result": "补枪的前提是自己够准。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "clutch_drill",
  "title": "残局特训",
  "desc": "教练把把给你摆 1vX 的残局, 逼你学会一个人收下回合。",
  "weight": 3,
  "options": [
    {"text": "反复演练 1vX", "fx": {"clutch": [3, 5], "positioning": [1, 2], "composure": [1, 2]}, "result": "你越来越擅长把残局拖成自己的节奏。"},
    {"text": "研究主流残局套路", "fx": {"clutch": [1, 3], "info": [1, 2]}, "result": "你多了几套收残局的思路。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "comms_drill",
  "title": "团队沟通",
  "desc": "队伍拉着你专门练报点与临场沟通。",
  "weight": 3,
  "options": [
    {"text": "带队复盘沟通", "fx": {"comms": [3, 5], "info": [1, 2]}, "result": "你们的交流越来越高效。"},
    {"text": "多打路人局磨合", "fx": {"comms": [1, 3], "composure": [1, 2]}, "result": "对着陌生人也能把话说清楚。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "focus_training",
  "title": "专注力训练",
  "desc": "心理教练教你如何在长局里维持注意力不涣散。",
  "weight": 3,
  "options": [
    {"text": "练长局专注", "fx": {"focus": [3, 5], "stability": [1, 2]}, "result": "你打满三图也不会掉状态。"},
    {"text": "练赛后放松", "fx": {"focus": [1, 3], "composure": [1, 2]}, "result": "你会更快从失误里抽离。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "team_bonding",
  "title": "团建出游",
  "desc": "俱乐部批了一天假, 队长问全队想怎么过。",
  "weight": 3,
  "options": [
    {"text": "拉全队去郊外露营", "fx": {"chem": [10, 16], "focus": [-1, 0]}, "result": "没有训练的一天, 反倒让五个人真正熟了起来。"},
    {"text": "训练室点外卖聚餐", "fx": {"chem": [4, 7]}, "result": "吃得开心, 聊得也开心。"},
    {"text": "算了, 各自休息", "fx": {"chem": [-3, 0]}, "result": "假期各过各的, 队伍还是那支队伍。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "tactics_review",
  "title": "战术复盘会",
  "desc": "教练把最近几场录像剪了出来, 要求全队一起过一遍。",
  "weight": 3,
  "options": [
    {"text": "逐回合抠细节", "fx": {"chem": [7, 11], "info": [1, 2]}, "result": "五个人的想法第一次完全对上了。"},
    {"text": "只过关键局", "fx": {"chem": [3, 5]}, "result": "效率很高, 共识多了一点。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "locker_conflict",
  "title": "更衣室矛盾",
  "desc": "两名队友因为一次失误在休息室里吵了起来, 气氛降到冰点。",
  "weight": 3,
  "options": [
    {"text": "站出来当和事佬", "fx": {"chem": [10, 18], "focus": [-1, 0]}, "result": "你把话说开了, 队伍反而比之前更拧成一股绳。"},
    {"text": "选边站队", "fx": {"chem": [-14, -7], "composure": [1, 2]}, "result": "你站了队, 更衣室从此分成两派。"},
    {"text": "不掺和, 埋头训练", "fx": {"chem": [-6, -2], "preaim": [1, 2]}, "result": "队里的裂缝没人去补。"}
  ],
  "cond": (p, m) => true
},
{
  "id": "new_signing",
  "title": "新援到队",
  "desc": "俱乐部签下了一名新人, 位置和你有些重叠。",
  "weight": 2,
  "options": [
    {"text": "主动带他熟悉体系", "fx": {"chem": [8, 14], "comms": [1, 2], "focus": [-1, 0]}, "result": "新人很快跟上了节奏, 全队磨合加速。"},
    {"text": "保持距离, 各练各的", "fx": {"chem": [-6, -3], "preaim": [1, 3]}, "result": "你把心思全放在自己的枪上。"}
  ],
  "cond": (p, m) => true
}
];
