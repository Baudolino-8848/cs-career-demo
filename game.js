"use strict";

// io.choose 可能的返回值：玩家在等待点点了「退役」按钮（不是选项索引）。
// 渲染层与计算层共用这一个常量（浏览器里多个 script 共享全局词法环境）。
const RETIRE = "__retire__";

// 半整数向最近的偶数取整，避免 0.5 倍事件增益长期偏向增加或减少。
function round(value) {
    const lower = Math.floor(value);
    if (value - lower === 0.5) return lower % 2 === 0 ? lower : lower + 1;
    return Math.round(value);
}

function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}

// 随机工具共用同一个 32 位状态。固定种子和相同选择能复现世界生成及整个生涯。
// 正态抽样缓存第二个样本；洗牌和无放回抽样用于合同邀约、交易及教练交换。
class Random {
    constructor(seed) {
        this.state = seed >>> 0;
        this.gauss_next = null;
    }

    random() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let value = this.state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    randint(low, high) {
        return low + Math.floor(this.random() * (high - low + 1));
    }

    choice(values) {
        return values[this.randint(0, values.length - 1)];
    }

    uniform(low, high) {
        return low + (high - low) * this.random();
    }

    // Box–Muller 变换从均匀分布生成两个标准正态样本，再按均值和标准差缩放。
    gauss(mean, deviation) {
        let z = this.gauss_next;
        this.gauss_next = null;
        if (z === null) {
            const angle = this.random() * 2 * Math.PI;
            const radius = Math.sqrt(-2 * Math.log(1 - this.random()));
            z = Math.cos(angle) * radius;
            this.gauss_next = Math.sin(angle) * radius;
        }
        return mean + z * deviation;
    }

    shuffle(values) {
        for (let i = values.length - 1; i > 0; i--) {
            const j = this.randint(0, i);
            [values[i], values[j]] = [values[j], values[i]];
        }
    }

    sample(values, count) {
        const pool = values.slice();
        const chosen = [];
        for (let i = 0; i < count; i++) {
            const index = this.randint(0, pool.length - 1);
            chosen.push(pool[index]);
            pool[index] = pool[pool.length - 1];
            pool.pop();
        }
        return chosen;
    }
}

// 总评按当前职业位置加权；转职不改属性，但会立即改变总评和身价。
// 结果缓存在 p._overall：属性、位置或年龄一变就置空（见 invalidate 的调用点）。
function overall_of(p) {
    if (p._overall !== undefined && p._overall !== null) return p._overall;
    // 补偿求和保留十四项浮点乘积的低位误差，防止总分接近 x.5 时因累加误差改变取整。
    let total = 0, correction = 0;
    for (const key of ATTR_KEYS) {
        const value = ROLES[p.role][key] * p[key];
        const next = total + value;
        correction += Math.abs(total) >= Math.abs(value) ? (total - next) + value : (value - next) + total;
        total = next;
    }
    p._overall = round(total + correction);
    return p._overall;
}

// 属性、位置或年龄发生变化后调用：清掉这条链上的缓存（选手总评与球队平均实力）。
function invalidate(p) {
    p._overall = null;
    if (p.team) p.team.dirty = true;
}

// 表现属性对基础属性的单向保底：表现属性越高，关联的基础属性不会低于「表现 − 落差」。
// 只会抬升基础属性，反向不成立，因此不会出现「预瞄 99 但突破 20」这类极端。
function apply_attribute_floors(p) {
    for (const perf of ATTR_PERF_KEYS) {
        const links = ATTR_FLOORS[perf];
        if (!links || !links.length) continue;
        for (const [base, gap] of links) {
            const floor = p[perf] - gap;
            if (p[base] < floor) p[base] = clamp(floor, 1, 99);
        }
    }
}

function tier_of(overall) {
    for (let i = BOUNDS.length - 1; i >= 0; i--) {
        if (overall >= BOUNDS[i]) return i;
    }
    return 0;
}

// 用累计成长的期望反推年轻 NPC 当前属性，使同档位年轻选手仍保留相近的巅峰潜力。
function age_offset(age) {
    let total = 0;
    for (let a = age; a < 27; a++) total += a <= 21 ? 4.5 : a <= 26 ? 2.5 : 1;
    return -total;
}

// 年末先增长年龄，再按此概率处理 NPC 退役；40 岁必退，教练不参与退役。
function npc_retire_chance(age) {
    if (age < 29) return 0;
    if (age <= 31) return 0.08;
    if (age <= 33) return 0.18;
    if (age <= 35) return 0.32;
    if (age <= 37) return 0.50;
    if (age <= 39) return 0.72;
    return 1;
}

// 玩家和 NPC 共用选手模型与年龄曲线。yr_* 每年清空，history/honors/rating_all 跨年累计。
// team 指向队伍对象，队伍 roster 同时持有选手引用；转会必须同步更新两侧关系。
class Player {
    constructor(id, role, age, attrs, team, rng, is_human = false, retire_age = null, base_value = null) {
        this.id = id;
        this.role = role;
        this.age = age;
        this.team = team;
        this.is_human = is_human;
        for (const key of ATTR_KEYS) this[key] = attrs[key];
        this.retired = false;
        this._overall = undefined;
        // 展示参考值，不参与实际退役判定。从固定数据库装载时给确定值（开局不消耗随机数）。
        this.retire_age = retire_age !== null ? retire_age : 30 + rng.randint(0, 4);
        // 数据库人设身价（万）与装载时的参考点；base_value 为 null 表示无档案（补位新人），
        // 身价退回按总评计算。base_overall / base_age 在装载后由 load_profile 记录。
        this.base_value = base_value;
        this.base_overall = null;
        this.base_age = age;
        this.peak = 0;

        // 年度累计：赛季开始清空，赛事名次和个人表现用于年末 Top20。
        this.yr_ratings = [];
        this.yr_rating_weights = [];
        this.yr_honors = [];
        this.yr_honor_weights = [];
        this.yr_titles = 0;
        // 本站赛事 MVP（全场 Rating 最高）按年累计，年末并入生涯荣誉室。
        this.yr_mvps = [];
        this.last_role_year = -3;
        this.buff = 0;
        this.injured = false;

        // 角色状态：只有玩家追踪（NPC 为 undefined）。开局为「普通」，与稳定性关联、定期刷新。
        this.form = is_human ? FORM_NEUTRAL : undefined;
        this.form_days = is_human ? FORM_BASE_DAYS[FORM_NEUTRAL] : 0;

        // 本站/本年赛事统计：ev_stats 以赛事 key 为索引，记录该站的地图数、击杀、助攻、
        // ADR 与 KAST 等统计，供赛后「赛事总结」与年度击杀榜读取；每年清空。
        this.ev_stats = {};
        // 本年已打完站点的完整报告（event_summary_payload），以赛事 key 为索引。右栏赛程滑块上
        // 「查看赛事报告」要把当年打过的站重新打开，因此这份数据要留到年末；每年清空。
        this.yr_reports = {};

        // 生涯累计：年度荣誉、赛事 MVP、排名次数和 Rating 历史供结局与身价计算读取。
        this.honors = [];
        this.mvps = [];
        this.history = [];
        this.kills_all = 0;
        this.deaths_all = 0;
        this.maps_all = 0;
        this.top20_count = 0;
        this.top1_count = 0;
        this.rating_all = [];
        this.yr_avgs = [];

        // 合同剩余年限在年末扣减；contract_len 仅记录开局签约长度。
        this.contract_left = 0;
        this.contract_len = 0;
    }

    overall() {
        return overall_of(this);
    }

    // 档位不单独缓存，一律从所属球队读取。赛季末的升降级与转会都会改球队档位，
    // 缓存过的副本很容易忘记刷新（这正是之前 tier_index 与球队脱节的原因）。
    get tier_index() {
        return this.team.tier;
    }

    // 身价：数据库选手以人设身价（base_value，万）为基准，随总评相对装载时增长/衰退（2.3 次幂），
    // 装载后年龄每增一岁按 26 岁起的规则折价；最近三年 Rating 和荣誉提供小幅修正。补位新人没有
    // 人设值，退回按总评与年龄计算。最终限制为 1～500 万。
    value() {
        const recent = this.yr_avgs.slice(-3);
        const perf = recent.length ? (recent.reduce((sum, r) => sum + r, 0) / recent.length - 1) * 35 : 0;
        const honor = Math.min(this.honors.length * 0.6, 10);
        if (this.base_value === null) {
            const base = (Math.max(this.overall() - 30, 0) / 62) ** 2.3 * 470;
            let age_factor = this.age <= 26 ? 1 : Math.max(0.30, 1 - (this.age - 26) * 0.15);
            if (this.age <= 19) age_factor *= 0.85;
            return Math.trunc(clamp((base + perf + honor) * age_factor, 1, 500));
        }
        const growth = (this.overall() / this.base_overall) ** 2.3;
        const extra_age = Math.max(0, this.age - Math.max(this.base_age, 26));
        const age_factor = Math.max(0.30, 1 - extra_age * 0.15);
        return Math.trunc(clamp(this.base_value * growth * age_factor + perf + honor, 1, 500));
    }

    reset_year() {
        this.yr_ratings = [];
        this.yr_rating_weights = [];
        this.yr_honors = [];
        this.yr_honor_weights = [];
        this.yr_titles = 0;
        this.yr_mvps = [];
        this.ev_stats = {};
        this.yr_reports = {};
    }

    // 单人一站的统计快照；赛事总结与年度奖项读它，缺站时返回空对象。
    event_stats(event) {
        return this.ev_stats[event.key] || null;
    }

    // 生涯平均 Rating：只统计有出场记录的赛季。
    career_rating() {
        return this.rating_all.length ? this.rating_all.reduce((sum, r) => sum + r, 0) / this.rating_all.length : 0;
    }
}

// 队伍强度为五名选手总评的均值，决定团队成绩；个人 Rating 仍按各自实力计算。
// league 与 tier 都由实时名次推出（VRS 联赛 = 前 50 名），转会、邀约和世界 Top20 按联赛筛选。
class Team {
    constructor(source) {
        this.name = source.name;
        // 名次：初始为快照名次，之后每个赛季结束时按赛季积分重排。对外展示、分档、联赛、
        // Top20 权重与潜力基数都与它挂钩，赛季中途冻结不变。名额不读它——名额读逐站的引用期名次。
        this.rank = source.rank;
        // 实时排名：按当前赛季积分排出的位次，每场结算后由 World 重排。积分结算读的就是它，
        // 与赛季内冻结的 rank 是两回事。
        this.live_rank = source.rank;
        // 引用期名次：本站名额所依据的名次（开赛日前 4 周那一刻的实时排名），每站开赛前由
        // World 刷新。名额筛选、补位与赛事内种子都读它，见 rank_of()。
        this.entry_rank = source.rank;
        this.world = null;
        this.rating = START_RATING;
        this.rating_before = START_RATING;
        this.matches = 0;
        this.wins = 0;
        this.losses = 0;
        this.apply_rank();
        this.coach = source.name + " 教练";
        this.roster = [];
        this.tour_wins = 0;
        this.tour_losses = 0;
        // 磨合度：0～300，100 是「刚组建」的中性基准，只对玩家所在队伍累积（见 chem_multiplier）。
        // 跨赛季保留，只有人员进出与教练更换会把它打下来。
        this.chemistry = CHEM_START;
        this._strength = undefined;
        this.dirty = true;
    }

    // 按当前名次刷新档位、联赛、Top20 权重与潜力基数。名次一变（首次载入或赛季末重排）
    // 就要调用一次，保证档位、联赛、权重三者不会与名次脱节。
    // 档内按名次线性加 0～4 点潜力；分母用档内名次数加一，相邻两档交界处不会出现并列值。
    apply_rank() {
        this.tier = vrs_tier(this.rank);
        this.league = league_key(this.rank);
        this.top20_weight = vrs_weight(this.rank);
        const tier = TIERS[this.tier];
        const band = RANK_BANDS.find(item => item.tier === this.tier);
        const span = band.max_rank - band.min_rank;
        this.potential_base = tier.base + 4 * (band.max_rank - this.rank + 1) / (span + 1);
    }

    // 新赛季积分清零，回到统一起跑线；实时排名与引用期名次都重置为上一季末的名次。
    // 赛季刚开打时还没有任何本赛季快照，因此各站的引用期都会回溯到这个起点。
    reset_season() {
        this.rating = START_RATING;
        this.rating_before = START_RATING;
        this.matches = 0;
        this.wins = 0;
        this.losses = 0;
        this.ref_rank = this.rank;
        this.live_rank = this.rank;
        this.entry_rank = this.rank;
    }

    // 记一场系列赛的结果并按双方的实时排名结算积分。双方各自独立结算，合计不再为零：
    // 以强胜弱拿得极少（排名差拉满时趋近 0），以弱胜强拿得最多；输球方向同理，
    // 输给越弱的对手扣得越多，输给强队几乎不扣。积分各自截断在 [MIN_RATING, MAX_RATING]。
    // world 是正常模拟路径下的回指；手工构造的单队（测试用）没有 world，退回冻结的赛季初名次。
    play_match(opponent, win) {
        const world = this.world;
        const rank_self = world ? world.live_rank_of(this) : this.rank;
        const rank_opp = world ? world.live_rank_of(opponent) : opponent.rank;
        this.rating = clamp(this.rating + match_delta(rank_self, rank_opp, win), MIN_RATING, MAX_RATING);
        opponent.rating = clamp(opponent.rating + match_delta(rank_opp, rank_self, !win), MIN_RATING, MAX_RATING);
        this.matches += 1;
        opponent.matches += 1;
        if (world) world.invalidate_live_ranks();
        if (win) {
            this.wins += 1;
            opponent.losses += 1;
        } else {
            this.losses += 1;
            opponent.wins += 1;
        }
    }

    // 展示用的整数积分。
    get shown_rating() {
        return Math.round(this.rating);
    }

    // 队伍强度 = 五名选手总评的均值，是每场比赛都要读的热数据，因此在球队上缓存一份。
    // 阵容或选手属性变化时把 dirty 置为真，下一次读取重算。
    strength() {
        if (!this.dirty && this._strength !== undefined) return this._strength;
        this._strength = this.roster.length ? this.roster.reduce((sum, p) => sum + p.overall(), 0) / this.roster.length : 40;
        this.dirty = false;
        return this._strength;
    }
}

// 世界维护 100 支战队和 500 个现役席位，分属 VRS 联赛（前 50 名）与扩展联赛（51～100 名）。
// 开局阵容从固定数据库 PLAYER_DB 装载，属性不再随机；后续的成长、退役补位与交易仍在此模拟，
// 交易只在同一联赛内部进行。赛季积分与实时名次也由这里维护：开季全部归零到 1000，赛季末按
// 积分重排名次与档位。
class World {
    constructor(rng) {
        this.rng = rng;
        this.teams = [];
        this.players = [];
        this.reserve_ids = [];
        for (const source of VRS_TEAMS) {
            const team = new Team(source);
            team.world = this;
            this.teams.push(team);
            const profiles = PLAYER_DB[team.name];
            if (!profiles || profiles.length !== source.roster.length) {
                throw new Error(`选手数据库缺少 ${team.name} 的完整名单`);
            }
            for (const [i, id] of source.roster.entries()) {
                if (profiles[i].id !== id) {
                    throw new Error(`${team.name} 第 ${i + 1} 位：数据库为 ${profiles[i].id}，名单为 ${id}`);
                }
                this.load_profile(team, profiles[i]);
            }
        }
        this.season = 0;
        this._rank_stale = true;
        this.season_open_order = this.teams.slice().sort((a, b) => a.rank - b.rank);
        this.rank_log = [];
    }

    // 从固定数据库装载一名开局选手：位置、年龄与十四维属性全部来自 PLAYER_DB，不消耗随机数，
    // 因此每次开局的初始世界完全一致。年龄与属性由 data.js 的成长曲线在后续赛季继续演变。
    load_profile(team, profile) {
        // retire_age 是展示参考值，不参与退役判定；装载时给确定值以保持开局零随机。
        const player = new Player(profile.id, profile.role, profile.age, profile.attrs, team, this.rng, false, 32, profile.value ?? null);
        apply_attribute_floors(player);
        // 属性保底会抬高部分基础属性，总评要在保底之后记录，作为身价随总评成长的参考点。
        if (player.base_value !== null) player.base_overall = player.overall();
        team.roster.push(player);
        this.players.push(player);
        return player;
    }

    // 新赛季积分清零到 1000，实时排名重置为上一季末的名次；档位与权重保持不变。
    reset_season() {
        for (const team of this.teams) team.reset_season();
        this.invalidate_live_ranks();
        // 引用期回溯的起点：赛季初名次就是上一季末排出来的名次。
        this.season_open_order = this.teams.slice().sort((a, b) => a.rank - b.rank);
        this.rank_log = [];
    }

    // 实时排名：按当前赛季积分从高到低排序，同分时用上一季末的名次打破平局。
    standings() {
        return this.teams.slice().sort((a, b) => b.rating - a.rating || a.rank - b.rank);
    }

    // 一队的实时排名（1..100）。每场结算都会让积分变动，因此读之前按需重排一次：
    // 一场比赛只影响两队，但要确定它们在全体中的位次仍得整表排序，100 队的排序比每场各自扫一遍便宜。
    live_rank_of(team) {
        if (this._rank_stale) {
            this.standings().forEach((t, i) => { t.live_rank = i + 1; });
            this._rank_stale = false;
        }
        return team.live_rank;
    }

    invalidate_live_ranks() {
        this._rank_stale = true;
    }

    // 赛季内的名次快照：逐日循环在当天赛事结算完后调用一次。名次没变就不重复记，
    // 因此一条记录代表「从这一天起名次变成这样」，供后面的站点回溯引用期。
    snapshot_ranks(day) {
        const order = this.standings();
        const last = this.rank_log[this.rank_log.length - 1];
        if (last && last.order.every((team, i) => team === order[i])) return;
        this.rank_log.push({day, order});
    }

