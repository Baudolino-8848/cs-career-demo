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
        // 实时名次：初始为快照名次，之后每个赛季结束时按赛季积分重排。所有对外展示、
        // 分档、权重都与这个名次挂钩，它才是「实时队伍排名」。
        this.rank = source.rank;
        this.rating = START_RATING;
        this.rating_before = START_RATING;
        this.seed_rating = START_RATING;
        this.delta_sum = 0;
        this.matches = 0;
        this.wins = 0;
        this.losses = 0;
        this.apply_rank();
        this.coach = source.name + " 教练";
        this.roster = [];
        this.tour_wins = 0;
        this.tour_losses = 0;
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

    // 新赛季积分清零，回到统一起跑线；种子分由上一季末的名次给出，名次与档位保持不变。
    // ref_rank 在开季时冻结：全年所有名额、分档与地区赛分组都以它为准（即赛历里的「引用期」）。
    reset_season(seed) {
        this.delta_sum = 0;
        this.seed_rating = seed;
        this.rating = START_RATING;
        this.rating_before = START_RATING;
        this.matches = 0;
        this.wins = 0;
        this.losses = 0;
        this.ref_rank = this.rank;
    }

    // 记一场比赛的结果并结算双方积分。双方增减绝对值之和恒为零，全场总积分守恒。
    // 期望胜率按赛季初的名次种子分算，因此爆冷（低名次赢高名次）拿到的分数远多于横扫。
    // 积分被限制在 [MIN_RATING, MAX_RATING]：接近边界时把本场变化按「双方都不越界」的最大幅度
    // 先截断再结算。双方共用同一个 delta、方向相反，各自独立截断会凭空产生或销毁积分。
    play_match(opponent, win) {
        const raw = match_delta(this.seed_rating, opponent.seed_rating, win);
        const low = MIN_RATING - START_RATING;    // delta_sum 下限
        const high = MAX_RATING - START_RATING;   // delta_sum 上限
        const lo = Math.max(low - this.delta_sum, opponent.delta_sum - high);
        const hi = Math.min(high - this.delta_sum, opponent.delta_sum - low);
        const delta = lo > hi ? 0 : clamp(raw, lo, hi);
        this.delta_sum += delta;
        opponent.delta_sum -= delta;
        this.matches += 1;
        opponent.matches += 1;
        this.rating = clamp(START_RATING + this.delta_sum, MIN_RATING, MAX_RATING);
        opponent.rating = clamp(START_RATING + opponent.delta_sum, MIN_RATING, MAX_RATING);
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

    // 新赛季积分清零到 1000，并按上一季末的名次重新计算种子分；档位与权重保持不变。
    reset_season(field_size = this.teams.length) {
        for (const team of this.teams) team.reset_season(seed_rating(team.rank, field_size));
    }

    // 实时排名：按当前赛季积分从高到低排序，同分时用上一季末的名次打破平局。
    standings() {
        return this.teams.slice().sort((a, b) => b.rating - a.rating || a.rank - b.rank);
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
            team.roster = team.roster.filter(player => {
                if (player.is_human) return true;
                if (player.age >= NPC_MAX_AGE || rng.random() < npc_retire_chance(player.age)) {
                    player.retired = true;
                    this.reserve_ids.push(player.id);
                    vacancies.push(player.role);
                    return false;
                }
                return true;
            });
            while (team.roster.length < 5) this.gen_npc(team, vacancies.shift() || null);
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
            }
        }
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) [a.coach, b.coach] = [b.coach, a.coach];
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
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) [a.coach, b.coach] = [b.coach, a.coach];
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

// 单场地图数：小组赛与八强/半决赛为 Bo3，决赛为 Bo5；地区赛决赛同样是 Bo3。
// 每张图累计一张地图的击杀、助攻、ADR 与 KAST，赛后按地图数求平均，口径与真实数据中心一致。
function series_maps(rng, is_final, event) {
    if (is_final) return event.final_bo === 5 ? (rng.random() < 0.55 ? 4 : 5) : (rng.random() < 0.65 ? 3 : 2);
    return rng.random() < 0.70 ? 2 : 3;
}