    // 引用期（日期）对应的名次表：取 day ≤ 该日期的最后一条快照。首站的引用期落在上一年，
    // 那时还没有任何本赛季的快照，于是退回赛季初名次——即上一季末排出的名次。
    entry_order(day) {
        let order = this.season_open_order;
        for (const snap of this.rank_log) {
            if (snap.day > day) break;
            order = snap.order;
        }
        return order;
    }

    // 把某站引用期的名次写进每支队伍的 entry_rank。此后 rank_of() 读到的就是「该站的身份」，
    // 名单筛选、补位、赛事内种子与同分排序全部与参赛名单同一口径。
    apply_entry_ranks(event) {
        this.entry_order(reference_day(event.start_day))
            .forEach((team, i) => { team.entry_rank = i + 1; });
    }

    // 查询某队在某个引用期的名次，不改动队伍当前的 entry_rank（用于「下一场比赛」这类前瞻）。
    entry_rank_at(team, event) {
        return this.entry_order(reference_day(event.start_day)).indexOf(team) + 1;
    }

    // 赛季结束：按最终积分排出新名次，并刷新档位、联赛、权重与潜力基数。
    // 单赛季只有十几到二十几场比赛，积分天然带噪；直接按积分重排会让档位年年大幅换血，
    // 潜力和实力也跟着乱跳。因此新旧名次按 RANK_CARRY 混合：积分仍然决定升降，
    // 但一个赛季最多移动有限的幅度，保住了「强队长期在前」的结构。
    // 返回 {standings, changes}：standings 是混合后的完整顺序，changes 是每队的名次升降。
    finalize_rankings() {
        const by_points = this.standings();
        const target = new Map(by_points.map((team, i) => [team, i + 1]));
        const blended = this.teams.slice().sort((a, b) =>
            (a.rank * RANK_CARRY + target.get(a) * (1 - RANK_CARRY)) -
            (b.rank * RANK_CARRY + target.get(b) * (1 - RANK_CARRY)));
        const changes = new Map();
        const standings = blended;
        standings.forEach((team, i) => {
            const next = i + 1;
            changes.set(team, team.rank - next);
            team.rank = next;
            team.apply_rank();
        });
        this.season += 1;
        return {standings, changes};
    }

    // 补位新人：离队和退役的 ID 回到补位池，补位时从池中抽取（ID 可跨代复用，不创造新名称）。
    // 位置继承被替换的队友（role 未指定时才随机），年龄抽 17～29 岁，再从俱乐部潜力基准按年龄
    // 反推十四维属性。这些新人由系统按队伍当前档位即时生成，不写入固定数据库 PLAYER_DB。
    gen_npc(team, role = null) {
        const index = this.rng.randint(0, this.reserve_ids.length - 1);
        const [id] = this.reserve_ids.splice(index, 1);
        const age = this.rng.randint(17, 29);
        const potential = team.potential_base + this.rng.gauss(0, 7);
        const base = potential + age_offset(age);
        if (!role) role = this.rng.choice(ROLE_NAMES);
        const attrs = Object.fromEntries(ATTR_KEYS.map(key => [key, clamp(Math.trunc(base + this.rng.gauss(0, 5)), 5, 99)]));
        const player = new Player(id, role, age, attrs, team, this.rng);
        apply_attribute_floors(player);
        team.roster.push(player);
        team.dirty = true;
        this.players.push(player);
        return player;
    }

    grow_all(rng) {
        for (const player of this.players) growth(player, rng);
    }

    // 玩家不会被 NPC 退役逻辑移除；退役 NPC 先离队，再补满五人并清理现役名单。
    advance(rng) {
        for (const player of this.players) player.age += 1;
        for (const team of this.teams) {
            const vacancies = [];   // 本队离队者的位置，供补位新人继承
            let changed = false;    // 本队本季是否换过人：一个休赛期只扣一次磨合度
            team.roster = team.roster.filter(player => {
                if (player.is_human) return true;
                if (player.age >= NPC_MAX_AGE || rng.random() < npc_retire_chance(player.age)) {
                    player.retired = true;
                    this.reserve_ids.push(player.id);
                    vacancies.push(player.role);
                    changed = true;
                    return false;
                }
                return true;
            });
            while (team.roster.length < 5) this.gen_npc(team, vacancies.shift() || null);
            if (changed) note_roster_change(team);
        }
        this.players = this.players.filter(player => !player.retired);
        this.simulate_transfers(rng);
    }

    // 同档位随机交换 NPC；跨档位由强队签走弱队最强 NPC，同时送回自己最弱 NPC。
    // 玩家不进入交易池；档位越高阵容越稳定，教练另以低概率在相邻档位交换。
    // 候选队伍限制在同联赛内：VRS 联赛与扩展联赛各自闭环，避免一次抽走扩展联赛的顶级选手。
    simulate_transfers(rng) {
        for (const team of this.teams) {
            if (rng.random() >= TIERS[team.tier].churn) continue;
            const candidates = this.teams.filter(t => t !== team && t.league === team.league && Math.abs(t.tier - team.tier) <= 1 && t.roster.length);
            if (!candidates.length) continue;
            const other = rng.choice(candidates);
            if (other.tier < team.tier) this._sign(team, other, rng);
            else if (other.tier > team.tier) this._sign(other, team, rng);
            else {
                const a_pool = team.roster.filter(p => !p.is_human);
                const b_pool = other.roster.filter(p => !p.is_human);
                if (!a_pool.length || !b_pool.length) continue;
                const a = rng.choice(a_pool), b = rng.choice(b_pool);
                team.roster.splice(team.roster.indexOf(a), 1);
                other.roster.splice(other.roster.indexOf(b), 1);
                team.roster.push(b);
                other.roster.push(a);
                team.dirty = true;
                other.dirty = true;
                a.team = other;
                b.team = team;
                note_roster_change(team);
                note_roster_change(other);
            }
        }
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) {
                [a.coach, b.coach] = [b.coach, a.coach];
                note_coach_change(a);
                note_coach_change(b);
            }
        }
    }

    // 交换两个 NPC 席位以维持五人阵容，并更新两人的队伍引用。
    _sign(hi, lo, rng) {
        const a_pool = lo.roster.filter(p => !p.is_human);
        const b_pool = hi.roster.filter(p => !p.is_human);
        if (!a_pool.length || !b_pool.length) return;
        const star = a_pool.reduce((a, b) => a.overall() >= b.overall() ? a : b);
        const weak = b_pool.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        lo.roster.splice(lo.roster.indexOf(star), 1);
        hi.roster.splice(hi.roster.indexOf(weak), 1);
        lo.roster.push(weak);
        hi.roster.push(star);
        lo.dirty = true;
        hi.dirty = true;
        star.team = hi;
        weak.team = lo;
        note_roster_change(lo);
        note_roster_change(hi);
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) {
                [a.coach, b.coach] = [b.coach, a.coach];
                note_coach_change(a);
                note_coach_change(b);
            }
        }
    }

    human_teammates(human) {
        return human.team.roster.filter(p => !p.is_human);
    }

    // 其余队伍按赛事逐场模拟。同一站赛事的所有参赛队伍走同一个 run_event（与玩家参赛时
    // 完全相同的赛程与结算），因此名次、赛季积分和个人数据都是同一把尺子量出来的。
    // skip 用于跳过玩家已经亲自打过的那一站，避免同一站被模拟两次。
    simulate_year(rng, skip = null) {
        for (const event of ANNUAL_CALENDAR) {
            if (skip && skip(event)) continue;
            run_event(this, event, rng, null, new Map());
        }
    }
    // 年度评分 = 每场 Rating × 当时俱乐部权重的均值 × 100 + 各项荣誉积分 × 获奖时权重。
    // 展示 Rating 仍为原始均值；权重在参赛时固定，年末转会不能追溯修改旧队表现。
    // 世界 Top20 只统计 VRS 联赛（世界前 50 名战队），扩展联赛选手另有自己的表现记录。
    compute_top20() {
        const ranked = [];
        for (const player of this.players) {
            if (player.team.league !== LEAGUES[0].key || !player.yr_ratings.length) continue;
            const avg = player.yr_ratings.reduce((sum, r) => sum + r, 0) / player.yr_ratings.length;
            const weighted_rating = player.yr_ratings.reduce((sum, rating, i) => sum + rating * player.yr_rating_weights[i], 0) / player.yr_ratings.length;
            const weighted_honors = player.yr_honors.reduce((sum, honor, i) => sum + honor_points([honor]) * player.yr_honor_weights[i], 0);
            ranked.push([weighted_rating * 100 + weighted_honors, avg, player]);
        }
        ranked.sort((a, b) => b[0] - a[0]);
        return ranked.slice(0, 20);
    }
}

// 赛事强度 = 本场参赛队伍的平均实力 + 该级别的固定偏移，用于把个人 Rating 与团队成绩挂钩。
// 偏移沿用旧的绝对强度与原基准 70 的差值，因此 S 级与 Major 的强度依旧明显高于地区赛。
function event_field(teams, event) {
    const mean = teams.reduce((sum, team) => sum + team.strength(), 0) / teams.length;
    return mean + event.field_offset;
}

// 单场比赛：胜率只由双方阵容实力差决定（实力每差 33 点，胜率相差约 10 倍），再抽一次随机数。
// 临时加成（例如 Major 临场状态）只在本场生效，不进入赛季积分。
function play_single_match(a, b, rng, buff) {
    const strength = team => team.strength() + (buff.get(team) || 0);
    return rng.random() < win_chance(strength(a), strength(b));
}

// 名次换算：先由淘汰赛给出 1～8 名的名次（冠军 / 亚军 / 四强 / 八强），
// 没有进入淘汰赛的队伍统一按「小组出局」处理，名次由小组赛或瑞士轮战绩决定。
function placement_text(rank, teams) {
    if (rank === 1) return "冠军";
    if (rank === 2) return "亚军";
    if (rank <= 4) return "四强";
    if (rank <= 8) return "八强";
    return "小组出局";
}

// 系列赛的图数上限＝**赛制本身**：小组赛与八强/半决赛为 Bo3（3 图），决赛按 final_bo 为 Bo5（5 图）
// 或 Bo3（3 图，地区赛决赛）。
// 注意这里给的是**上限**，不是「这一场会打几图」——实际打几图由比分决定：先到过半胜场就收
// （2:0 只需 2 图，1:1 必然打第 3 图），所以偶数上限凑不出过半胜场的情况根本不会发生。
// 历史上这里叫 series_maps 并按 70% / 55% 抽签决定 2 图或 4 图，被 simulate_series 当成封顶用，
// 于是偶数封顶必然出平局，平局又被判给后手方 b（配对时 a 恒为种子更高的一方）＝系统性偏向弱队。
function series_cap(is_final, event) {
    return is_final && event.final_bo === 5 ? 5 : 3;
}

// 赛制切换线（领域文档 §4.2「凡『胜则晋级』或『负则淘汰』的比赛为 Bo3，其余比赛为 Bo1」）。
// 锁线瑞士轮里只有 2 胜或 2 负的队伍站在赛制切换线上：赢下这一场就到 3 胜晋级、输掉这一场就到 3 负淘汰。
// 同战绩配对保证一场里两队战绩相同，所以判一次就够，这里仍对双方各判一次以防将来改配对规则。
// 于是 R1 / R2 全是 Bo1，R3 的 2-0 与 0-2 对局、R4 与 R5 的全部对局是 Bo3。
function swiss_series_cap(event, entry_a, entry_b) {
    const decisive = entry => entry.wins >= CLINCH_WINS - 1 || entry.losses >= CLINCH_LOSSES - 1;
    return decisive(entry_a) || decisive(entry_b) ? series_cap(false, event) : 1;
}

// 位置不同，吃的属性也不同，所以**不能拿总评当「打得好不好」的代理**：指挥的总评里
// 信息(0.15)+沟通(0.14) 占了近三成，一个枪法平平的指挥总评也能很高。这里把「一个人能打出
// 什么数据」拆成两个复合项，各自只吃真正相关的属性：
//   枪法   —— 直接决定对枪结果的机械属性，决定击杀与 ADR。
//   团队性 —— 道具、补枪、信息与沟通，决定助攻与存活（KAST）。
const FRAG_WEIGHTS = {preaim: 0.26, reaction: 0.22, spray: 0.18, positioning: 0.14, entry: 0.10, movement: 0.10};
const SUPPORT_WEIGHTS = {utility: 0.30, trade: 0.26, info: 0.24, comms: 0.20};
// 表现系数的基准取「本队与对手两队平均水平的中点」，而不是一条全联盟固定水线：
// 数据是**相对对手**打出来的，同样一名选手打弱队数据好、打强队数据差。用中点作基准，
// 势均力敌时两队都落在 0.95 上下——**无论哪个级别的联赛数据都正常**（扩展联赛的两支弱队
// 互打也是十来杀，不会因为「离世界第一很远」而全场只有三杀）；强弱悬殊时差值被中点平分，
// 强队上浮、弱队下沉，不会一边刷爆一边归零。
// STAT_SPREAD 按实测的队内水平差标定（队内枪法复合项标准差约 7），差 15 分表现系数约翻倍。
const STAT_SPREAD = 15;

// 位置对各项数据的倾向（乘在枪法 / 团队性算出的基准之上）。以步枪手为 1.00：
// 狙击手输出与存活最好；突破手先手对枪多、阵亡也最多；辅助击杀最少、助攻最多、存活最稳；
// 指挥的输出低于平均，靠道具与沟通吃助攻；自由人打得少而稳。
// 幅度刻意收在 ±10% 左右：位置差还要叠上「个人枪法比场上平均强多少」这一层，两层是相乘的，
// 系数给足（±18%）会把辅助的每回合击杀压到 0.42，而职业比赛里各位置的 KPR 只差 ±10%。
const ROLE_STAT_PROFILE = {
    "狙击手": {kills: 1.07, deaths: 0.93, assists: 0.85, adr: 1.07, kast: 1.02},
    "突破手": {kills: 1.03, deaths: 1.08, assists: 0.95, adr: 1.01, kast: 0.97},
    "步枪手": {kills: 1.00, deaths: 1.00, assists: 1.00, adr: 1.00, kast: 1.00},
    "指挥":   {kills: 0.95, deaths: 1.00, assists: 1.09, adr: 0.97, kast: 1.01},
    "辅助":   {kills: 0.91, deaths: 0.96, assists: 1.17, adr: 0.93, kast: 1.04},
    "自由人": {kills: 0.99, deaths: 0.95, assists: 0.99, adr: 1.00, kast: 1.02},
};

function composite_of(player, weights) {
    let total = 0;
    for (const key in weights) total += weights[key] * player[key];
    return total;
}

// 一支队伍（上场五人）在某个复合项上的平均水平。
function team_trait(team, weights) {
    const lineup = lineup_of(team);
    return lineup.reduce((sum, player) => sum + composite_of(player, weights), 0) / lineup.length;
}

// 一个复合项对应的表现系数：选手的水平相对「本队与对手的中点」的差距。1 是「打出身价」的基准线。
function field_form(player, team, opponent, weights) {
    const base = (team_trait(team, weights) + team_trait(opponent, weights)) / 2;
    return 0.95 * 2 / (1 + Math.exp(-(composite_of(player, weights) - base) / STAT_SPREAD));
}

// Rating 的系数用 HLTV Rating 2.0 的口径（KAST / KPR / DPR / Impact / ADR 的线性组合），
// 截距 RATING_BASE 把「平均水平选手在势均力敌的一图里」校准到 1.00 附近。
const RATING_BASE = 0.05;

// 单图个人数据：枪法与团队性两个复合项分别驱动对应的列，再乘位置倾向。
// 计数类（击杀 / 阵亡 / 助攻）按这张图**实际打了多少回合**折算，速率类（ADR / KAST / Rating）
// 本身就是每回合的量、与回合数无关——于是 13-2 这种速胜图数据自然偏小，16-14 这种加时图偏大。
// 每回合基准：击杀 0.70、助攻 0.22，ADR 78、KAST 71%。
// Rating 由上面几项**反算**（而不是另起一套公式），所以「数据好」与「Rating 高」不会各说各话；
// 临场手感带来的偏差会自然传导过去，一图刷出 1.5 以上是可能的。
function map_stat(player, team, opponent, event, rng, on_win, rounds) {
    const cfg = GRADE_CFG[event.grade];
    const prof = ROLE_STAT_PROFILE[player.role];
    // 状态与磨合度都是乘在表现系数上的整体修正：后者是队级的，队内五人同进同退。
    const state = form_multiplier(player) * chem_multiplier(team);
    const frag = clamp(field_form(player, team, opponent, FRAG_WEIGHTS) * state, 0.15, 1.95);
    const supp = clamp(field_form(player, team, opponent, SUPPORT_WEIGHTS) * state, 0.15, 1.95);
    const mental = (player.composure + player.focus) / 2;

    const kills = clamp(Math.round(rng.gauss(rounds * 0.70 * prof.kills * frag ** 0.72, 3.2)), 1, 46);
    const kd = clamp(rng.gauss(1 + (frag - 1) * 0.55, 0.16), 0.40, 2.30);
    const deaths = clamp(Math.round(kills * prof.deaths / kd), 3, 42);
    const assists = clamp(Math.round(rng.gauss(rounds * 0.22 * prof.assists * supp ** 0.80, 2.2)), 0, 18);
    const adr = clamp(rng.gauss(78 * (0.48 + 0.52 * frag) * prof.adr, 8), 15, 165);
    const kast = clamp(rng.gauss(71 + (supp - 1) * 12 + (frag - 1) * 4, 5) * prof.kast, 30, 96);
    const headshots = clamp(Math.round(kills * clamp(rng.gauss(0.46 + (player.preaim - 50) * 0.002, 0.08), 0.15, 0.85)), 0, kills);

    const kpr = kills / rounds;
    const dpr = deaths / rounds;
    const apr = assists / rounds;
    const impact = 2.13 * kpr + 0.42 * apr - 0.41;
    const rating = clamp(0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact
        + 0.0032 * adr + RATING_BASE + (mental - 50) / 500
        + rng.gauss(0, 0.04) * cfg.form + (on_win ? 0.06 : -0.05), 0.20, 2.20);
    return {rating, kills, deaths, assists, adr, kast, headshots};
}

// 上场阵容：玩家加入时会替换掉一名队友，因此球队名单可能只剩四人；这里补足到五人，
// 让逐图数据始终按 5v5 记账（现实中由替补或临时替补顶上）。
function lineup_of(team) {
    const lineup = team.roster.slice(0, 5);
    if (lineup.length < 5) {
        for (const player of team.roster) {
            lineup.push(player);
            if (lineup.length >= 5) break;
        }
    }
    return lineup;
}

// 单图比分：MR12 —— 常规时间先到 13 胜（一图最多 24 回合），12-12 进 MR3 加时
// （每半场 3 回合、先到 4 分；3-3 就再来一个加时，直到分胜负）。
// 系列赛的胜负已经定了，这里只按「本图胜方」的视角补一个自洽的比分：
// 胜方赛前胜率越高、分差越大；爆冷（胜方赛前是劣势方）一律按胶着处理。
// 返回胜方 / 负方的回合数与加时个数，负方回合数在常规时间内落在 0～12。
const OT_LOSER_ROUNDS = [2, 2, 2, 2, 2, 1, 1, 0, 3];   // 一个加时里负方的得分；3 分即 3-3
function map_round_score(rng, chance) {
    const dominance = Math.max(0, (chance - 0.5) * 2);          // 势均力敌 0，一边倒 1
    const loser = clamp(Math.round(rng.gauss(9.4 - dominance * 6.4, 2.2)), 0, 12);
    if (loser < 12) return {won: 13, lost: loser, overtimes: 0};
    // 12-12：打加时。每段加时双方各 3 回合，先到 4 分者拿下这一图。
    let won = 12;
    let lost = 12;
    let overtimes = 0;
    for (;;) {
        const points = OT_LOSER_ROUNDS[rng.randint(0, OT_LOSER_ROUNDS.length - 1)];
        overtimes += 1;
        if (points === 3) {                                     // 3-3：再来一个加时
            won += 3;
            lost += 3;
            continue;
        }
        won += 4;
        lost += points;
        break;
    }
    return {won, lost, overtimes};
}

// 一场系列赛：逐图模拟，每张图给双方五名选手各记一条数据，返回胜负与比分。
// maps 是这场系列赛的图数上限（Bo3 = 最多 3 图）：先拿够过半胜场者胜，打满即止。
// buff 是本队这一站的临场状态加成（玩家事件产生），只影响胜负，不影响个人数据口径。
// detailed 为真时逐图记录完整数据（击杀/ADR/KAST），否则只记一条年度 Rating —— 世界 Top20
// 与顶级联赛需要完整个体数据，扩展联赛的批量模拟则省下这部分开销。
// sink 为数组时逐图留存双方明细（只用于玩家参赛的场次），世界模拟传 null，不产生额外对象。
function simulate_series(a, b, event, rng, buff, maps, detailed, sink = null) {
    const strength = team => team.strength() * chem_multiplier(team) + team_form_bonus(team) + (buff.get(team) || 0);
    // 胜场门槛＝过半图数：Bo3 需 2 胜、Bo5 需 3 胜（maps 只是上限，不是门槛）。
    const need = Math.floor(maps / 2) + 1;
    let a_wins = 0;
    let b_wins = 0;
    while (a_wins < need && b_wins < need && a_wins + b_wins < maps) {
        const chance = win_chance(strength(a), strength(b));
        const a_takes = rng.random() < chance;
        const winner = a_takes ? a : b;
        if (a_takes) a_wins += 1;
        else b_wins += 1;
        if (!detailed) continue;
        // 单图比分先算：它决定这张图打了多少回合，而计数类个人数据要按回合数折算。
        // 比分只在玩家参赛的场次留存（世界模拟传 sink = null），但回合数每张图都得知道。
        const score = map_round_score(rng, a_takes ? chance : 1 - chance);
        const rounds = score.won + score.lost;
        // sink 只在玩家参赛的场次传入：逐图把双方五人的明细留一份，供赛事总结的「详细数据」页使用。
        const lines = sink ? [] : null;
        // 统计按阵容记账：每张图每边恰好五条记录，玩家的位置由阵容补位规则决定。
        for (const team of [a, b]) {
            for (const player of lineup_of(team)) {
                const line = map_stat(player, team, team === a ? b : a, event, rng, team === winner, rounds);
                push_event_stats(player, event, line, false);
                if (lines) lines.push({team, player, line, won: team === winner});
            }
        }
        if (lines) {
            // 按胜方 / 负方分别记，调用方不必知道这一场谁是 a 谁是 b。
            sink.push({
                winner,
                lines,
                winner_rounds: score.won,
                loser_rounds: score.lost,
                overtimes: score.overtimes,
            });
        }
    }
    // 门槛＝过半图数，而上限又是奇数（Bo3 = 3、Bo5 = 5），因此必然有一方先到门槛：平局不可能出现。
    // 一旦出现就说明有人又把「预定图数」塞进了 maps，直接炸掉而不是悄悄把胜利判给 b。
    if (a_wins === b_wins) {
        throw new Error(`${event.key} 的系列赛出现平局 ${a_wins}:${b_wins}（maps=${maps}）`);
    }
    for (const team of [a, b]) {
        const win = team === a ? a_wins > b_wins : b_wins > a_wins;
        // 磨合度按「一场系列赛」结算：练习赛与正式赛走的是同一条路，因此两者都算数。
        note_series_result(team, win);
        if (detailed) {
            for (const player of lineup_of(team)) credit_series(player.ev_stats[event.key], win);
        } else {
            // 扩展联赛只保留一条系列赛 Rating，口径与顶级联赛相同（逐图均值）。
            for (const player of lineup_of(team)) {
                push_event_rating(player, event, individual_rating(player, "小组出局", event, rng), win);
            }
        }
    }
    return {a_wins, b_wins, winner: a_wins > b_wins ? a : b};
}
// 逐图记账：一名选手一张图的统计。
function push_event_stats(player, event, line, won) {
    const st = player.ev_stats[event.key] || (player.ev_stats[event.key] = blank_event_stats(event));
    st.maps += 1;
    st.kills += line.kills;
    st.deaths += line.deaths;
    st.assists += line.assists;
    st.headshots += line.headshots;
    st.adr += line.adr;
    st.kast += line.kast;
    st.rating_sum += line.rating;
    return st;
}

// 整场记账（扩展联赛的批量模拟）：只留一条 Rating，没有逐图明细。
function push_event_rating(player, event, rating, won) {
    const st = player.ev_stats[event.key] || (player.ev_stats[event.key] = blank_event_stats(event));
    st.maps += 1;
    st.rating_sum += rating;
    st.series += 1;
    if (won) st.wins += 1;
    else st.losses += 1;
    return st;
}

function blank_event_stats(event) {
    return {
        event, maps: 0, kills: 0, deaths: 0, assists: 0, headshots: 0,
        adr: 0, kast: 0, rating_sum: 0, series: 0, wins: 0, losses: 0,
    };
}

// 一站结束后的标记：本次交手赢了几场；逐图数据已经各自记过一次。
function credit_series(st, won) {
    if (!st) return st;
    st.series += 1;
    if (won) st.wins += 1;
    else st.losses += 1;
    return st;
}

// 逐场打完一战系列赛并结算双方赛季积分，返回胜者。所有赛制共用它，保证积分与个人数据同源。
// tour_wins / tour_losses 是本站战绩（每站开赛前清零），赛季累计仍在 team.wins / losses。
// stage 是本站的阶段标签（瑞士轮轮次 / 小组赛 / 淘汰赛轮次），只有玩家队伍带 event_log 时才采集明细。
function play_series(a, b, event, rng, buff, maps, detailed, stage = null) {
    const host = a.event_log ? a : (b.event_log ? b : null);
    const sink = host && stage ? [] : null;
    // 本场积分变化的基准。这里对本场变化本身取整（而不是拿两个取整后的积分相减）：
    // 单场变化最小也有约 1 分的量级，直接取整不会把负数抹成 0，而「输球却显示 0」会让玩家以为没结算。
    const rating_before = host ? host.rating : 0;
    const match = simulate_series(a, b, event, rng, buff, maps, detailed, sink);
    const a_won = match.winner === a;
    a.play_match(b, a_won);
    a.tour_wins += a_won ? 1 : 0;
    a.tour_losses += a_won ? 0 : 1;
    b.tour_wins += a_won ? 0 : 1;
    b.tour_losses += a_won ? 1 : 0;
    if (sink) {
        host.event_log.push({
            opponent: host === a ? b : a,
            won: match.winner === host,
            score: host === a ? [match.a_wins, match.b_wins] : [match.b_wins, match.a_wins],
            stage,
            elo: Math.round(host.rating - rating_before),
            maps: sink,
        });
    }
    return match;
}

// 淘汰赛的一轮：按顺序两两配对（调用前已排好种子）。
// 返回 {next, eliminated, matches}：next 是晋级队伍，eliminated 是本轮负者及其名次，
// matches 记录每场对阵（胜者、比分、是否为决赛）供逐日输出使用。
// 名次按轮次给：八强负者并列第 5、半决赛负者并列第 3、决赛负者为亚军，胜者为冠军。
function play_bracket_round(current, event, rng, buff, detailed) {
    const next = [];
    const eliminated = new Map();
    const matches = [];
    const loser_rank = current.length / 2 + 1;
    const is_final = current.length === 2;
    for (let i = 0; i + 1 < current.length; i += 2) {
        const a = current[i];
        const b = current[i + 1];
        const result = play_series(a, b, event, rng, buff, series_cap(is_final, event), detailed,
            {kind: "bracket", size: current.length});
        const loser = result.winner === a ? b : a;
        eliminated.set(loser, loser_rank);
        next.push(result.winner);
        matches.push({a, b, winner: result.winner, loser, a_wins: result.a_wins, b_wins: result.b_wins, is_final});
    }
    return {next, eliminated, matches};
}

// 完整淘汰赛：反复打一轮直到决出冠军，返回 Map(队伍 → 名次)。
function play_bracket(alive, event, rng, buff, detailed) {
    const bracket = new Map();
    let current = alive.slice();
    while (current.length > 1) {
        const {next, eliminated} = play_bracket_round(current, event, rng, buff, detailed);
        for (const [team, rank] of eliminated) bracket.set(team, rank);
        current = next;
    }
    bracket.set(current[0], 1);
    return bracket;
}

// 把已打过的对手记进 used 表，供同战绩配对时避免重复对阵。
function mark_played(used, a, b) {
    if (!used.has(a)) used.set(a, new Set());
    if (!used.has(b)) used.set(b, new Set());
    used.get(a).add(b);
    used.get(b).add(a);
}

function played_before(used, a, b) {
    return Boolean(used.get(a) && used.get(a).has(b));
}

// 固定轮数瑞士轮（地区赛专用：30 队 4 轮取前 8，不设锁线，打满轮数后按战绩排序取前 8）。
// 拆成可逐轮推进的状态机：make_swiss 建表，swiss_round 打一轮，swiss_result 取前 8。
// 配对规则：先按引用期排名蛇形配对，之后按同战绩配对并避免重复对阵；单数队伍时轮空位置逐轮轮换。
// Major / S 级不用这套，走上面的三阶段锁线阶梯（make_ladder / ladder_round）。
function make_swiss(teams) {
    return {
        table: teams.map(team => ({team, wins: 0, losses: 0, opponents: []})),
        used: new Map(),
        round: 0,
    };
}

// 打一轮瑞士轮，返回本轮对阵记录（供玩家逐日输出），并推进 state.round。
function swiss_round(state, event, rng, buff, detailed) {
    const round = state.round;
    const table = state.table;
    const used = state.used;
    const matches = [];
    table.sort((a, b) => b.wins - a.wins || a.losses - b.losses
        || buchholz(a) - buchholz(b) || rank_of(a.team) - rank_of(b.team));
    const pool = table.slice();
    // 单数队伍时把轮空者换到队尾，其余照常配对。
    if (pool.length % 2 === 1) pool.splice(round % pool.length, 1);
    for (let i = 0; i + 1 < pool.length; i += 2) {
        const a = pool[i];
        // 同战绩配对可能撞上已经打过的对手，此时在剩余队伍里换一个没交过手的。
        if (played_before(used, a.team, pool[i + 1].team)) {
            const swap = pool.findIndex((entry, k) => k > i + 1 && !played_before(used, a.team, entry.team));
            if (swap > 0) [pool[i + 1], pool[swap]] = [pool[swap], pool[i + 1]];
        }
        const b = pool[i + 1];
        mark_played(used, a.team, b.team);
        const result = play_series(a.team, b.team, event, rng, buff, series_cap(false, event), detailed,
            {kind: "swiss", round});
        const winner = result.winner === a.team ? a : b;
        const loser = winner === a ? b : a;
        winner.wins += 1;
        loser.losses += 1;
        winner.opponents.push(loser);
        loser.opponents.push(winner);
        matches.push({a: a.team, b: b.team, winner: result.winner, a_wins: result.a_wins, b_wins: result.b_wins});
    }
    state.round += 1;
    return matches;
}

// 瑞士轮结束：按「胜场 → Buchholz（对手胜场和）→ 引用期排名」排序，返回前 8 与其余战绩表。
function swiss_result(state) {
    state.table.sort((a, b) => b.wins - a.wins || a.losses - b.losses
        || buchholz(a) - buchholz(b) || rank_of(a.team) - rank_of(b.team));
    return {advancing: state.table.slice(0, 8).map(entry => entry.team), rest: state.table.slice(8)};
}

// 世界模拟（NPC 赛事）：一次性跑完全部轮次。淘汰赛统一交给 finalize_event。
function play_swiss(teams, event, rng, buff, detailed) {
    const state = make_swiss(teams);
    const rounds = event.swiss_rounds || 5;
    for (let r = 0; r < rounds; r++) swiss_round(state, event, rng, buff, detailed);
    return swiss_result(state);
}

// Buchholz：对手胜场和，同战绩时用它打破平局。
function buchholz(entry) {
    return entry.opponents.reduce((sum, opponent) => sum + opponent.wins, 0);
}

/* ==========================================================================
 * Major / S 级：三阶段阶梯瑞士轮（领域文档「三组阶梯式瑞士轮，每组 16 队取 8」）
 * --------------------------------------------------------------------------
 * 32 队按引用期名次分成三段：传奇组直邀 8（1–8 名）、挑战组直邀 8（9–16 名）、
 * 竞争组 16（17–28 名 + 4 支赛区预选冠军）。竞争组先打，出线 8 队并入挑战组；
 * 挑战组出线 8 队并入传奇组；传奇组出线 8 队进入 8 强单败淘汰赛。
 * 每个阶段都是 16 队瑞士轮，沿用真实 Major 的锁线规则：**先取 3 胜者晋级、先吞 3 负者淘汰**。
 * 由此每个阶段恰好 8 队 3 胜、8 队 3 负——「3 胜」永远是晋级的充分条件。
 * 对照旧实现：把 32 队塞进一锅 5 轮瑞士轮再取前 8，同战绩配对会天然产出 16 支 ≥3 胜的队伍，
 * 于是每站都有约 8 支 3 胜 2 负的队伍被挡在八强之外（实测占全部 3-2 球队的 79.7%）。
 * ========================================================================== */
const LADDER_STAGES = ["竞争组", "挑战组", "传奇组"];
const CLINCH_WINS = 3;    // 锁线胜场：先取 3 胜者晋级
const CLINCH_LOSSES = 3;  // 锁线负场：先吞 3 负者淘汰
const LADDER_POT = 16;    // 每个阶段的队伍数

// 战绩排序：胜场多 → 负场少 → Buchholz（对手胜场和）高 → 引用期排名靠前。
function record_order(a, b) {
    return b.wins - a.wins || a.losses - b.losses
        || buchholz(a) - buchholz(b) || rank_of(a.team) - rank_of(b.team);
}

// 锁线瑞士轮：与 make_swiss 同形，区别是队伍拿到 3 胜或吞到 3 负后 resolved=true，不再参与配对。
function make_clinch_swiss(teams) {
    return {
        table: teams.map(team => ({team, wins: 0, losses: 0, opponents: [], resolved: false})),
        used: new Map(),
        round: 0,
    };
}

// 阶梯瑞士轮状态机：按引用期名次切出三段名单，从竞争组开始逐阶段推进。
function make_ladder(teams) {
    const seeds = teams.slice().sort((a, b) => rank_of(a) - rank_of(b));
    const split = seeds.length - LADDER_POT;
    return {
        seeds,
        legend: seeds.slice(0, 8),        // 传奇组直邀：引用期 1–8 名
        challenger: seeds.slice(8, split),  // 挑战组直邀：引用期 9–16 名
        competitor: seeds.slice(split),     // 竞争组：余下 16 队（17–28 名 + 4 支预选）
        stage: 0,
        swiss: make_clinch_swiss(seeds.slice(split)),
        results: [],                      // 每阶段的 {name, advancing, rest}（都是战绩条目）
        done: false,
        advancing: null,                  // 阶梯跑完后的 8 强（队伍）
        rest: null,                       // 阶梯跑完后的 9～32 名（战绩条目，按出局阶段倒序）
    };
}

// 未锁线队伍的对阵顺序：第 1 轮按引用期排名蛇形落位（1 对 16、2 对 15……），
// 也就是「直邀队 vs 前一阶段晋级队」；之后按战绩排序，同战绩相邻配对。
function clinch_pool(state) {
    const pool = state.table.filter(entry => !entry.resolved);
    if (state.round === 0) {
        pool.sort((a, b) => rank_of(a.team) - rank_of(b.team));
        const half = pool.length / 2;
        return pool.slice(0, half).flatMap((entry, i) => [entry, pool[pool.length - 1 - i]]);
    }
    return pool.sort(record_order);
}