// 单图表现系数：个人实力相对本队平均的差距 + 临场随机，再乘角色状态的修正。
// 1 是「打出身价」的基准线，越强的个人与越弱的队友系数越高；用逻辑函数压住两端。
function player_form(player, team, event, rng) {
    const edge = (player.overall() - team.strength()) / 15;
    const form = (0.95 * 2 / (1 + Math.exp(-edge)) + rng.gauss(0, 0.16)) * form_multiplier(player);
    return clamp(form, 0.42, 1.95);
}

// 单图个人数据：Rating 由预瞄/压枪、定位与心态决定（不做团队修正，团队成绩在赛后体现），
// 击杀、伤害、KAST 与阵亡都从同一个表现系数派生，因此各列之间不会互相矛盾。
// 一图 15 杀、阵亡 15 次、ADR 78 是基准线；胜负只在单图给出小幅加成/扣减。
function map_stat(player, team, event, rng, on_win) {
    const cfg = GRADE_CFG[event.grade];
    const form = player_form(player, team, event, rng);
    const mental = (player.composure + player.focus) / 2;
    const aim_skill = player.preaim * 0.62 + player.spray * 0.38;
    const support = player.utility * 0.60 + player.trade * 0.40;
    const rating = clamp(0.95 + (form - 1) * 0.90 + (mental - 50) / 500
        + rng.gauss(0, 0.10) * cfg.form + (on_win ? 0.09 : -0.07), 0.20, 2.20);
    const adr = clamp(rng.gauss(78 * (0.48 + 0.52 * form) + (aim_skill - 50) * 0.22, 8), 15, 165);
    const kast = clamp(rng.gauss(71 + (support - 50) * 0.10 + (form - 1) * 14, 5), 30, 96);
    const kills = clamp(Math.round(rng.gauss(14.2 * form ** 0.72, 3.2)), 1, 46);
    const deaths = clamp(Math.round(kills / clamp(rng.gauss(1 + (form - 1) * 0.55, 0.16), 0.40, 2.30)), 3, 42);
    const assists = clamp(Math.round(rng.gauss(4.6 + (support - 50) * 0.05 + (player.comms - 50) * 0.03 + (form - 1) * 2.4, 2.4)), 0, 18);
    const headshots = clamp(Math.round(kills * clamp(rng.gauss(0.46 + (player.preaim - 50) * 0.002, 0.08), 0.15, 0.85)), 0, kills);
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

// 一场系列赛：逐图模拟，每张图给双方五名选手各记一条数据，返回胜负与比分。
// maps 是这场系列赛的图数上限（Bo3 = 最多 3 图）：先拿够过半胜场者胜，打满即止。
// buff 是本队这一站的临场状态加成（玩家事件产生），只影响胜负，不影响个人数据口径。
// detailed 为真时逐图记录完整数据（击杀/ADR/KAST），否则只记一条年度 Rating —— 世界 Top20
// 与顶级联赛需要完整个体数据，扩展联赛的批量模拟则省下这部分开销。
// sink 为数组时逐图留存双方明细（只用于玩家参赛的场次），世界模拟传 null，不产生额外对象。
function simulate_series(a, b, event, rng, buff, maps, detailed, sink = null) {
    const strength = team => team.strength() + team_form_bonus(team) + (buff.get(team) || 0);
    // 胜场门槛＝过半图数：Bo3 需 2 胜、Bo5 需 3 胜（maps 只是上限，不是门槛）。
    const need = Math.floor(maps / 2) + 1;
    let a_wins = 0;
    let b_wins = 0;
    while (a_wins < need && b_wins < need && a_wins + b_wins < maps) {
        const a_takes = rng.random() < win_chance(strength(a), strength(b));
        const winner = a_takes ? a : b;
        if (a_takes) a_wins += 1;
        else b_wins += 1;
        if (!detailed) continue;
        // sink 只在玩家参赛的场次传入：逐图把双方五人的明细留一份，供赛事总结的「详细数据」页使用。
        const lines = sink ? [] : null;
        // 统计按阵容记账：每张图每边恰好五条记录，玩家的位置由阵容补位规则决定。
        for (const team of [a, b]) {
            for (const player of lineup_of(team)) {
                const line = map_stat(player, team, event, rng, team === winner);
                push_event_stats(player, event, line, false);
                if (lines) lines.push({team, player, line, won: team === winner});
            }
        }
        if (lines) sink.push({winner, lines});
    }
    for (const team of [a, b]) {
        const win = team === a ? a_wins > b_wins : b_wins > a_wins;
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
        const result = play_series(a, b, event, rng, buff, series_maps(rng, is_final, event), detailed,
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

// 瑞士轮拆成可逐轮推进的状态机：make_swiss 建表，swiss_round 打一轮，swiss_result 取前 8。
// 世界模拟用 play_swiss 一次性跑完；玩家参赛时按轮逐日推进（见 player_event_stages）。
// 配对规则：先按引用期排名蛇形配对，之后按同战绩配对并避免重复对阵；单数队伍时轮空位置逐轮轮换。
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
        const result = play_series(a.team, b.team, event, rng, buff, series_maps(rng, false, event), detailed,
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
            const maps = series_maps(rng, false, event);
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
//   major    —— 32 队 5 轮瑞士轮取 8 强，八强/半决赛 Bo3、决赛 Bo5（Major 与 S 级）；
//   standard —— 32 队 4 组 × 8 队单循环取前二，8 强单败（A 级与 B 级）；
//   regional —— 30 队 4 轮瑞士轮取 8 强（同期地区赛）。
// 所有赛制最后都收敛到同一个 8 强单败淘汰赛，保证 1～8 名的名次口径完全一致。
// 返回 {event, teams, standings, field, champion, runner_up}。
function run_tournament(teams, event, rng, buff = new Map(), detailed = true) {
    const field = event_field(teams, event);
    // 瑞士轮制（Major / S 级 / 地区赛）先跑瑞士轮，其余（A / B 级）先跑小组单循环。
    const stage = (event.format === "major" || event.format === "regional")
        ? play_swiss(teams, event, rng, buff, detailed)
        : play_groups(make_groups(teams, event.groups, rng), event, rng, buff, detailed);
    const bracket = play_bracket(stage.advancing, event, rng, buff, detailed);
    return finalize_event(event, teams, field, bracket, stage.rest, rng);
}

// 一场赛事结束后的收尾：先按淘汰赛名次排定 1～8 名，再按小组/瑞士轮战绩补齐其余队伍，
// 最后给每名选手结算年度表现。返回赛事总结对象（champion / runner_up 供播报使用）。
function finalize_event(event, teams, field, bracket, rest, rng) {
    const ordered = bracket ? Array.from(bracket.keys()) : [];
    const standings = ordered.slice().sort((a, b) => bracket.get(a) - bracket.get(b)
        || b.tour_wins - a.tour_wins || a.tour_losses - b.tour_losses || rank_of(a) - rank_of(b));
    // 淘汰赛名次（1～8）由 play_bracket 给出；其余队伍按「胜场多、负场少、引用期名次靠前」补齐。
    const others = teams.filter(team => !bracket || !bracket.has(team))
        .sort((a, b) => b.tour_wins - a.tour_wins || a.tour_losses - b.tour_losses || rank_of(a) - rank_of(b));
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
    void rest;
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
// 单站个人 Rating 的解析式。正常流程下赛事结算用逐图数据的平均值，这个函数保留给
// 开发检查与异常兜底：由总评、心态、临场随机与团队成绩共同决定。
function individual_rating(player, result, event, rng) {
    let base = 0.55 + player.overall() / 100 * 0.85 + rng.uniform(-0.12, 0.12) + (player.mental - 50) / 400;
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

// 阶段标签：把 play_series 采集到的 stage 变成「瑞士轮 第 3 轮 / 半决赛」这类可读文字。
function stage_label(stage) {
    if (!stage) return "比赛";
    if (stage.kind === "swiss") return `瑞士轮 第 ${stage.round + 1} 轮`;
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
            maps: record.maps.map(sink => ({
                won: sink.winner === human.team,
                mine: sink.lines.filter(item => item.team === human.team).map(item => detail_row(item, human)),
                theirs: sink.lines.filter(item => item.team === record.opponent).map(item => detail_row(item, human)),
            })),
        };
    });

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
async function event_summary(summary, human, io, rating_before, date) {
    const payload = event_summary_payload(summary, human);
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
        // 下一场比赛：只有逐日循环在暂停点带上 context 时才有值。
        next: context && context.next ? {
            name: context.next.event.name,
            tier: grade_label(context.next.event.grade),
            from: date_short(game_date(START_YEAR + human.year - 1, context.next.event.start_day)),
            to: date_short(game_date(START_YEAR + human.year - 1, context.next.event.end_day)),
            days: context.next.event.start_day - context.day,
        } : null,
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
    return `${old_team.name} -> ${new_team.name} (${TIERS[new_team.tier].name})`;
}

// 事件转会按档位增量找队伍；合同剩余年限保持原值，不另开一份新合同。
// 只在同一联赛内找队伍，避免 VRS 战队与扩展联赛战队互相跳档。
function change_tier(p, delta, rng) {
    const tier = clamp(p.team.tier + delta, 0, TIERS.length - 1);
    if (tier === p.team.tier) return null;
    const candidates = p.world.teams.filter(t => t.tier === tier && t.league === p.league && t !== p.team);
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
    if ("buff" in fx) hints.push({text: "临场 +" + round(fx.buff * 100) + "%", tone: "neutral"});
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

// 年初固定玩家赛程：全部主赛站都会出现在赛历上（没名额的站只显示日期与冠军播报），
// 另外补上同期玩家有资格参加的地区赛。赛程只算一次，年中转会不改当季名额。
function human_year_plan(human) {
    const rank = rank_of(human.team);
    const plan = [];
    const busy = new Set();
    // 先排主赛：同一天只可能有一站主赛，日程天然互斥。
    for (const event of ANNUAL_CALENDAR) {
        if (event.circuit !== "main") continue;
        const plays = event_allows(event, rank);
        if (plays) busy.add(event.start_day);
        plan.push({event, plays});
    }
    // 再排地区赛：同一天已经打主赛的队伍不能再打地区赛（R5：同一天不承担两场官方赛事）。
    for (const event of ANNUAL_CALENDAR) {
        if (event.circuit !== "regional") continue;
        if (!event_allows(event, rank) || busy.has(event.start_day)) continue;
        plan.push({event, plays: true});
    }
    return plan.sort((a, b) => a.event.start_day - b.event.start_day);
}

// 本站的参赛队伍：主赛先按引用期名次取直邀，再从预选区间补齐；地区赛按档位优先，
// 档内不足 30 队时按名次从同期没有主赛名额的队伍里补足，保证每站都是完整规模。
// 玩家所属队伍若没有名额则不参赛，赛事照常由 NPC 打完。
function event_participants(world, event, human, human_plays) {
    return build_participants(world, event, human, human_plays, null);
}

// 除玩家外的参赛队伍：与 event_participants 同一套名额逻辑，只是把玩家队伍排除在外，
// 因此玩家没亲自打的那一站仍会由 NPC 完整模拟。
function world_participants(world, event, exclude) {
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

// —— 玩家参赛赛事：分阶段模拟（小组赛/瑞士轮逐日推进，淘汰赛逐日逐轮）—— //
// 阶段排期：
//   major（Major/S 级）—— 瑞士轮 5 轮铺在赛事前 5 天，8 强淘汰赛 3 轮压在末段（决赛落收官日周日）；
//   其余赛制 —— 小组赛/瑞士轮一次跑完安排在开赛日，淘汰赛同样压在末段。
// 更贴近真实 Major 的「前几天打完组别、末段打淘汰赛」排期。
function player_event_stages(event) {
    const stages = [];
    if (event.format === "major") {
        const rounds = event.swiss_rounds || 5;
        for (let r = 0; r < rounds; r++) stages.push({kind: "swiss", day: event.start_day + r, round: r});
    } else {
        stages.push({kind: "group", day: event.start_day});
    }
    for (let j = 0; j < 3; j++) stages.push({kind: "round", day: event.end_day - (2 - j)});
    return stages;
}

// 玩家参赛时建站：清空本站战绩、排好参赛名单与阶段表。小组赛/瑞士轮在 step_player_event 里推进。
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
        swiss: event.format === "major" ? make_swiss(teams) : null,
    };
}

// 推进一个阶段：swiss 打一轮瑞士轮，group 跑完小组赛/瑞士轮，round 打一轮淘汰赛。
function step_player_event(state, kind, rng, buff) {
    const {event, teams} = state;
    if (kind === "swiss") {
        const matches = swiss_round(state.swiss, event, rng, buff, true);
        const done = state.swiss.round >= (event.swiss_rounds || 5);
        if (done) {
            const stage = swiss_result(state.swiss);
            state.alive = stage.advancing;
            state.rest = stage.rest;
        }
        return {kind: "swiss", matches, done};
    }
    if (kind === "group") {
        const stage = (event.format === "regional")
            ? play_swiss(teams, event, rng, buff, true)
            : play_groups(make_groups(teams, event.groups, rng), event, rng, buff, true);
        state.alive = stage.advancing;
        state.rest = stage.rest;
        return {kind: "group", advancing: stage.advancing};
    }
    const size = state.alive.length;
    const {next, eliminated, matches} = play_bracket_round(state.alive, event, rng, buff, true);
    for (const [team, rank] of eliminated) state.bracket.set(team, rank);
    state.alive = next;
    if (state.alive.length === 1) state.bracket.set(state.alive[0], 1);
    return {kind: "round", size, eliminated, matches, alive: state.alive};
}

// 玩家已出局或赛事已打完：把剩余淘汰赛一次跑完，交给 finalize_event 结算。
function finish_player_event(state, rng, buff) {
    while (state.alive && state.alive.length > 1) {
        const {next, eliminated} = play_bracket_round(state.alive, state.event, rng, buff, true);
        for (const [team, rank] of eliminated) state.bracket.set(team, rank);
        state.alive = next;
    }
    if (state.alive && state.alive.length === 1) state.bracket.set(state.alive[0], 1);
    return finalize_event(state.event, state.teams, state.field, state.bracket, state.rest, rng);
}

// 小组赛/瑞士轮名次：前 8 名就是晋级顺序，其余按战绩表排在 8 名之后。
// rest 里装的是带 .team 的战绩条目（瑞士轮与小组赛都一样），所以两种形态都要认。
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
    await event_summary(summary, human, io, rating_before, date);
    return result;
}

// 逐日推进玩家的一年：全年 350 天，玩家参赛的站点走分阶段模拟，其余站点静默模拟。
// 空闲时段每满一周落地一次日志并暂停等待玩家点继续；模拟动画由 io.simulate 呈现。
async function play_human_year(human, rng, auto, io) {
    const world = human.world;
    const year = START_YEAR + human.year - 1;
    const plan = human_year_plan(human);
    const plays = plan.filter(item => item.plays);
    const player_events = new Set(plays.map(item => item.event.key));
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
    // 下一场比赛：本赛季还没打的最近一站，用于右栏的「下一场比赛」卡片。
    const next_match = day => plays.filter(item => item.event.start_day > day)
        .sort((a, b) => a.event.start_day - b.event.start_day)[0] || null;

    // 年份抬头先落地，再刷新一次面板。
    push_entry(String(year), [
        c(`${year} 年 · ${human.age} 岁`, BOLD) + "   " + c(human.team.name, CYAN) +
            c(`  [${LEAGUES[league_of(human.team.rank)].short} ${TIERS[human.tier_index].name}]`, DIM),
        `位置 ${c(human.role, MAGENTA)}   合同 ${Math.max(human.contract_left, 0)} 年   ` +
            `引用期 世界 #${c(rank_of(human.team), YELLOW)}   本赛季 ${c(plays.length, YELLOW)} 站` +
            ` (Major/S ${s_events} 站 · A 级 ${a_events} 站)`,
    ], "year");
    await flush();
    push_status(io, human);

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
        for (const event of stations_by_start.get(day) || []) {
            if (player_events.has(event.key)) {
                active = start_player_event(world, event, human);
                active_buff = human.buff ? new Map([[human.team, human.buff * 50]]) : new Map();
                human.buff = 0;
            } else {
                world_station(world, event, rng, human.team);
            }
        }

        // —— 玩家赛事的阶段日：瑞士轮/小组赛逐日推进，淘汰赛逐日一轮 —— //
        const stage = active && active.stages[active.stageIdx];
        if (stage && stage.day === day) {
            active.stageIdx += 1;
            commit_idle();
            // 比赛时按阶段刷新角色状态，状态影响本阶段的个人表现与球队实力。
            update_form(human, rng);
            const rating_before = human.team.shown_rating;
            let summary = null;
            if (stage.kind === "swiss") {
                // 瑞士轮逐日推进：每轮输出玩家本场，最后一轮输出最终排名与晋级结果。
                const {matches, done} = step_player_event(active, "swiss", rng, active_buff);
                const match = matches.find(item => item.a === human.team || item.b === human.team);
                if (match) {
                    const opponent = match.a === human.team ? match.b : match.a;
                    const won = match.winner === human.team;
                    const score = match.a === human.team ? `${match.a_wins}:${match.b_wins}` : `${match.b_wins}:${match.a_wins}`;
                    write_line(day, "  " + c(date_label(date), BOLD) + "  " + c(active.event.name, CYAN) +
                        `   瑞士轮第 ${stage.round + 1} 轮：${c(human.team.name, CYAN)} ` +
                        (won ? c(`战胜 ${opponent.name}`, GREEN) : c(`负于 ${opponent.name}`, RED)) + c(`  (${score})`, DIM));
                }
                if (done) {
                    const size = active.teams.length;
                    const rank = group_rank(active, human.team);
                    const advanced = rank !== null && rank <= 8;
                    write_line(day, "  " + c(date_label(date), BOLD) + "  " + c(active.event.name, CYAN) +
                        `   瑞士轮结束：你所在的 ${c(human.team.name, CYAN)} 位列第 ${rank}/${size}，` +
                        (advanced ? c("晋级八强", GREEN) : c("无缘淘汰赛", RED)));
                    if (!advanced) summary = finish_player_event(active, rng, active_buff);
                }
            } else if (stage.kind === "group") {
                const size = active.teams.length;
                step_player_event(active, "group", rng, active_buff);
                const rank = group_rank(active, human.team);
                const advanced = rank !== null && rank <= 8;
                const stage_name = active.event.format === "regional" ? "瑞士轮" : "小组赛";
                write_line(day, "  " + c(date_label(date), BOLD) + "  " + c(active.event.name, CYAN) +
                    `   ${stage_name}结束：你所在的 ${c(human.team.name, CYAN)} 位列第 ${rank}/${size}，` +
                    (advanced ? c("晋级八强", GREEN) : c("无缘淘汰赛", RED)));
                if (!advanced) summary = finish_player_event(active, rng, active_buff);
            } else {
                const {size, matches} = step_player_event(active, "round", rng, active_buff);
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
                push_status(io, human, {day, next: next_match(day)});
            }
            continue;
        }
        // 赛事进行中（非阶段日）：不产出每日行，也不暂停。
        if (active) continue;

        // —— 空闲日：按周合并累计；每周第 7 天触发一个随机事件，随后暂停等玩家点继续 —— //
        if (!idle) idle = {from: day, to: day};
        else idle.to = day;
        if (day - idle.from + 1 >= 7) {
            // 本周前 6 天无事发生，先合并落地
            idle.to = day - 1;
            commit_idle();
            await flush();
            // 第 7 天：先刷新角色状态，再触发本周末的随机事件
            update_form(human, rng);
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
                push_status(io, human);
            } else {
                push_entry(date_md(date), [c("无事发生", DIM)], "idle");
            }
            if (!auto) {
                const answer = await io.choose(`已模拟到 ${date_full(date)}，继续模拟吗？`, ["继续模拟"],
                    {kind: "pause", allow_retire: true});
                if (answer === RETIRE) {
                    human.retire_requested = true;
                    break;
                }
                push_status(io, human, {day, next: next_match(day)});
            }
        }
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
// 合同为 2～4 年。从最底层往上打，必须先把球队带进世界前 50 才能进入 VRS 联赛。
function make_human(world, name, role, rng) {
    if (!name) name = "无名之辈";
    const team = rng.choice(world.teams.filter(t => t.rank >= 91 && t.rank <= 100));
    const attrs = human_start_attrs(role, rng);
    const human = new Player(name, role, 16, attrs, team, rng, true);
    apply_attribute_floors(human);
    human.world = world;
    human.year = 0;
    human.contract_len = rng.randint(2, 4);
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