// 打一轮锁线瑞士轮：只把未锁线的队伍按 clinch_pool 的顺序两两配对，打完给达到 3 胜 / 3 负的队伍上锁。
// 撞上打过的对手时只在**同战绩**的剩余队伍里换人：跨战绩换人会打破「每档偶数」，
// 让某个阶段凑不出 8 胜 8 负；实在躲不开就接受重复对阵。
// 返回本轮对阵记录；对局数恒为「未锁线队伍数 / 2」，因此 16 队阶段恰好是 8 + 8 + 8 + 6 + 3 = 33 场。
function clinch_round(state, event, rng, buff, detailed, stage_name) {
    const pool = clinch_pool(state);
    if (pool.length % 2 === 1) {
        throw new Error(`${event.key} 的${stage_name}瑞士轮凑不出偶数对阵：${pool.length} 支未锁线队伍`);
    }
    const matches = [];
    for (let i = 0; i + 1 < pool.length; i += 2) {
        const a = pool[i];
        if (played_before(state.used, a.team, pool[i + 1].team)) {
            const same_record = entry => entry.wins === pool[i + 1].wins;
            const swap = pool.findIndex((entry, k) =>
                k > i + 1 && same_record(entry) && !played_before(state.used, a.team, entry.team));
            if (swap > 0) [pool[i + 1], pool[swap]] = [pool[swap], pool[i + 1]];
        }
        const b = pool[i + 1];
        mark_played(state.used, a.team, b.team);
        // 赛制切换线：决胜场 Bo3，其余 Bo1（见 swiss_series_cap）。
        const result = play_series(a.team, b.team, event, rng, buff, swiss_series_cap(event, a, b), detailed,
            {kind: "swiss", round: state.round, stage: stage_name});
        const winner = result.winner === a.team ? a : b;
        const loser = winner === a ? b : a;
        winner.wins += 1;
        loser.losses += 1;
        winner.opponents.push(loser);
        loser.opponents.push(winner);
        matches.push({a: a.team, b: b.team, winner: result.winner, a_wins: result.a_wins, b_wins: result.b_wins});
    }
    for (const entry of state.table) {
        if (!entry.resolved && (entry.wins >= CLINCH_WINS || entry.losses >= CLINCH_LOSSES)) entry.resolved = true;
    }
    state.round += 1;
    return matches;
}

// 一个阶段结束：8 队 3 胜晋级、8 队 3 负淘汰。这两条是锁线规则的不变量，
// 凑不出 8/8 就说明赛制实现破了「3 胜必晋级」，必须当场炸掉而不是悄悄算出一个名次。
function clinch_result(state, event, stage_name) {
    const sorted = state.table.slice().sort(record_order);
    const advancing = sorted.filter(entry => entry.wins >= CLINCH_WINS);
    const rest = sorted.filter(entry => entry.wins < CLINCH_WINS);
    if (advancing.length !== 8 || rest.length !== 8) {
        throw new Error(`${event.key} 的${stage_name}瑞士轮没有产出 8 胜 8 负：${advancing.length}/${rest.length}`);
    }
    return {advancing, rest};
}

// 推进阶梯瑞士轮一轮。阶段结束后把出线 8 队并入下一阶段的直邀名单（或收束到八强）。
// 返回 {matches, stage_name, stage_finished, stage_advancing, finished}。
function ladder_round(state, event, rng, buff, detailed) {
    const name = LADDER_STAGES[state.stage];
    const matches = clinch_round(state.swiss, event, rng, buff, detailed, name);
    const stage_finished = state.swiss.table.every(entry => entry.resolved);
    const out = {matches, stage_name: name, stage_finished, stage_advancing: [], finished: false};
    if (!stage_finished) return out;
    const {advancing, rest} = clinch_result(state.swiss, event, name);
    state.results.push({name, advancing, rest});
    out.stage_advancing = advancing.map(entry => entry.team);
    if (state.stage < LADDER_STAGES.length - 1) {
        const invited = state.stage === 0 ? state.challenger : state.legend;
        state.stage += 1;
        state.swiss = make_clinch_swiss(invited.concat(out.stage_advancing));
        return out;
    }
    // 传奇组出线 8 队进八强；淘汰队按「后出局的排前面」拼成 9～32 名的完整名次表。
    state.done = true;
    state.advancing = out.stage_advancing;
    state.rest = state.results.slice().reverse().flatMap(item => item.rest);
    out.finished = true;
    return out;
}

// 把阶梯一次跑完（世界模拟与「玩家已出局」时的补完共用）。
function drain_ladder(ladder, event, rng, buff, detailed) {
    let guard = 0;
    while (!ladder.done) {
        ladder_round(ladder, event, rng, buff, detailed);
        if (++guard > LADDER_STAGES.length * 8) throw new Error(`${event.key} 的阶梯瑞士轮没有收敛`);
    }
    return ladder;
}

// 世界模拟（NPC 赛事）：一次性跑完整个阶梯。返回 {advancing, rest}，与 play_swiss 同形。
function play_ladder(teams, event, rng, buff, detailed) {
    const ladder = drain_ladder(make_ladder(teams), event, rng, buff, detailed);
    return {advancing: ladder.advancing, rest: ladder.rest};
}

// 分组抽签：按引用期名次蛇形落位（1–8 / 9–16 / 17–24 / 25–32 各成一档），保证每组实力均衡。
// 队伍数与组数除不尽时把余数分给前面的组，因此 25 队也能分成 7/6/6/6 这样的规模。
function make_groups(teams, group_count, rng) {
    const seeds = teams.slice().sort((a, b) => rank_of(a) - rank_of(b));
    const groups = Array.from({length: group_count}, () => []);
    seeds.forEach((team, index) => groups[index % group_count].push(team));
    return groups;
}

// 小组单循环：组内两两交手（4 队 3 轮、8 队 7 轮），同分按净胜图数、再按引用期排名。
// 返回每个组的排序结果，调用方按「每组第几名」决定淘汰赛配对。
function group_order(group, event, rng, buff, detailed) {
    const table = group.map(team => ({team, wins: 0, losses: 0, maps: 0, lost_maps: 0}));
    for (let i = 0; i < table.length; i++) {
        for (let j = i + 1; j < table.length; j++) {
            const a = table[i];
            const b = table[j];
            const maps = series_cap(false, event);
            const result = play_series(a.team, b.team, event, rng, buff, maps, detailed, {kind: "group"});
            const winner = result.winner === a.team ? a : b;
            const loser = winner === a ? b : a;
            winner.wins += 1;
            loser.losses += 1;
            winner.maps += Math.max(result.a_wins, result.b_wins);
            winner.lost_maps += Math.min(result.a_wins, result.b_wins);
            loser.maps += Math.min(result.a_wins, result.b_wins);
            loser.lost_maps += Math.max(result.a_wins, result.b_wins);
        }
    }
    table.sort((a, b) => b.wins - a.wins || a.losses - b.losses
        || (b.maps - b.lost_maps) - (a.maps - a.lost_maps) || rank_of(a.team) - rank_of(b.team));
    return table;
}

// 小组赛阶段：每个组各自单循环。每组前 per_group 名出线，出线队伍按「组内名次 → 引用期排名」
// 排成 1～8 号种子（IEM/BLAST 每组 4 队只出头名，A 级每组 8 队取前四）。
// 返回 {advancing, rest}：淘汰赛由 finalize_event 统一执行，rest 用于补齐小组名次。
function play_groups(groups, event, rng, buff, detailed) {
    const orders = groups.map(group => group_order(group, event, rng, buff, detailed));
    const per_group = event.per_group || 1;
    const advancing = [];
    for (let place = 0; place < per_group; place++) {
        for (const order of orders) {
            if (order[place]) advancing.push(order[place]);
        }
    }
    const rest = [];
    for (let place = per_group; place < Math.max(...orders.map(order => order.length)); place++) {
        for (const order of orders) {
            if (order[place]) rest.push(order[place]);
        }
    }
    return {advancing: advancing.map(entry => entry.team), rest};
}

// 一站赛事的完整模拟。按赛事模板决定赛制与参赛队伍：
//   major    —— 32 队三阶段阶梯瑞士轮（竞争组 / 挑战组 / 传奇组，各 16 队取 8），8 强单败，决赛 Bo5；
//   standard —— 32 队 4 组 × 8 队单循环取前二，8 强单败（A 级与 B 级）；
//   regional —— 30 队 4 轮瑞士轮取 8 强（同期地区赛）。
// 所有赛制最后都收敛到同一个 8 强单败淘汰赛，保证 1～8 名的名次口径完全一致。
// 返回 {event, teams, standings, field, champion, runner_up}。
function run_tournament(teams, event, rng, buff = new Map(), detailed = true) {
    const field = event_field(teams, event);
    // Major / S 级走阶梯瑞士轮；地区赛走固定轮数瑞士轮；A / B 级先跑小组单循环。
    const stage = event.format === "major"
        ? play_ladder(teams, event, rng, buff, detailed)
        : event.format === "regional"
            ? play_swiss(teams, event, rng, buff, detailed)
            : play_groups(make_groups(teams, event.groups, rng), event, rng, buff, detailed);
    const bracket = play_bracket(stage.advancing, event, rng, buff, detailed);
    return finalize_event(event, teams, field, bracket, stage.rest, rng);
}

// 一场赛事结束后的收尾：先按淘汰赛名次排定 1～8 名，再按小组/瑞士轮/阶梯的战绩补齐其余队伍，
// 最后给每名选手结算年度表现。返回赛事总结对象（champion / runner_up 供播报使用）。
function finalize_event(event, teams, field, bracket, rest, rng) {
    const ordered = bracket ? Array.from(bracket.keys()) : [];
    const standings = ordered.slice().sort((a, b) => bracket.get(a) - bracket.get(b)
        || b.tour_wins - a.tour_wins || a.tour_losses - b.tour_losses || rank_of(a) - rank_of(b));
    // 淘汰赛名次（1～8）由 play_bracket 给出；其余队伍优先采用赛制给出的顺序。
    // 阶梯瑞士轮必须沿用「出局阶段」的顺序（传奇组出局排 9～16、挑战组 17～24、竞争组 25～32），
    // 单纯按总胜场排会把「在最后一个阶段打得更久」误判成更好。赛制没给出顺序时退回按战绩排。
    const listed = (rest || []).map(entry => (entry && entry.team) || entry);
    const covered = new Set(listed);
    const others = listed.filter(team => !bracket || !bracket.has(team));
    others.push(...teams.filter(team => !covered.has(team) && (!bracket || !bracket.has(team)))
        .sort((a, b) => b.tour_wins - a.tour_wins || a.tour_losses - b.tour_losses || rank_of(a) - rank_of(b)));
    standings.push(...others);
    assert_unique(standings, teams.length, event);
    standings.forEach((team, index) => {
        const result = placement_text(index + 1, teams.length);
        for (const player of team.roster) {
            const st = player.ev_stats[event.key];
            const rating = st && st.maps ? st.rating_sum / st.maps : individual_rating(player, result, event, rng);
            record_performance(player, result, event, rng, field, rating);
        }
    });
    return {event, teams, standings, field, champion: standings[0], runner_up: standings[1] || null};
}

// 名次表必须是参赛队伍的一个完整排列，否则「队伍排名」会漏队或重复。
function assert_unique(standings, size, event) {
    if (standings.length !== size || new Set(standings).size !== size) {
        throw new Error(`${event.key} 的名次表不完整：${standings.length}/${size}`);
    }
}


function honor_points(honors) {
    let points = 0;
    for (const [, grade, result] of honors) {
        if (grade === "MAJOR") points += result === "冠军" ? 15 : 6;
        else if (grade === "S") points += result === "冠军" ? 8 : 0;
        else if (grade === "A") points += result === "冠军" ? 4 : 0;
        else points += result === "冠军" ? 2 : 0;
    }
    return points;
}

// 一场赛事由「参赛队伍 + 赛制」两部分决定，这里把两者拼在一起：
// 先按引用期名次排出参赛名单，再交给 run_tournament 逐场模拟。
// plays 是赛程已经算好的「玩家是否参赛」，不传则按引用期名次现算。
function run_event(world, event, rng, human, buff, plays = null) {
    // 引用期名次要先落地：下面的默认参赛判定与名单组装都得用同一套名次。
    world.apply_entry_ranks(event);
    const human_plays = plays === null
        ? Boolean(human && team_invited(human.team, event))
        : Boolean(human && plays);
    const teams = event_participants(world, event, human, human_plays);
    for (const team of teams) {
        team.tour_wins = 0;
        team.tour_losses = 0;
    }
    return run_tournament(teams, event, rng, buff || new Map(), needs_detailed_stats(event, human));
}

// 是否需要逐图明细：主赛（Major / S / A / B）一律逐图记录——赛事总结会展示参赛各队的成员数据；
// 同期地区赛里有 50 支扩展联赛球队，批量模拟只需一条 Rating，省下大量逐图计算。
function needs_detailed_stats(event, human) {
    return event.circuit === "main" || Boolean(human);
}

// 级别标签：Major / S 级 / A 级 / B 级 / 地区赛。
function grade_label(grade) {
    if (grade === "MAJOR") return "Major";
    if (grade === "S") return "S 级";
    if (grade === "A") return "A 级";
    if (grade === "B") return "B 级";
    return "地区赛";
}

// 一名选手一站统计的场均换算：击杀、伤害、KAST 全部按地图数取平均。
function stat_entry(player, team, st) {
    return {
        player, team,
        maps: st.maps,
        kills: st.kills,
        deaths: st.deaths,
        assists: st.assists,
        headshots: st.headshots,
        series: st.series,
        rating: st.rating_sum / Math.max(1, st.maps),
        adr: st.adr / Math.max(1, st.maps),
        kast: st.kast / Math.max(1, st.maps),
    };
}

// 一支队伍在一站赛事里的场均 Rating：取五名队员的均值，用于年末 Top20 与荣誉权重。
function team_event_rating(team, event) {
    const entries = team.roster.map(player => player.ev_stats[event.key]).filter(st => st && st.maps);
    if (!entries.length) return 0;
    return entries.reduce((sum, st) => sum + st.rating_sum / st.maps, 0) / entries.length;
}

// 年度 Top20 里玩家的名次（从 0 开始，-1 表示未入选），并顺手累计入选与年度第一的次数。
// 文本输出（print_top20）与年度总结弹窗共用同一个入口，保证计数只发生一次。
function top20_rank(ranking, human) {
    const index = ranking.findIndex(([, , player]) => player === human);
    if (index >= 0) {
        human.top20_count += 1;
        if (index === 0) human.top1_count += 1;
    }
    return index;
}

// 收集一站的选手统计：按 Rating 与击杀各排一次，供赛事总结的排行榜使用。
function event_leaders(summary) {
    const stats = [];
    for (const team of summary.teams) {
        for (const player of team.roster) {
            const st = player.ev_stats[summary.event.key];
            if (!st || !st.maps) continue;
            stats.push(stat_entry(player, team, st));
        }
    }
    const by_rating = stats.slice().sort((a, b) => b.rating - a.rating || b.kills - a.kills);
    const by_kills = stats.slice().sort((a, b) => b.kills - a.kills || b.rating - a.rating);
    return {stats, by_rating, by_kills};
}
// 单站个人 Rating 的解析式。正常流程下赛事结算用逐图数据的平均值，这个函数给没打过图的
// 替补兜底（`finalize_event` 在 `st.maps` 为 0 时才走到这里），以及扩展联赛的整场结算。
// 与 map_stat 同源：一样走枪法复合项，斜率 0.50 是按 Rating 2.0 口径对枪法求导得到的，
// 因此「只会算一遍 Rating」的两条通路量级一致。这里没有对手，按「对手 = 本队」处理。
function individual_rating(player, result, event, rng) {
    const mental = (player.composure + player.focus) / 2;
    const frag = field_form(player, player.team, player.team, FRAG_WEIGHTS) * chem_multiplier(player.team);
    let base = 1.00 + (frag - 0.95) * 0.50 + (mental - 50) / 500 + rng.uniform(-0.12, 0.12);
    base += RESULT_BONUS[result] || 0;
    if (event.is_major) base -= 0.03;
    return clamp(base, 0.35, 1.80);
}

function record_performance(player, result, event, rng, field, rating = 0) {
    const weight = player.team.top20_weight;
    const value = clamp(rating || individual_rating(player, result, event, rng), 0.20, 2.20);
    player.yr_ratings.push(value);
    player.yr_rating_weights.push(weight);
    if (result === "冠军" || (result === "亚军" && event.is_major)) {
        player.yr_honors.push([event.name, event.grade, result]);
        player.yr_honor_weights.push(weight);
        if (result === "冠军") player.yr_titles += 1;
    }
}

/* ==========================================================================
 * 赛事总结：玩家参赛的那一站以二级窗口（弹窗）呈现
 * --------------------------------------------------------------------------
 * 汇总本站前八名、全场 Rating / 击杀榜、赛事 MVP 与玩家逐场逐图明细，交给渲染层的
 * io.summary 弹出窗口；日志里只留一行摘要。未参赛的站点仍在后台静默模拟，不产生窗口。
 * ========================================================================== */

function rating_color(rating) {
    if (rating >= 1.25) return YELLOW + ";" + BOLD;
    if (rating >= 1.00) return GREEN;
    if (rating >= 0.85) return CYAN;
    return DIM;
}

// 单图 Swing（回合影响力）：模型的最小粒度是「单图」，没有逐回合数据，因此用个人 Rating
// 相对 1.00 基准的偏离作为代理指标，单位是百分点（评分越高，对队伍获胜概率的贡献越大）。
function swing_of(rating) {
    return (rating - 1.00) * 6.5;
}

// 阶段标签：把 play_series 采集到的 stage 变成「竞争组 第 3 轮 / 半决赛」这类可读文字。
function stage_label(stage) {
    if (!stage) return "比赛";
    if (stage.kind === "swiss") {
        return stage.stage ? `${stage.stage} 第 ${stage.round + 1} 轮` : `瑞士轮 第 ${stage.round + 1} 轮`;
    }
    if (stage.kind === "group") return "小组赛";
    if (stage.kind === "bracket") return round_name(stage.size);
    return "比赛";
}

// 一名选手在一张图里的明细行，供详细数据表格使用。
function detail_row(item, human) {
    const {player, line} = item;
    return {
        id: player.id,
        role: player.role,
        kills: line.kills,
        deaths: line.deaths,
        assists: line.assists,
        adr: line.adr,
        kast: line.kast,
        rating: line.rating,
        swing: swing_of(line.rating),
        me: player === human,
    };
}

// 逐图明细：把 simulate_series 采集的 sink 转成战报用的纯数据（每图双方各五行，单图比分以我方在前）。
// 赛事总结与练习赛战报共用同一套口径，保证「详细数据」页两处长得一样。
function series_map_details(sink, human, opponent) {
    return sink.map(record => {
        const own = record.winner === human.team;
        // 单图比分（MR12，12-12 进加时）：统一以我方在前，方便战报直接显示。
        const score = own
            ? [record.winner_rounds, record.loser_rounds]
            : [record.loser_rounds, record.winner_rounds];
        return {
            won: own,
            score,
            overtimes: record.overtimes,
            mine: record.lines.filter(item => item.team === human.team).map(item => detail_row(item, human)),
            theirs: record.lines.filter(item => item.team === opponent).map(item => detail_row(item, human)),
        };
    });
}

// 把本站的选手统计与逐场明细整理成纯数据，交给渲染层（不接触 DOM）。
// 返回 null 表示本站没有玩家的统计（异常兜底：调用方直接跳过窗口与摘要）。
function event_summary_payload(summary, human) {
    const {event, teams, standings} = summary;
    const {stats, by_rating, by_kills} = event_leaders(summary);
    const own = stats.find(entry => entry.player === human);
    if (!own) return null;
    const position = standings.indexOf(human.team) + 1;
    const result = placement_text(position, teams.length);
    const year = START_YEAR + human.year - 1;

    const board = (list, pick) => list.slice(0, 10).map((entry, index) => ({
        rank: index + 1,
        id: entry.player.id,
        team: entry.team.name,
        me: entry.player === human,
        ...pick(entry),
    }));

    // 小组赛一组要打好几场，按出现顺序编号；其余阶段名直接可读。
    let group_no = 0;
    const matches = (human.team.event_log || []).map(record => {
        const label = record.stage && record.stage.kind === "group"
            ? `小组赛 第 ${++group_no} 场`
            : stage_label(record.stage);
        return {
            stage: label,
            opponent: record.opponent.name,
            won: record.won,
            score: record.score,
            elo: record.elo,
            maps: series_map_details(record.maps, human, record.opponent),
        };
    });
    // 本站积分变化：逐场求和。每场都按取整值结算，因此这个和恰好等于「站末积分 − 站前积分」，
    // 战报里逐场数字与顶部合计不会差 1 分。
    const elo_total = matches.reduce((sum, item) => sum + item.elo, 0);

    return {
        event: {
            name: event.name,
            tier: grade_label(event.grade),
            from: date_short(game_date(year, event.start_day)),
            to: date_short(game_date(year, event.end_day)),
        },
        result: {
            champion: standings[0] ? standings[0].name : "-",
            runner_up: standings[1] ? standings[1].name : "-",
            semi: standings.slice(2, 4).map(team => team.name),
            quarter: standings.slice(4, 8).map(team => team.name),
        },
        // 赛事 MVP：全场 Rating 最高的选手。
        mvp: by_rating.length ? {
            id: by_rating[0].player.id,
            team: by_rating[0].team.name,
            role: by_rating[0].player.role,
            rating: by_rating[0].rating,
        } : null,
        you: {
            team: human.team.name,
            placement: result,
            kills: own.kills,
            assists: own.assists,
            deaths: own.deaths,
            maps: own.maps,
            rating: own.rating,
            kast: own.kast,
            adr: own.adr,
            season_after: human.team.shown_rating,
            season_before: human.team.shown_rating - elo_total,
            elo_total,
        },
        rating_board: board(by_rating, entry => ({rating: entry.rating})),
        kill_board: board(by_kills, entry => ({kills: entry.kills})),
        detail: matches,
    };
}

// 往生涯日志追加一条结构化条目；没有 io.log 的环境（如 check.cjs 的静默 io）退回逐行文字。
function emit_log(io, entry) {
    if (io.log) io.log(entry);
    else for (const line of entry.lines) io.write(line);
}

// 玩家参赛赛事的赛后总结：弹出二级窗口，日志里只留一条与其他逐日条目同样式的摘要。
// 其他运行环境（如 check.cjs 的静默 io）没有 io.summary，自动跳过窗口。
// payload 可由调用方预先算好传入（结算时要先存一份留给赛程滑块，避免重复生成）。
async function event_summary(summary, human, io, rating_before, date, payload) {
    if (payload === undefined) payload = event_summary_payload(summary, human);
    if (payload && io.summary) await io.summary(payload);

    const {event, teams, standings} = summary;
    const position = standings.indexOf(human.team) + 1;
    const result = placement_text(position, teams.length);
    const own = human.event_stats(event);
    const rating = own ? own.rating_sum / Math.max(1, own.maps) : 0;
    const delta = human.team.shown_rating - rating_before;
    const lines = [
        c(`${grade_label(event.grade)} · ${event.name}`, BOLD) + " · " + c(result, YELLOW) +
            `   记录 ${human.team.tour_wins}胜${human.team.tour_losses}负` +
            `   Rating ${c(rating.toFixed(2), rating_color(rating))}` +
            `   赛季积分 ${c(human.team.shown_rating, CYAN)} (${signed(delta)})`,
    ];
    if (result === "冠军") lines.push(c(`${STAR} ${human.age} 岁捧起 ${event.name} 冠军奖杯`, YELLOW + ";" + BOLD));
    if (event.is_major && result === "冠军") lines.push(c("*** Major 冠军! 这是生涯最高荣誉 ***", RED + ";" + BOLD));
    emit_log(io, {date, lines, kind: "match"});
}

// 实时名次：按当前赛季积分排序后玩家的位置。
function live_rank_of(world, team) {
    return world.standings().indexOf(team) + 1;
}

/* ==========================================================================
 * 年度总结 / 生涯战报：二级弹窗的数据快照
 * --------------------------------------------------------------------------
 * 与赛事总结一样只整理纯数据（不含 DOM），浏览器端由 app.js 的 io.season /
 * io.career 渲染；没有这两个通道的环境（如 check.cjs）退回文本输出。
 * ========================================================================== */

// 年度总结：队伍年终排名、本赛季数据、属性变化、世界 Top20 与玩家名次。
// ctx = {rank, move, start_attrs, start_value, will_retire}，由年末的 run_game 提供。
function season_payload(human, ranking, ctx) {
    const yr = human.yr_ratings;
    const rating = yr.length ? yr.reduce((sum, r) => sum + r, 0) / yr.length : 0;
    const stats = Object.values(human.ev_stats);
    const maps = stats.reduce((sum, item) => sum + item.maps, 0);
    const kills = stats.reduce((sum, item) => sum + item.kills, 0);
    const deaths = stats.reduce((sum, item) => sum + item.deaths, 0);
    const top_index = top20_rank(ranking, human);
    return {
        year: START_YEAR + human.year - 1,
        id: human.id, role: human.role, age: human.age,
        team: {
            name: human.team.name,
            league: LEAGUES[league_of(human.team.rank)].short,
            tier: TIERS[human.team.tier].name,
            rank: ctx.rank, move: ctx.move,
            points: human.team.shown_rating,
            wins: human.team.wins, losses: human.team.losses,
        },
        stats: {
            events: yr.length, maps,
            titles: human.yr_titles,
            rating,
            kd: kills / Math.max(1, deaths),
            adr: maps ? stats.reduce((sum, item) => sum + item.adr, 0) / maps : 0,
            kills, deaths,
            value: human.value(),
            value_delta: human.value() - ctx.start_value,
        },
        // 十四维属性的年度变化（事件与自然成长的合计）。
        attrs: ATTRS.map(([key, label]) => ({key, label, delta: human[key] - ctx.start_attrs[key]})),
        top20: {
            mine: top_index >= 0 ? top_index + 1 : null,
            list: ranking.map(([score, player_rating, player], index) => ({
                rank: index + 1,
                id: player.id,
                team: player.team ? player.team.name : "-",
                team_rank: player.team ? player.team.rank : null,
                role: player.role,
                age: player.age,
                rating: player_rating,
                score,
                honor: brief_honor(player.yr_honors),
                me: player === human,
            })),
        },
        // 本年结束后是否必然退役（年满 / 实力跌出 / 已点过退役）：决定弹窗里的按钮。
        must_retire: Boolean(ctx.will_retire),
    };
}

// 生涯战报：生涯概要、逐年时间线、冠军与赛事 MVP 荣誉室、退役原因。
function career_payload(human) {
    const [grade, title] = grade_of(human);
    const avg = human.rating_all.length
        ? human.rating_all.reduce((sum, r) => sum + r, 0) / human.rating_all.length
        : 0;
    // 荣誉室：冠军与其他荣誉 + 赛事 MVP，按年龄从新到旧混排。
    const honors = [
        ...human.honors.map(text => ({kind: "win", text})),
        ...human.mvps.map(text => ({kind: "mvp", text: `${text} MVP`})),
    ].sort((a, b) => parseInt(b.text, 10) - parseInt(a.text, 10));
    return {
        id: human.id, role: human.role, age: human.age,
        grade, title,
        seasons: human.year,
        age_start: 16, age_end: human.age,
        year_start: START_YEAR, year_end: START_YEAR + human.year - 1,
        events: human.history.reduce((sum, y) => sum + y.n, 0),
        maps: human.maps_all,
        peak: human.peak,
        overall: human.overall(),
        rating: avg,
        kd: human.kills_all / Math.max(1, human.deaths_all),
        kills: human.kills_all, deaths: human.deaths_all,
        titles: human.honors.filter(text => text.includes("冠军")).length,
        mvp_count: human.mvps.length,
        top20: human.top20_count, top1: human.top1_count,
        value: human.value(),
        timeline: human.history.map(y => ({
            year: y.year, age: y.age, team: y.team, tier: y.tier,
            rank: y.rank, events: y.n, titles: y.titles, rating: y.avg,
            honor: y.honors.length > 0,
        })),
        honors,
        retire_reason: human.retire_reason || "——",
    };
}

// —— 左栏常驻角色面板的数据快照 —— //
// 只负责把玩家当前的属性、状态、队伍与本赛季数据整理成纯对象，不接触任何 DOM；
// 浏览器端由 app.js 的 io.status 渲染，其他运行环境（如 check.cjs）没有该方法就静默跳过。
function status_snapshot(human, context = null) {
    const team = human.team;
    const world = human.world;
    const attrs = {};
    for (const key of ATTR_KEYS) attrs[key] = human[key];
    return {
        id: human.id,
        role: human.role,
        age: human.age,
        // 开局（human.year === 0）时赛季尚未开始，年份显示为起始年。
        year_label: START_YEAR + Math.max(human.year - 1, 0),
        overall: human.overall(),
        // peak 只在年末成长时更新，赛季中显示「迄今最高」才不会是 0。
        peak: Math.max(human.peak, human.overall()),
        team_name: team.name,
        league_short: LEAGUES[league_of(team.rank)].short,
        tier_name: TIERS[team.tier].name,
        world_rank: rank_of(team),
        form: human.form === undefined ? null : {
            index: human.form,
            name: FORM_STATES[human.form],
            mod_pct: Math.round(FORM_MOD[human.form] * 100),
            days: Math.max(0, Math.round(human.form_days)),
        },
        attrs,
        // 位置权重供渲染层标出「核心」属性（权重 ≥ 0.10）。
        role_weights: ROLES[human.role],
        value: human.value(),
        honors: human.honors.length,
        // 上场五人（含玩家，me 标记）与教练，用于右栏的「队伍成员」卡片。
        roster: lineup_of(team).map(player => ({
            id: player.id,
            age: player.age,
            role: player.role,
            overall: player.overall(),
            value: player.value(),
            me: player === human,
        })),
        coach: team.coach,
        // 磨合度与它对队伍实力的修正（0.10 表示 +10%），显示在「队伍成员」卡片标题行。
        chemistry: Math.round(team.chemistry),
        chem_bonus: chem_multiplier(team) - 1,
        // 今年赛程（右栏滑块）：已打完的站在前、未开赛的站在后，只有逐日循环带上 context.day
        // 时才有值。带上 day 就一定有数据，因此面板刷新不会再出现「本赛季已无比赛」的假空态。
        schedule: context && typeof context.day === "number" && world
            ? schedule_snapshot(human, context.day)
            : [],
        season: {
            points: team.shown_rating,
            rank: world ? live_rank_of(world, team) : team.rank,
            events: human.yr_ratings.length,
            maps: Object.values(human.ev_stats).reduce((sum, item) => sum + item.maps, 0),
        },
    };
}

// 唯一的守卫点：让 harness 无需感知可选的 io.status 通道。
function push_status(io, human, context = null) {
    if (io.status) io.status(status_snapshot(human, context));
}


// 排名表仅展示最有代表性的荣誉，优先级为 Major 冠军、Major 亚军、S 冠军、其他冠军。
function brief_honor(honors) {
    if (honors.some(([, grade, result]) => grade === "MAJOR" && result === "冠军")) return "Major 冠军";
    if (honors.some(([, grade, result]) => grade === "MAJOR" && result === "亚军")) return "Major 亚军";
    if (honors.some(([, grade, result]) => grade === "S" && result === "冠军")) return "S 级冠军";
    const champion = honors.find(([, , result]) => result === "冠军");
    return champion ? champion[0] + " 冠军" : "";
}

// 玩家转会先释放新队最低总评 NPC 的名单 ID，再补满旧队并接收玩家，保持五人阵容。
function move_to_team(world, p, new_team, rng) {
    const old_team = p.team;
    if (new_team === old_team) return null;
    const old_index = old_team.roster.indexOf(p);
    if (old_index >= 0) old_team.roster.splice(old_index, 1);
    if (new_team.roster.length >= 5) {
        const victim = new_team.roster.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        new_team.roster.splice(new_team.roster.indexOf(victim), 1);
        victim.retired = true;
        world.reserve_ids.push(victim.id);
        const index = world.players.indexOf(victim);
        if (index >= 0) world.players.splice(index, 1);
    }
    // 旧队因玩家离开空出一个位置，按玩家的位置补一名新人。
    world.gen_npc(old_team, p.role);
    new_team.roster.push(p);
    old_team.dirty = true;
    new_team.dirty = true;
    p.team = new_team;
    // 换队等于重建阵容：旧队回到中性基准，新队从「刚组建」再扣一次人员变动的磨合度。
    if (p.is_human) {
        old_team.chemistry = CHEM_START;
        new_team.chemistry = CHEM_START + CHEM_ROSTER_CHANGE;
    }
    return `${old_team.name} -> ${new_team.name} (${TIERS[new_team.tier].name})`;
}

// 事件转会按档位增量找队伍；合同剩余年限保持原值，不另开一份新合同。
// 只在同一联赛内找队伍，避免 VRS 战队与扩展联赛战队互相跳档。
function change_tier(p, delta, rng) {
    const tier = clamp(p.team.tier + delta, 0, TIERS.length - 1);
    if (tier === p.team.tier) return null;
    const candidates = p.world.teams.filter(t => t.tier === tier && t.league === p.team.league && t !== p.team);
    return candidates.length ? move_to_team(p.world, p, rng.choice(candidates), rng) : null;
}

// 转会邀约：候选队伍来自「相同或更高一档」，不越档也不降档，且同联赛内必有同档队伍，
// 因此玩家一旦接受就必定完成转会。联赛取 p.team.league（Player 本身没有 league 字段）。
function transfer_offer(p, rng) {
    const tiers = [p.team.tier, p.team.tier + 1].filter(t => t < TIERS.length);
    const candidates = p.world.teams.filter(t => t !== p.team && t.league === p.team.league && tiers.includes(t.tier));
    return candidates.length ? move_to_team(p.world, p, rng.choice(candidates), rng) : null;
}

// 特殊效果先结算，随后依次处理十四维属性；转职会记录赛季编号以控制冷却。
// 属性变化缩放后取整并限制到 1～99。
function apply_effects(p, fx, rng, lines) {
    if ("buff" in fx) {
        p.buff += fx.buff;
        lines.push(`本场临场状态加成 +${round(fx.buff * 100)}%`);
    }
    if (fx.injured) {
        p.injured = true;
        lines.push("带上了伤病");
    }
    if ("role" in fx && fx.role !== p.role) {
        lines.push(`转职: ${p.role} -> ${fx.role}`);
        p.role = fx.role;
        p.last_role_year = p.year;
    }
    if ("tier" in fx) {
        const message = change_tier(p, fx.tier, rng);
        if (message) lines.push("转会: " + message);
    }
    if (fx.transfer) {
        const message = transfer_offer(p, rng);
        if (message) lines.push("转会: " + message);
    }
    // 磨合度走的是队级数值，不乘 EVENT_SCALE 与位置系数（那是给十四维属性用的）。
    if ("chem" in fx) {
        const before = p.team.chemistry;
        adjust_chemistry(p.team, rng.randint(...fx.chem));
        const delta = round(p.team.chemistry - before);
        if (delta) lines.push("磨合度 " + signed(delta) + "%");
    }
    for (const [key, label] of ATTRS) {
        if (!(key in fx)) continue;
        // 位置越看重该属性，事件带来的成长越多；再乘统一的成长系数。
        const delta = round(rng.randint(...fx[key]) * EVENT_SCALE * role_attr_factor(p.role, key));
        p[key] = clamp(p[key] + delta, 1, 99);
        if (delta) lines.push(label + " " + signed(delta));
    }
    apply_attribute_floors(p);
    invalidate(p);
}

// 把事件选项的 fx 转成事件卡上的方向标签：只标注在当前位置上「缩放取整后仍可能变化」的属性，
// 避免界面标了却实际不涨。tone 为 up / down / both / neutral，供渲染层上色。
function option_hint(fx, role) {
    const hints = [];
    if ("role" in fx && fx.role !== role) hints.push({text: "转职 " + fx.role, tone: "neutral"});
    if ("tier" in fx) hints.push({text: fx.tier > 0 ? "转会升档" : "转会降档", tone: "neutral"});
    if (fx.transfer) hints.push({text: "转会同档或升档", tone: "neutral"});
    if ("buff" in fx) hints.push({text: "临场 +" + round(fx.buff * 100) + "%", tone: "neutral"});
    if ("chem" in fx) {
        const up = fx.chem[1] > 0, down = fx.chem[0] < 0;
        hints.push({text: "磨合度" + (up && down ? " ±" : up ? " ↑" : " ↓"), tone: up && down ? "both" : up ? "up" : "down"});
    }
    if (fx.injured) hints.push({text: "伤病风险", tone: "neutral"});
    for (const [key, label] of ATTRS) {
        if (!(key in fx)) continue;
        const factor = EVENT_SCALE * role_attr_factor(role, key);
        const up = round(fx[key][1] * factor) > 0;
        const down = round(fx[key][0] * factor) < 0;
        if (!up && !down) continue;
        const tone = up && down ? "both" : up ? "up" : "down";
        hints.push({text: label + (up && down ? " ±" : up ? " ↑" : " ↓"), tone});
    }
    return hints;
}

// 先筛触发条件与同年去重，再按权重累加抽样；所有可用事件用完后才允许同年重复。
function draw_event(p, rng, upcoming_major, used_ids) {
    let pool = EVENTS.filter(e => e.cond(p, upcoming_major) && !used_ids.has(e.id));
    if (!pool.length) pool = EVENTS.filter(e => e.cond(p, upcoming_major));
    if (!pool.length) return null;
    const roll = rng.random() * pool.reduce((sum, e) => sum + e.weight, 0);
    let cumulative = 0;
    for (const event of pool) {
        cumulative += event.weight;
        if (roll < cumulative) return event;
    }
    return pool[pool.length - 1];
}

// 选择接口返回从零开始的索引，或 RETIRE（玩家在等待点点了「退役」）。
// 自动模式仅使用随机数并写日志；非自动模式下事件标题、说明与选项（含属性方向标签）交给渲染层的事件卡呈现。
async function present_event(event, p, auto, rng, io, date = null) {
    if (auto) {
        io.write();
        io.write((date ? c(date_label(date) + "  ", DIM) : "") + c("【事件】" + event.title, YELLOW + ";" + BOLD));
        io.write("  " + event.desc);
        event.options.forEach((option, i) => io.write(`   ${i + 1}. ${option.text}`));
        const index = rng.randint(0, event.options.length - 1);
        io.write(c("   -> 自动选择: " + event.options[index].text, DIM));
        return index;
    }
    return io.choose("请选择你的行动", event.options.map(option => option.text),
        {kind: "event", title: event.title, desc: event.desc, allow_retire: true,
         hints: event.options.map(option => option_hint(option.fx, p.role))});
}

// 同一年龄阶段对全部属性采用相同成长规则；29 岁起身体类衰退、意识/心态类仍缓慢增长。
// 伤病在年末额外扣预瞄并清除，不持续影响下一年；成长后套一遍属性保底并更新峰值。
function growth(p, rng) {
    const g = (low, high) => Math.max(1, round(rng.randint(low, high)));
    if (p.age <= 21) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + g(3, 6), 1, 99);
    } else if (p.age <= 26) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + g(1, 4), 1, 99);
    } else if (p.age <= 28) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + rng.randint(0, 2), 1, 99);
    } else {
        for (const key of ATTR_DECLINE) p[key] = clamp(p[key] - rng.randint(3, 6), 1, 99);
        for (const key of ATTR_GROWTH_LATE) p[key] = clamp(p[key] + rng.randint(0, 1), 1, 99);
    }
    if (p.injured) {
        p.preaim = clamp(p.preaim - rng.randint(1, 3), 1, 99);
        p.injured = false;
    }
    apply_attribute_floors(p);
    invalidate(p);
    p.peak = Math.max(p.peak, p.overall());
}

// 角色状态持续时间：稳定性越高，好状态（≥4）越久、差状态（≤2）越短；下限 3 天。
function form_duration(state, stab) {
    const base = FORM_BASE_DAYS[state];
    const factor = state >= 4 ? 1 + 0.6 * stab : state <= 2 ? 1 - 0.6 * stab : 1;
    return Math.max(3, Math.round(base * factor));
}

// 角色状态刷新（每周或每个比赛阶段一次）：扣掉一个更新周期，到期后最多移动一档。
// 方向由两股力共同决定：稳定性越高越偏向上；离「普通」越远越容易被拉回，避免卡在顶部或底部。
function update_form(p, rng) {
    if (p.form === undefined) return;
    p.form_days -= FORM_TICK_DAYS;
    if (p.form_days > 0) return;
    const stab = clamp((p.stability - 50) / 50, -1, 1);
    const dist = p.form - FORM_NEUTRAL;
    const up = clamp(0.30 + 0.18 * stab - 0.10 * dist, 0.05, 0.6);
    const down = clamp(0.30 - 0.18 * stab + 0.10 * dist, 0.05, 0.6);
    const roll = rng.random();
    if (roll < up) p.form = Math.min(FORM_STATES.length - 1, p.form + 1);
    else if (roll < up + down) p.form = Math.max(0, p.form - 1);
    p.form_days = form_duration(p.form, stab);
}

// 状态对个人表现的系数：无状态（NPC）视为 1。
function form_multiplier(p) {
    return p.form === undefined ? 1 : 1 + FORM_MOD[p.form];
}

// 球队中带状态选手（目前只有玩家）对其整体实力的修正，使状态影响胜负。
function team_form_bonus(team) {
    let bonus = 0;
    for (const player of team.roster) {
        if (player.form === undefined) continue;
        bonus += player.overall() * FORM_MOD[player.form];
    }
    return bonus;
}

/* ==========================================================================
 * 队伍磨合度：0～300，100 是「刚组建的阵容」的中性基准
 * --------------------------------------------------------------------------
 * 与状态（form）同构的一点是「只有玩家所在队伍真正参与」：NPC 队伍恒为 100，
 * 修正系数 1.00，因此这套系统不扰动已经校准好的 NPC 世界与名次分布。
 * 玩家队伍靠打比赛累积（练习赛与正式赛都算，赢得多涨得快），人员进出会把它打下去。
 * ========================================================================== */

const CHEM_START = 100;         // 刚组建的阵容：中性基准
const CHEM_MAX = 300;           // 上限
const CHEM_PER_100 = 0.05;      // 每 100 点磨合度折算 ±5% 队伍实力
const CHEM_WIN = 2.5;           // 赢一场系列赛
const CHEM_LOSS = 0.5;          // 输一场也有一点（赢球才磨得出来，输球几乎是白打）
const CHEM_ROSTER_CHANGE = -15; // 队内有人进出一次
const CHEM_COACH_CHANGE = -10;  // 教练更换一次
const CHEM_SOFT_FROM = 150;     // 超过这个值后增益线性衰减，300 时归零

// 磨合度对队伍实力（胜负）与队内每名选手表现（数据）的统一系数。
// 100 → 1.00，300 → 1.10，0 → 0.95。
function chem_multiplier(team) {
    return 1 + (clamp(team.chemistry, 0, CHEM_MAX) - CHEM_START) / 100 * CHEM_PER_100;
}

// 越接近上限越难再涨：150 以下全额，之后线性衰减到 300 时归零。
// 没有这一层，一个赛季 70 场比赛就会把队伍顶到 300 并永久静止。
function chem_gain_scale(chemistry) {
    if (chemistry <= CHEM_SOFT_FROM) return 1;
    return Math.max(0, (CHEM_MAX - chemistry) / (CHEM_MAX - CHEM_SOFT_FROM));
}

function adjust_chemistry(team, delta) {
    team.chemistry = clamp(team.chemistry + delta, 0, CHEM_MAX);
}

// 只有玩家所在队伍才累积磨合度，NPC 队伍保持中性。
function human_team(team) {
    return team.roster.some(player => player.is_human);
}

function note_roster_change(team) {
    if (human_team(team)) adjust_chemistry(team, CHEM_ROSTER_CHANGE);
}

function note_coach_change(team) {
    if (human_team(team)) adjust_chemistry(team, CHEM_COACH_CHANGE);
}

// 一场系列赛结束后的磨合度结算，由 simulate_series 统一调用（练习赛走同一条路）。
function note_series_result(team, win) {
    if (!human_team(team)) return;
    const base = win ? CHEM_WIN : CHEM_LOSS;
    adjust_chemistry(team, base * chem_gain_scale(team.chemistry));
}

/* ==========================================================================
 * 练习赛：空闲周抽一支同档位的队伍打一场 Bo3
 * --------------------------------------------------------------------------
 * 每周在空闲日触发一次。它**不影响赛季积分与排名**，也不进赛季数据，唯一的世界影响是
 * 赛后按「本场个人 Rating 相对年内平均 Rating」的偏离对状态做一次微调（打得好回升、打得差下滑）。
 * 战后只在生涯日志里留一行摘要（`play_practice_match`），不弹战报窗口。
 * ========================================================================== */

// 练习赛的级别模板：只借用 GRADE_CFG 的 Rating 波动幅度，不参与任何名额、分档或积分结算。
const PRACTICE_GRADE = "B";
// 状态微调的判定带：本场 Rating 比年内均值高出 / 低于这个幅度才移动一档，避免随机波动把状态抖来抖去。
const PRACTICE_FORM_BAND = 0.10;

// 对手抽取：与玩家队伍**同档位**（同一名次区间，同一联赛）的其它队伍里随机一支。
// 档位由引用期名次推出，因此抽出来的对手实力与玩家队伍同一量级。
function practice_opponent(world, team, rng) {
    const pool = world.teams.filter(other => other !== team && other.tier === team.tier);
    return pool.length ? rng.choice(pool) : null;
}

// 年内平均 Rating（练习赛的基准线）：取本赛季已出场站次的 Rating 均值；
// 赛季初还没有记录时退回生涯平均（同样为空则返回 0，调用方据此跳过调整）。
function year_rating_baseline(p) {
    const yr = p.yr_ratings;
    if (yr.length) return yr.reduce((sum, r) => sum + r, 0) / yr.length;
    return p.career_rating() || 0;
}

// 状态微调：rating 明显高于基准升一档、明显低于基准降一档，最多移动一档（与 update_form 同规）。
// 状态持续天数按新状态重算，稳定性的影响与常规刷新一致。返回实际移动的档数。
function adjust_form_by_practice(p, rating, baseline) {
    if (p.form === undefined || !rating || !baseline) return 0;
    const diff = rating - baseline;
    const delta = diff >= PRACTICE_FORM_BAND ? 1 : diff <= -PRACTICE_FORM_BAND ? -1 : 0;
    if (!delta) return 0;
    const next = clamp(p.form + delta, 0, FORM_STATES.length - 1);
    if (next === p.form) return 0;
    p.form = next;
    p.form_days = form_duration(p.form, clamp((p.stability - 50) / 50, -1, 1));
    return delta;
}

// 一周一场练习赛：结算后只在生涯日志里留一行摘要（不弹战报窗口）。
// 逐图统计只为算本场个人 Rating 服务，跑完立刻清掉，避免污染赛季数据（地图数、击杀、均值与 Top20）。
async function play_practice_match(human, rng, io, day, date) {
    const opponent = practice_opponent(human.world, human.team, rng);
    if (!opponent) return;
    const year = START_YEAR + human.year - 1;
    const event = {key: `practice-${year}-${day}`, name: "练习赛", grade: PRACTICE_GRADE, is_major: false};
    const sink = [];
    const result = simulate_series(human.team, opponent, event, rng, new Map(), 3, true, sink);
    for (const team of [human.team, opponent]) {
        for (const player of lineup_of(team)) delete player.ev_stats[event.key];
    }
    // 本场个人 Rating：逐图数据的平均（与赛事结算同一口径）。
    let sum = 0;
    let maps = 0;
    for (const record of sink) {
        for (const item of record.lines) {
            if (item.player !== human) continue;
            sum += item.line.rating;
            maps += 1;
        }
    }
    const rating = maps ? sum / maps : 0;
    const move = adjust_form_by_practice(human, rating, year_rating_baseline(human));

    const won = result.winner === human.team;
    const score = `${result.a_wins}:${result.b_wins}`;
    const arrow = move > 0 ? "↑" : move < 0 ? "↓" : "";
    emit_log(io, {
        date: date_md(date),
        kind: "match",
        lines: [
            c("【练习赛】", YELLOW + ";" + BOLD) + c(human.team.name, CYAN) +
                (won ? c(` 战胜 ${opponent.name}`, GREEN) : c(` 负于 ${opponent.name}`, RED)) +
                c(`  (${score})`, DIM) +
                `   Rating ${c(rating.toFixed(2), rating_color(rating))}` +
                (arrow ? c(`  状态${arrow}`, move > 0 ? GREEN : RED) : ""),
        ],
    });
}

// 年初固定玩家赛程：全部主赛站都会出现在赛历上（没名额的站只显示日期与冠军播报），
// 另外补上同期玩家有资格参加的地区赛。赛程只算一次，年中转会不改当季名额。
function human_year_plan(human) {
    const world = human.world;
    // 资格按每站自己的引用期名次判定，而不是一套名次管全年：赛季中打出的成绩会改变后面站点的
    // 参赛权。引用期未到的站点，取到的是「按当下名次推断」的名次，因此这张表在赛季推进中会变。
    const invited = event => event_allows(event, world.entry_rank_at(human.team, event));
    const plan = [];
    const busy = new Set();
    // 先排主赛：同一天只可能有一站主赛，日程天然互斥。
    for (const event of ANNUAL_CALENDAR) {
        if (event.circuit !== "main") continue;
        const plays = invited(event);
        if (plays) busy.add(event.start_day);
        plan.push({event, plays});
    }
    // 再排地区赛：同一天已经打主赛的队伍不能再打地区赛（R5：同一天不承担两场官方赛事）。
    for (const event of ANNUAL_CALENDAR) {
        if (event.circuit !== "regional") continue;
        if (!invited(event) || busy.has(event.start_day)) continue;
        plan.push({event, plays: true});
    }
    return plan.sort((a, b) => a.event.start_day - b.event.start_day);
}

// 今年的赛程滑块数据：玩家实际参加的站（含已打完的），按开赛日升序。
// 已打完的站给出名次与报告入口（human.yr_reports），未开赛的站给出资格状态与依据名次。
// 资格同样按各站引用期名次现算，因此名次一变，这张表里的「可参加」集合就会跟着变。
function schedule_snapshot(human, day) {
    const world = human.world;
    const year = START_YEAR + human.year - 1;
    const list = human_year_plan(human)
        .filter(item => item.plays)
        .map(item => schedule_row(human, world, year, item.event, day));
    // 兜底：报告在手却不在当前赛程里的站（正常不该出现），也补进滑块，保证打完的站不会凭空消失。
    const seen = new Set(list.map(item => item.key));
    for (const key of Object.keys(human.yr_reports)) {
        if (seen.has(key)) continue;
        const event = ANNUAL_CALENDAR.find(item => item.key === key);
        if (event) list.push(schedule_row(human, world, year, event, day));
    }
    return list.sort((a, b) => a.start_day - b.start_day);
}

// 一站的一行：已打完看报告，未开赛看资格。
function schedule_row(human, world, year, event, day) {
    const from = date_short(game_date(year, event.start_day));
    const to = date_short(game_date(year, event.end_day));
    const row = {
        key: event.key,
        name: event.name,
        tier: grade_label(event.grade),
        from, to,
        start_day: event.start_day,
    };
    // 「已打完」以报告为准；报告缺失（异常兜底）时按赛期是否已过判定，宁可少给一个报告入口，
    // 也不能把打完的站当成「未开赛」留在滑块里。
    const report = human.yr_reports[event.key] || null;
    if (report || event.end_day < day) {
        return {
            ...row, played: true,
            place: report ? report.you.placement : "已结束",
            rating: report ? report.you.rating : null,
            season_delta: report ? report.you.elo_total : 0,
            report,
        };
    }
    // 资格状态：引用期（开赛日前 4 周）一过这一站才定死；在那之前显示的只是按当下名次做的推断。
    return {
        ...row, played: false,
        days: event.start_day - day,
        locked: reference_day(event.start_day) <= day,
        ref_label: date_short(game_date(year, reference_day(event.start_day))),
        entry_rank: world ? world.entry_rank_at(human.team, event) : human.team.rank,
    };
}

// 尚未开赛、玩家又有资格的站，按开赛日升序（human_year_plan 已排好序）。
function upcoming_matches(human, day) {
    return human_year_plan(human).filter(item => item.plays && item.event.start_day > day);
}

// 「可参加赛事」集合的变化：新增（名次够上了）、失去（名次掉出去了）、锁定（引用期已过，资格定死）。
// 只关心尚未开赛的站：已开赛的站只是从「未来」挪进「已结束」，仍留在表里，不算「失去资格」。
function diff_schedule(prev, next) {
    const before = new Map(prev.map(item => [item.key, item]));
    const after = new Map(next.map(item => [item.key, item]));
    return {
        added: next.filter(item => !item.played && !before.has(item.key)),
        locked: next.filter(item => !item.played && before.has(item.key)
            && !before.get(item.key).locked && item.locked),
        lost: prev.filter(item => !item.played && !after.has(item.key)),
    };
}

// 赛程播报文案。名次用当前实时排名（资格推断的依据），锁定播报改用该站引用期的名次。
function schedule_notice_lines(change, kind, rank) {
    const when = item => `比赛日期 ${item.from} -- ${item.to}`;
    return change.map(item => {
        const name = c(item.name, CYAN);
        if (kind === "added") {
            return `根据当前排名战队排名 #${rank}，可参加 ${name}，${when(item)}，名额将在引用期 ${item.ref_label} 确定`;
        }
        if (kind === "lost") {
            return `根据当前排名战队排名 #${rank}，已失去 ${name} 的参赛资格（${when(item)}）`;
        }
        return `你所在战队已锁定 ${name} 参赛名额（${when(item)}，引用期 ${item.ref_label} 世界 #${item.entry_rank}）`;
    });
}

// 本站的参赛队伍：主赛先按引用期名次取直邀，再从预选区间补齐；地区赛按档位优先，
// 档内不足 30 队时按名次从同期没有主赛名额的队伍里补足，保证每站都是完整规模。
// 玩家所属队伍若没有名额则不参赛，赛事照常由 NPC 打完。
function event_participants(world, event, human, human_plays) {
    // 先把本站引用期的名次落到队伍上，名单筛选、补位与后面的种子排序才有同一个口径。
    world.apply_entry_ranks(event);
    return build_participants(world, event, human, human_plays, null);
}

// 除玩家外的参赛队伍：与 event_participants 同一套名额逻辑，只是把玩家队伍排除在外，
// 因此玩家没亲自打的那一站仍会由 NPC 完整模拟。
function world_participants(world, event, exclude) {
    world.apply_entry_ranks(event);
    return build_participants(world, event, null, false, exclude);
}

function build_participants(world, event, human, human_plays, exclude) {
    const usable = team => team.roster.length && team !== exclude;
    const pool = world.teams.filter(team => usable(team) && team_invited(team, event));
    pool.sort((a, b) => rank_of(a) - rank_of(b));
    const direct = pool.slice(0, event.teams);
    if (direct.length < event.teams) {
        // 补位：主赛从自己的预选区间补（qual_draw）；地区赛只从「本档位及更差名次」里按名次补，
        // 因此高名次队伍不会再被拉进低档地区赛；同一天已有主赛名额的队伍一律不参与补位。
        const extra = world.teams.filter(team => usable(team)
            && !direct.includes(team)
            && (event.circuit === "regional"
                ? !in_main_that_day(team, event) && rank_of(team) >= event.draw[0]
                : Boolean(event.qual_draw)
                    && rank_of(team) >= event.qual_draw[0] && rank_of(team) <= event.qual_draw[1]));
        extra.sort((a, b) => rank_of(a) - rank_of(b));
        for (const team of extra) {
            if (direct.length >= event.teams) break;
            direct.push(team);
        }
    }
    if (human_plays && !direct.includes(human.team)) {
        if (direct.length >= event.teams) direct.pop();
        direct.push(human.team);
    }
    return direct;
}

// 同一天是否已经拿到主赛名额：用于地区赛补位，保证「同一天不打两场官方赛事」。
function in_main_that_day(team, event) {
    const host = ANNUAL_CALENDAR.find(item => item.circuit === "main" && item.start_day === event.start_day);
    return Boolean(host) && team_invited(team, host, 0);
}

// 玩家没有亲自参赛的站点由世界模拟：NPC 自己打完，积分与个人数据照常结算。
function world_station(world, event, rng, exclude) {
    return run_tournament(world_participants(world, event, exclude), event, rng, new Map());
}

// —— 玩家参赛赛事：分阶段模拟（阶梯瑞士轮/小组赛逐日推进，淘汰赛逐日逐轮）—— //
// 阶段排期：
//   major（Major/S 级）—— 三阶段阶梯瑞士轮，每阶段 5 轮，按真实 Major 的「一天两轮」压在赛事前 9 天
//     （R1–R2 / R3–R4 / R5 各占一天，三个阶段依次排开），8 强淘汰赛 3 轮压在末段（决赛落收官日周日）；
//   其余赛制 —— 小组赛/瑞士轮一次跑完安排在开赛日，淘汰赛同样压在末段。
function player_event_stages(event) {
    const stages = [];
    if (event.format === "major") {
        // 锁线规则保证 16 队必然在 5 轮内全部决出 3 胜 / 3 负，因此每阶段固定 5 轮、一天两轮。
        for (let s = 0; s < LADDER_STAGES.length; s++) {
            for (let r = 0; r < 5; r++) {
                stages.push({kind: "swiss", stage: s, round: r, day: event.start_day + s * 3 + (r >> 1)});
            }
        }
    } else {
        stages.push({kind: "group", day: event.start_day});
    }
    for (let j = 0; j < 3; j++) stages.push({kind: "round", day: event.end_day - (2 - j)});
    return stages;
}

// 玩家参赛时建站：清空本站战绩、排好参赛名单与阶段表。小组赛/阶梯瑞士轮在 step_player_event 里推进。
function start_player_event(world, event, human) {
    const teams = event_participants(world, event, human, true);
    for (const team of teams) {
        team.tour_wins = 0;
        team.tour_losses = 0;
    }
    // 本站逐场逐图明细的落点：play_series 只认带 event_log 的队伍，因此只有玩家队伍会被采集。
    human.team.event_log = [];
    return {
        event, teams, field: event_field(teams, event), bracket: new Map(),
        alive: null, rest: null, stages: player_event_stages(event), stageIdx: 0,
        ladder: event.format === "major" ? make_ladder(teams) : null,
    };
}

// 玩家在阶梯里的入口阶段：按直邀名次决定从哪一组打起。
function ladder_entry_stage(ladder, team) {
    if (ladder.competitor.includes(team)) return 0;
    if (ladder.challenger.includes(team)) return 1;
    return 2;
}

// 推进阶梯瑞士轮一轮；阶段结束就把 8 支出线队并入下一阶段，最后一阶段出线者进八强。
// slot 是 player_event_stages 排好的 {stage, round} 轮次条目。
function step_ladder(state, slot, human, rng, buff) {
    const ladder = state.ladder;
    const entry = ladder_entry_stage(ladder, human.team);
    const out = {
        kind: "swiss", matches: [], stage_name: LADDER_STAGES[slot.stage],
        stage_advancing: [], stage_finished: false, finished: false, waiting: null,
        next_stage: LADDER_STAGES[slot.stage + 1] || null,
        entry_stage: entry,
        // 玩家的阶段是否已经开始：直邀挑战组/传奇组的队伍在前面的阶段只是旁观，不能算「止步」。
        player_in_stage: entry <= slot.stage,
        player_out: false,
    };
    // 阶段已经结束（每阶段固定 5 轮，这里是防御性兜底）：该轮次空过，世界不推进。
    if (ladder.done || slot.stage < ladder.stage) return out;
    if (slot.round === 0 && entry > slot.stage) {
        // 直邀队在自己的阶段开打前只做等待播报，世界照常推进。
        out.waiting = `${LADDER_STAGES[entry]}直邀：等待${LADDER_STAGES[slot.stage]}结果`;
    }
    const info = ladder_round(ladder, state.event, rng, buff, true);
    out.matches = info.matches;
    out.stage_name = info.stage_name;
    out.stage_finished = info.stage_finished;
    out.stage_advancing = info.stage_advancing;
    out.finished = info.finished;
    out.player_out = info.stage_finished && out.player_in_stage
        && !out.stage_advancing.includes(human.team);
    if (info.finished) {
        state.alive = ladder.advancing;
        state.rest = ladder.rest;
    }
    return out;
}

// 推进一个阶段：swiss 打一轮阶梯瑞士轮，group 跑完小组赛/瑞士轮，round 打一轮淘汰赛。
function step_player_event(state, stage, human, rng, buff) {
    const {event, teams} = state;
    if (stage.kind === "swiss") return step_ladder(state, stage, human, rng, buff);
    if (stage.kind === "group") {
        const result = (event.format === "regional")
            ? play_swiss(teams, event, rng, buff, true)
            : play_groups(make_groups(teams, event.groups, rng), event, rng, buff, true);
        state.alive = result.advancing;
        state.rest = result.rest;
        return {kind: "group", advancing: result.advancing};
    }
    const size = state.alive.length;
    const {next, eliminated, matches} = play_bracket_round(state.alive, event, rng, buff, true);
    for (const [team, rank] of eliminated) state.bracket.set(team, rank);
    state.alive = next;
    if (state.alive.length === 1) state.bracket.set(state.alive[0], 1);
    return {kind: "round", size, eliminated, matches, alive: state.alive};
}

// 玩家已出局或赛事已打完：把剩余阶段与淘汰赛一次跑完，交给 finalize_event 结算。
function finish_player_event(state, rng, buff) {
    if (state.ladder) {
        drain_ladder(state.ladder, state.event, rng, buff, true);
        // 只有还没进淘汰赛（阶梯刚跑完）时才从阶梯结果起手。已经打过淘汰赛就不能重置对阵表，
        // 否则会把四分之一决赛重打一遍，输过的队伍又能复活。
        if (!state.alive) {
            state.alive = state.ladder.advancing;
            state.rest = state.ladder.rest;
        }
    }
    while (state.alive && state.alive.length > 1) {
        const {next, eliminated} = play_bracket_round(state.alive, state.event, rng, buff, true);
        for (const [team, rank] of eliminated) state.bracket.set(team, rank);
        state.alive = next;
    }
    if (state.alive && state.alive.length === 1) state.bracket.set(state.alive[0], 1);
    return finalize_event(state.event, state.teams, state.field, state.bracket, state.rest, rng);
}

// 小组赛/阶梯瑞士轮名次：前 8 名就是晋级顺序，其余按战绩表排在 8 名之后。
// rest 里装的是带 .team 的战绩条目（阶梯瑞士轮、瑞士轮与小组赛都一样），所以两种形态都要认。
function group_rank(state, team) {
    const index = state.alive.indexOf(team);
    if (index >= 0) return index + 1;
    const rest = state.rest.findIndex(entry => (entry.team || entry) === team);
    return rest >= 0 ? 8 + rest + 1 : null;
}

// 淘汰赛轮次名：所有赛制都收敛到 8 强，因此只会出现 8/4/2 三种规模。
function round_name(size) {
    return ({8: "四分之一决赛", 4: "半决赛", 2: "决赛"})[size] || `${size} 强赛`;
}

// 结算玩家参赛赛事：弹出总结窗口，返回最终名次标签。
async function settle_player_event(summary, human, io, rating_before, date) {
    const position = summary.standings.indexOf(human.team) + 1;
    const result = placement_text(position, summary.teams.length);
    // 本站 MVP：全场 Rating 最高者。玩家拿到就记一笔，年末并入生涯荣誉室。
    const {by_rating} = event_leaders(summary);
    if (by_rating.length && by_rating[0].player === human) human.yr_mvps.push(summary.event.name);
    // 报告留到年末：右栏赛程滑块上已打完的站要能重新打开。窗口与留存共用同一份 payload。
    const payload = event_summary_payload(summary, human);
    if (payload) human.yr_reports[summary.event.key] = payload;
    await event_summary(summary, human, io, rating_before, date, payload);
    return result;
}

// 逐日推进玩家的一年：全年 350 天，玩家参赛的站点走分阶段模拟，其余站点静默模拟。
// 空闲时段每满一周落地一次日志并暂停等待玩家点继续；模拟动画由 io.simulate 呈现。
async function play_human_year(human, rng, auto, io) {
    const world = human.world;
    const year = START_YEAR + human.year - 1;
    // 赛程用于抬头展示，取的是赛季初名次下的预估（那时还没有本赛季名次快照）。
    // 实际参赛资格在每站开赛时按引用期名次现算，因此赛季中的成绩变化会让实际打的站与这里不同。
    const plan = human_year_plan(human);
    const plays = plan.filter(item => item.plays);
    const a_events = plays.filter(item => item.event.grade === "A").length;
    const s_events = plays.filter(item => item.event.grade === "S" || item.event.is_major).length;

    // 逐日日志缓冲：条目（日期 + 内容 + 类型）攒起来，模拟动画跑完再一次性交给渲染层。
    let entries = [];
    let seg_days = [];
    let idle = null;               // 空闲段的起止日
    let ui_day = 0;                // 带给模拟动画的赛季进度（右栏顶部进度条）
    const push_entry = (date, lines, kind) => entries.push({date, lines, kind});
    const write_line = (day, text) => {
        seg_days.push(date_short(game_date(year, day)));
        push_entry(date_md(game_date(year, day)), [text], "match");
    };
    const commit_idle = () => {
        if (!idle) return;
        // 日志日期列用「M/D」或「M/D – M/D」；模拟动画仍用带年份的 date_short。
        const label = idle.from === idle.to
            ? date_md(game_date(year, idle.from))
            : `${date_md(game_date(year, idle.from))} – ${date_md(game_date(year, idle.to))}`;
        for (let day = idle.from; day <= idle.to; day++) seg_days.push(date_short(game_date(year, day)));
        push_entry(label, [c("无事发生", DIM)], "idle");
        idle = null;
    };
    const flush = async () => {
        if (!entries.length) return;
        if (io.simulate) await io.simulate(seg_days.slice(), {year, day: ui_day, total: SEASON_DAYS});
        for (const entry of entries) emit_log(io, entry);
        entries = [];
        seg_days = [];
    };
    // 下一场比赛：本赛季还没打的、自己有资格的最近一站（用于事件抽取时的级别判断）。
    // 每站资格同样按引用期名次现算，所以赛季中打出的成绩会实时反映到这张卡片上。
    const next_match = day => upcoming_matches(human, day)[0] || null;

    // 赛程播报：把「可参加赛事」集合的变化（新增 / 失去 / 锁定）写进生涯日志。
    // 上一次的集合存在 last_schedule 里，只在暂停点与赛事结算后对比一次，同一天的几条合并落地。
    let last_schedule = null;
    const broadcast_schedule = async day => {
        const next = schedule_snapshot(human, day);
        if (last_schedule) {
            const rank = live_rank_of(world, human.team);
            const change = diff_schedule(last_schedule, next);
            for (const kind of ["added", "lost", "locked"]) {
                for (const line of schedule_notice_lines(change[kind], kind, rank)) {
                    push_entry(date_md(game_date(year, day)), [line], "notice");
                }
            }
        }
        last_schedule = next;
        await flush();
    };

    // 年份抬头先落地，再刷新一次面板。
    push_entry(String(year), [
        c(`${year} 年 · ${human.age} 岁`, BOLD) + "   " + c(human.team.name, CYAN) +
            c(`  [${LEAGUES[league_of(human.team.rank)].short} ${TIERS[human.tier_index].name}]`, DIM),
        `位置 ${c(human.role, MAGENTA)}   合同 ${Math.max(human.contract_left, 0)} 年   ` +
            `赛季初 世界 #${c(rank_of(human.team), YELLOW)}   预计 ${c(plays.length, YELLOW)} 站` +
            ` (Major/S ${s_events} 站 · A 级 ${a_events} 站) · 资格按各站赛前 4 周排名确定`,
    ], "year");
    await flush();
    // 年初的赛程作为比较基准静默记下，不把整年初始赛程当成「新增」刷屏。
    last_schedule = schedule_snapshot(human, 0);
    push_status(io, human, {day: 0});

    // 全年所有站点按开赛日归档；玩家参赛的站点分阶段模拟，其余站点静默模拟，保证世界照常结算。
    const stations_by_start = new Map();
    for (const event of ANNUAL_CALENDAR) {
        if (!stations_by_start.has(event.start_day)) stations_by_start.set(event.start_day, []);
        stations_by_start.get(event.start_day).push(event);
    }
    const used_ids = new Set();

    let active = null;              // 玩家当前赛事的分阶段状态
    let active_buff = new Map();

    for (let day = 1; day <= SEASON_DAYS; day++) {
        ui_day = day;
        const date = game_date(year, day);
        // —— 当天开赛的站点 —— //
        // 同一天不承担两场官方赛事（R5）：主赛在地区赛前面，当天已经接下主赛就不再接地区赛。
        let taken_today = false;
        for (const event of stations_by_start.get(day) || []) {
            // 本站资格按引用期名次现算：赛季中打出的成绩会改变后面站点的参赛权。
            // 引用期一过这一站就定死，之后再怎么升降都不再影响它。
            world.apply_entry_ranks(event);
            if (!taken_today && team_invited(human.team, event)) {
                taken_today = true;
                active = start_player_event(world, event, human);
                active_buff = human.buff ? new Map([[human.team, human.buff * 50]]) : new Map();
                human.buff = 0;
            } else {
                world_station(world, event, rng, human.team);
            }
        }

        // —— 玩家赛事的阶段日：阶梯瑞士轮/小组赛逐日推进（阶梯一天两轮），淘汰赛逐日一轮 —— //
        // 同一天可能排了两个轮次，因此把当天的阶段条目逐个消费完。
        let acted = false;
        while (active) {
            const stage = active.stages[active.stageIdx];
            if (!stage || stage.day !== day) break;
            acted = true;
            active.stageIdx += 1;
            commit_idle();
            // 比赛时按阶段刷新角色状态，状态影响本阶段的个人表现与球队实力。
            update_form(human, rng);
            const rating_before = human.team.shown_rating;
            let summary = null;
            if (stage.kind === "swiss") {
                // 三阶段阶梯瑞士轮（Major / S 级）：每轮输出玩家本场，阶段结束播报出线名单。
                const info = step_player_event(active, stage, human, rng, active_buff);
                const match = info.matches.find(item => item.a === human.team || item.b === human.team);
                const line = text => write_line(day, "  " + c(date_label(date), BOLD) + "  " +
                    c(active.event.name, CYAN) + "   " + text);
                if (match) {
                    const opponent = match.a === human.team ? match.b : match.a;
                    const score = match.a === human.team
                        ? `${match.a_wins}:${match.b_wins}` : `${match.b_wins}:${match.a_wins}`;
                    line(`${info.stage_name} 第 ${stage.round + 1} 轮：${c(human.team.name, CYAN)} ` +
                        (match.winner === human.team
                            ? c(`战胜 ${opponent.name}`, GREEN) : c(`负于 ${opponent.name}`, RED)) +
                        c(`  (${score})`, DIM));
                } else if (info.waiting) {
                    // 直邀队还没轮到自己打的阶段，只播报等待。
                    line(c(info.waiting, DIM));
                }
                if (info.stage_finished) {
                    line(`${info.stage_name}结束：8 队晋级${info.next_stage ? ` ${info.next_stage}` : "八强"}` +
                        (info.player_in_stage && info.stage_advancing.includes(human.team)
                            ? c("，你在列", GREEN) : ""));
                }
                if (info.player_out) {
                    // 玩家本阶段止步：剩余阶段与淘汰赛由世界补完，直接结算本站。
                    summary = finish_player_event(active, rng, active_buff);
                    const rank = summary.standings.indexOf(human.team) + 1;
                    line(`阶梯瑞士轮结束：你所在的 ${c(human.team.name, CYAN)} 位列第 ` +
                        `${rank}/${active.teams.length}，` + c("无缘淘汰赛", RED));
                } else if (info.finished) {
                    line(`阶梯瑞士轮结束：你所在的 ${c(human.team.name, CYAN)} 位列第 ` +
                        `${group_rank(active, human.team)}/${active.teams.length}，` + c("晋级八强", GREEN));
                }
            } else if (stage.kind === "group") {
                const size = active.teams.length;
                step_player_event(active, stage, human, rng, active_buff);
                const rank = group_rank(active, human.team);
                const advanced = rank !== null && rank <= 8;
                const stage_name = active.event.format === "regional" ? "瑞士轮" : "小组赛";
                write_line(day, "  " + c(date_label(date), BOLD) + "  " + c(active.event.name, CYAN) +
                    `   ${stage_name}结束：你所在的 ${c(human.team.name, CYAN)} 位列第 ${rank}/${size}，` +
                    (advanced ? c("晋级八强", GREEN) : c("无缘淘汰赛", RED)));
                if (!advanced) summary = finish_player_event(active, rng, active_buff);
            } else {
                const {size, matches} = step_player_event(active, stage, human, rng, active_buff);
                const match = matches.find(item => item.a === human.team || item.b === human.team);
                if (match) {
                    const opponent = match.a === human.team ? match.b : match.a;
                    const won = match.winner === human.team;
                    const score = match.a === human.team ? `${match.a_wins}:${match.b_wins}` : `${match.b_wins}:${match.a_wins}`;
                    write_line(day, "  " + c(date_label(date), BOLD) + "  " + c(active.event.name, CYAN) +
                        `   ${round_name(size)}：${c(human.team.name, CYAN)} ` +
                        (won ? c(`战胜 ${opponent.name}`, GREEN) : c(`负于 ${opponent.name}`, RED)) + c(`  (${score})`, DIM));
                }
                if (!active.alive.includes(human.team) || active.alive.length === 1) {
                    summary = finish_player_event(active, rng, active_buff);
                }
            }
            await flush();
            if (summary) {
                await settle_player_event(summary, human, io, rating_before, date_md(date));
                active = null;
                // 本站结算改变了实时名次，后面各站的资格推断可能跟着变：对比后播报再刷新面板。
                await broadcast_schedule(day);
                push_status(io, human, {day});
            }
        }
        // 阶段日与赛事进行中的日子都不再走空闲/事件分支。
        if (acted || active) continue;

        // —— 空闲日：按周合并累计；每周第 7 天触发一个随机事件，随后暂停等玩家点继续 —— //
        if (!idle) idle = {from: day, to: day};
        else idle.to = day;
        if (day - idle.from + 1 >= 7) {
            // 本周前 6 天无事发生，先合并落地
            idle.to = day - 1;
            commit_idle();
            await flush();
            // 第 7 天：先刷新角色状态，再触发本周的练习赛与随机事件
            update_form(human, rng);
            await play_practice_match(human, rng, io, day, date);
            const upcoming = next_match(day);
            const drawn = draw_event(human, rng, Boolean(upcoming && upcoming.event.is_major), used_ids);
            if (drawn) {
                used_ids.add(drawn.id);
                const answer = await present_event(drawn, human, auto, rng, io, date);
                if (answer === RETIRE) {
                    human.retire_requested = true;
                    break;
                }
                const before = Object.fromEntries(ATTR_KEYS.map(key => [key, human[key]]));
                const gains = [];
                apply_effects(human, drawn.options[answer].fx, rng, gains);
                push_entry(date_md(date), [
                    c(`【事件】${drawn.title}`, YELLOW + ";" + BOLD) + c(` · 你选择了「${drawn.options[answer].text}」`, DIM),
                    c(drawn.options[answer].result, DIM),
                    ...gains.map(line => c(line, GREEN)),
                    ...attribute_delta_lines(before, human).map(line => c(line, DIM)),
                ], "event");
            } else {
                push_entry(date_md(date), [c("无事发生", DIM)], "idle");
            }
            // 一周结束：本周的成绩可能改变了后面各站的资格，对比后把变化播报出来（排在事件行之后）。
            await broadcast_schedule(day);
            push_status(io, human, {day});
            if (!auto) {
                const answer = await io.choose(`已模拟到 ${date_full(date)}，继续模拟吗？`, ["继续模拟"],
                    {kind: "pause", allow_retire: true});
                if (answer === RETIRE) {
                    human.retire_requested = true;
                    break;
                }
                push_status(io, human, {day});
            }
        }
        // 当天赛事都结算完了，记一次名次快照；后面站点的引用期会回溯到这里。
        world.snapshot_ranks(day);
    }

    // 年末：把剩余的空闲段与缓冲落地。
    commit_idle();
    await flush();
}

// 到期邀约最多三支队伍，同时约束玩家实力档位和当前队伍档位，防止一次跨越两档。
// 邀约只在玩家所属联赛内产生，因此 VRS 联赛的选手不会被邀请去扩展联赛，反之亦然。
// 自动模式有 55% 概率续约，否则优先选择档位最高、同档实力最强的邀约。
async function contract_decision(world, human, rng, auto, io) {
    io.write();
    io.write(c("  【合同到期】", YELLOW + ";" + BOLD) + ` 你与 ${c(human.team.name, CYAN)} 的合同已经结束。`);
    const want_tier = tier_of(human.overall());
    const pool = world.teams.filter(t => t !== human.team && t.league === human.team.league);
    let candidates = pool.filter(t => Math.abs(t.tier - want_tier) <= 1 && Math.abs(t.tier - human.tier_index) <= 1);
    if (!candidates.length) candidates = pool.filter(t => Math.abs(t.tier - human.tier_index) <= 1);
    if (!candidates.length) candidates = pool.slice();
    rng.shuffle(candidates);
    const offers = candidates.slice(0, 3);

    if (auto) {
        if (!offers.length || rng.random() < 0.55) {
            human.contract_left = rng.randint(2, 4);
            io.write(c(`   -> 自动选择: 续约 ${human.contract_left} 年`, DIM));
        } else {
            const target = offers.reduce((a, b) => a.tier > b.tier || (a.tier === b.tier && a.strength() >= b.strength()) ? a : b);
            const message = move_to_team(world, human, target, rng);
            human.contract_left = rng.randint(2, 4);
            io.write(c("   -> 自动选择: 换队  " + (message || ""), DIM));
        }
        return;
    }

    const options = ["续约留队", ...offers.map(team => `加盟 ${team.name} (${LEAGUES[league_of(team.rank)].short} ${TIERS[team.tier].name} / 世界 #${team.rank})`)];
    const index = await io.choose("合同到期：续约还是加盟其他队伍？", options,
        {kind: "contract", allow_retire: true});
    if (index === RETIRE) {
        human.retire_requested = true;
        return;
    }
    if (index === 0) {
        human.contract_left = rng.randint(2, 4);
        io.write(`   你与 ${human.team.name} 续约 ${human.contract_left} 年。`);
    } else {
        const message = move_to_team(world, human, offers[index - 1], rng);
        human.contract_left = rng.randint(2, 4);
        io.write("   " + c(message, GREEN));
    }
}

// 自动模式按年龄退役（默认征战到 30 岁）；玩家一侧不再弹询问，
// 由界面上的「退役」按钮随时主动退役（io.choose 返回 RETIRE）。
async function ask_retire(player, auto) {
    if (!auto) return null;
    return player.age >= 30 ? "征战多年后选择退役" : null;
}

// 结局优先看 Major 冠军，再看峰值与 Top20 入选次数；其他赛事冠军保留在荣誉室展示。
function grade_of(player) {
    const majors = player.honors.filter(h => h.includes("Major") && h.includes("冠军")).length;
    if (majors >= 3) return ["S+", "CS 之神 —— 一个时代由你定义"];
    if (majors >= 2) return ["S", "世界第一 —— 多届 Major 冠军得主"];
    if (majors >= 1 || player.peak >= 84 || player.top20_count >= 3) return ["A", "顶级选手 —— 世界赛场上的常客"];
    if (player.peak >= 66 || player.top20_count >= 1) return ["B", "稳定一线 —— 靠实力吃饭的职业选手"];
    if (player.peak >= 48) return ["C", "二线老将 —— 有过高光, 更多是挣扎"];
    return ["D", "青训陨落 —— 终究没能打出来"];
}

// 开局列出位置及权重最高的两项属性；选择完成后才生成世界，位置抽样不消耗世界随机序列。
async function pick_role(rng, auto, io) {
    if (auto) return rng.choice(ROLE_NAMES);
    const options = ROLE_NAMES.map(role => {
        const core = Object.entries(ROLES[role]).sort((a, b) => b[1] - a[1]).slice(0, 2);
        return `${role}（重${core.map(([key]) => ATTR_LABEL[key]).join("/")}）`;
    });
    return ROLE_NAMES[await io.choose("选择你的位置", options)];
}

// 玩家初始属性按位置权重塑形：全属性从 HUMAN_ATTR_BASE 起步，核心属性（权重 ≥ 0.10）与
// 次要属性（权重 0.06～0.10）分别加一档加成，位置越看重的属性起点越高（狙击手偏预瞄/反应、
// 指挥偏信息/沟通），越边缘的越低，最后叠加个体随机。核心加成让各位置总评落在 38～41 一带，
// 与起点队伍（第 91～100 名，固定数据库里队均约 37）的普通队员相当，不再是队内拖后腿的那个。
const HUMAN_ATTR_BASE = 30;    // 十四维共同起点
const HUMAN_CORE_BONUS = 16;   // 核心属性（权重 ≥ 0.10）加成
const HUMAN_MID_BONUS = 6;     // 次要属性（权重 0.06～0.10）加成
const HUMAN_ATTR_NOISE = 4;    // 个体随机幅度（正态）

function human_start_attrs(role, rng) {
    return Object.fromEntries(ATTR_KEYS.map(key => {
        const weight = ROLES[role][key];
        const bonus = weight >= 0.10 ? HUMAN_CORE_BONUS : weight >= 0.06 ? HUMAN_MID_BONUS : 0;
        return [key, clamp(round(HUMAN_ATTR_BASE + bonus + rng.gauss(0, HUMAN_ATTR_NOISE)), 5, 99)];
    }));
}

// 玩家从世界倒数 1～10 名（第 91～100 名，扩展联赛丙级）的队伍里随机起步，替换最低总评成员；
// 首份合同为 1 年（新秀试训），此后续约/转会为 2～4 年。
// 从最底层往上打，必须先把球队带进世界前 50 才能进入 VRS 联赛。
function make_human(world, name, role, rng) {
    if (!name) name = "无名之辈";
    const team = rng.choice(world.teams.filter(t => t.rank >= 91 && t.rank <= 100));
    const attrs = human_start_attrs(role, rng);
    const human = new Player(name, role, 16, attrs, team, rng, true);
    apply_attribute_floors(human);
    human.world = world;
    human.year = 0;
    human.contract_len = 1;
    human.contract_left = human.contract_len;
    if (team.roster.length >= 5) {
        const victim = team.roster.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        team.roster.splice(team.roster.indexOf(victim), 1);
        victim.retired = true;
        world.reserve_ids.push(victim.id);
        const index = world.players.indexOf(victim);
        if (index >= 0) world.players.splice(index, 1);
    }
    team.roster.push(human);
    team.dirty = true;
    // 玩家入队就是一次阵容变动：从「刚组建」的基准再扣一次。
    team.chemistry = CHEM_START + CHEM_ROSTER_CHANGE;
    world.players.push(human);
    return human;
}

// 一个赛季依次完成：清年度记录 → 玩家赛历 → 其他队伍 → Top20 → 全员成长 → 总结与历史。
// 随后全员增龄、NPC 退役交易、合同结算，最后判定玩家退役；增龄后不会再打当年的赛事。
async function run_game(name, role, seed, auto, io) {
    const rng = new Random(seed);
    const world = new World(rng);
    const human = make_human(world, name, role, rng);
    // 开局不再打印标语与选手介绍：ID、位置、队伍在左栏与年份抬头里已经有。
    push_status(io, human);

    while (!human.retired && human.year < MAX_YEARS) {
        human.year += 1;
        // 每赛季开始时清空生涯日志，只保留当年的记录。
        if (io.clear_log) io.clear_log();
        // 新赛季：全部队伍积分清零回到 1000，档位与权重沿用上一季末排出的名次。
        world.reset_season();
        for (const player of world.players) player.reset_year();
        const start_attrs = Object.fromEntries(ATTR_KEYS.map(key => [key, human[key]]));
        const start_value = human.value();
        const start_tier = human.tier_index;
        const start_rank = human.team.rank;

        // 赛历按时间顺序推进：play_human_year 内部逐站打完玩家参赛的站点，
        // 同时把玩家没有名额的那些站点交给 NPC 模拟，因此「年月日」与赛事进度始终同步。
        await play_human_year(human, rng, auto, io);
        const year_stats = Object.values(human.ev_stats);
        const yr_maps = year_stats.reduce((sum, item) => sum + item.maps, 0);
        const yr_kills = year_stats.reduce((sum, item) => sum + item.kills, 0);
        const yr_deaths = year_stats.reduce((sum, item) => sum + item.deaths, 0);
        const ranking = world.compute_top20();
        const yr = human.yr_ratings;
        const avg = yr.length ? yr.reduce((sum, r) => sum + r, 0) / yr.length : 0;
        human.rating_all.push(...yr);
        const year_label = START_YEAR + human.year - 1;
        // 入选 Top20 的计数在这里统一累计；只有在没有弹窗通道时才补一份完整榜单。
        const top_index = top20_rank(ranking, human);
        const rank_line = top_index >= 0
            ? `   世界排名: 第 ${top_index + 1} 名 (入选 Top20)`
            : "   世界排名: 未入 Top20";
        if (!io.season) print_top20(ranking, human, year_label, top_index, io);

        // 赛季结束：按本赛季积分排出 1～100 名，档位、联赛与 Top20 权重随之重排。
        // 这一步必须在增龄与转会之前完成，后续的补位与交易才能用上新档位的潜力基数。
        const {standings, changes} = world.finalize_rankings();
        const move = changes.get(human.team) || 0;
        const rank = standings.indexOf(human.team) + 1;

        world.grow_all(rng);
        human.yr_avgs.push(avg);
        human.kills_all += yr_kills;
        human.deaths_all += yr_deaths;
        human.maps_all += yr_maps;
        push_status(io, human);
        for (const [event, , result] of human.yr_honors) human.honors.push(`${human.age} 岁 ${event} ${result}`);
        for (const event of human.yr_mvps) human.mvps.push(`${human.age} 岁 ${event}`);
        human.history.push({
            year: year_label, age: human.age, team: human.team.name, tier: TIERS[start_tier].name,
            n: yr.length, titles: human.yr_titles, avg, honors: human.yr_honors.slice(),
            rank, rating: human.team.rating, move, kills: yr_kills, deaths: yr_deaths, maps: yr_maps,
        });

        world.advance(rng);
        human.contract_left -= 1;
        if (human.contract_left <= 0 && human.age < FORCE_RETIRE_AGE) {
            await contract_decision(world, human, rng, auto, io);
        }
        // 增龄与转会之后刷新：年龄、队伍、合同与荣誉数都可能已经变化。
        push_status(io, human);

        // 本年结束后必然退役的三种情况：中途点过退役 / 年满 / 实力跌出职业门槛。
        const will_retire = Boolean(human.retire_requested)
            || human.age >= FORCE_RETIRE_AGE || human.overall() < MIN_OVERALL;

        // 年度总结：有弹窗通道时等玩家选「进入下一年」或「退役」（退役还要二次确认）；
        // 没有的话（如 check.cjs 的静默 io）退回原来的文本输出。
        if (io.season) {
            const action = await io.season(season_payload(human, ranking, {
                rank, move, start_attrs, start_value, will_retire,
            }));
            if (action === "retire") human.retire_requested = true;
        } else {
            print_team_standing(human, rank, move, start_rank, io);
            print_annual_summary(human, start_attrs, start_value, rank_line, io);
        }

        // 玩家在赛季中途点了「退役」：当年剩余赛程已跳过，赛季结算照常完成。
        if (human.retire_requested) {
            human.retired = true;
            human.retire_reason = "主动宣布退役";
            break;
        }
        if (human.age >= FORCE_RETIRE_AGE) {
            human.retired = true;
            human.retire_reason = `年满 ${FORCE_RETIRE_AGE} 岁, 正式告别职业赛场`;
            break;
        }
        if (human.overall() < MIN_OVERALL) {
            human.retired = true;
            human.retire_reason = "实力跌出职业门槛, 被迫退役";
            break;
        }
        const reason = await ask_retire(human, auto);
        if (reason) {
            human.retired = true;
            human.retire_reason = reason;
            break;
        }
    }
    // 生涯战报：有弹窗通道时等玩家点「再来一局」，否则退回原来的文本输出。
    if (io.career) await io.career(career_payload(human));
    else ending(human, io);
    return human;
}


