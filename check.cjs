const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 在独立上下文加载纯计算与文字格式化，不依赖浏览器或第三方包。
const source = ["vrs.js", "players.js", "data.js", "text.js", "game.js"].map(file => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
const game = vm.runInNewContext(source + `\n({
    Random, Player, Team, World, ATTR_KEYS, ROLES, ROLE_NAMES, EVENTS, ANNUAL_CALENDAR, RANK_BANDS, role_attr_factor,
    VRS_TEAMS, PLAYER_DB, TIERS, LEAGUES, BOUNDS, vrs_tier, league_of, league_key, vrs_weight, record_performance,
    round, overall_of, tier_of, npc_retire_chance, make_human, move_to_team, apply_effects, option_hint, growth, grade_of,
    event_field, eligible_tournaments, event_allows, rank_band, rank_of, band_of, team_invited,
    tier_offset, tier_rank, transfer_offer, run_tournament, run_event, world_station, honor_points, rank_expected, match_delta,
    win_chance, START_RATING, WIN_K, LOSS_K, RANK_SLOPE, MIN_RATING, MAX_RATING, RANK_CARRY,
    play_swiss, play_bracket, group_order, make_groups, simulate_series, series_cap, swiss_series_cap, map_stat, lineup_of,
    make_swiss, swiss_round, swiss_result, group_rank,
    make_ladder, ladder_round, play_ladder, LADDER_STAGES, CLINCH_WINS, CLINCH_LOSSES,
    make_clinch_swiss, clinch_round,
    event_leaders, stat_entry, team_event_rating, individual_rating, placement_text,
    human_year_plan, event_participants, world_participants, live_rank_of, needs_detailed_stats,
    schedule_snapshot, upcoming_matches, diff_schedule, schedule_notice_lines, event_summary_payload,
    ask_retire, contract_decision, run_game, play_human_year, RETIRE, status_snapshot,
    season_payload, career_payload, top20_rank, c, CYAN, BOLD, MIN_OVERALL,
    A_EVENTS, GRADE_CFG, FORMATS, MAIN_DRAW_MAX, BAND_SIZE, BAND_COUNT, BANDS,
    REGIONAL_BANDS, REGIONAL_ROTA,
    START_YEAR, FORCE_RETIRE_AGE, EVENT_SCALE, RESULT_BONUS, VRS_BASE_TIER,
    invalidate,
    ATTR_BASE_KEYS, ATTR_PERF_KEYS, ATTR_FLOORS, apply_attribute_floors, update_form, form_multiplier, form_duration,
    FORM_STATES, FORM_MOD, FORM_NEUTRAL,
    practice_opponent, year_rating_baseline, adjust_form_by_practice, play_practice_match,
    chem_multiplier, chem_gain_scale, adjust_chemistry, human_team, note_roster_change, note_coach_change,
    CHEM_START, CHEM_MAX, CHEM_WIN, CHEM_LOSS, CHEM_ROSTER_CHANGE, CHEM_COACH_CHANGE, CHEM_SOFT_FROM,
    game_date, date_label, date_full, year_start_weekday, week_of, week_monday, month_day,
    reference_day, MONTH_DAYS, WEEKDAY_NAMES, YEAR_DAYS,
})`);
const TEAM_COUNT = 100;
const PLAYER_COUNT = TEAM_COUNT * 5;
const VRS_TEAM_COUNT = 50;
const source_ids = Array.from(game.VRS_TEAMS).flatMap(team => Array.from(team.roster));
const vrs_ids = source_ids.slice(0, VRS_TEAM_COUNT * 5);
const extra_ids = source_ids.slice(VRS_TEAM_COUNT * 5);
const silent = {write() {}, async simulate() {}, async choose() { throw new Error("自动模式不应等待选项"); }};

// vm 里造出来的数组有自己的原型，deepEqual 会按引用比较；统一复制成宿主数组再断言。
function plain(value) {
    return Array.isArray(value) ? Array.from(value) : value;
}

// 现役选手与阵容必须一一对应；每支队伍五人，玩家只占据一个席位。
function check_world(world, human) {
    assert.equal(world.teams.length, TEAM_COUNT);
    assert.equal(world.players.length, PLAYER_COUNT);
    const roster = world.teams.flatMap(team => team.roster);
    assert.equal(new Set(roster).size, PLAYER_COUNT);
    assert.equal(new Set(world.players).size, PLAYER_COUNT);
    // 名次必须是 1～100 的一个完整排列，且档位、联赛、权重都与其一致。
    assert.deepEqual(plain(world.teams.map(team => team.rank)).sort((a, b) => a - b),
        Array.from({length: TEAM_COUNT}, (_, i) => i + 1));
    for (const team of world.teams) {
        assert.equal(team.roster.length, 5);
        assert.equal(team.tier, game.vrs_tier(team.rank));
        assert.equal(team.league, game.league_key(team.rank));
        assert.equal(team.top20_weight, game.vrs_weight(team.rank));
        assert.ok(team.rating >= game.MIN_RATING && team.rating <= game.MAX_RATING);
        assert.equal(team.matches, team.wins + team.losses);
        assert.ok(team.ref_rank === undefined || (team.ref_rank >= 1 && team.ref_rank <= TEAM_COUNT));
        for (const player of team.roster) {
            assert.equal(player.team, team);
            // tier_index 是缓存的档位：赛季末重排档位后必须刷新，否则会与球队脱节。
            assert.equal(player.tier_index, team.tier, `${player.id} 的档位缓存与 ${team.name} 不一致`);
            assert.ok(world.players.includes(player));
            assert.ok(game.ATTR_KEYS.every(key => player[key] >= 1 && player[key] <= 99));
        }
    }
    // 现役 NPC 与补位池合起来必须覆盖原名单的每个 ID，且不出现名单外的 ID。
    const npc_ids = world.players.filter(p => !p.is_human).map(p => p.id);
    assert.ok([...npc_ids, ...world.reserve_ids].every(id => source_ids.includes(id)));
    assert.deepEqual([...new Set([...npc_ids, ...world.reserve_ids])].sort(), [...new Set(source_ids)].sort());
    for (const player of world.players) {
        assert.equal(player.yr_ratings.length, player.yr_rating_weights.length);
        assert.equal(player.yr_honors.length, player.yr_honor_weights.length);
        assert.ok(player.yr_rating_weights.every(w => w >= 0.40 - 1e-12 && w <= 1.20 + 1e-12));
        assert.ok(player.yr_ratings.every(r => r >= 0.20 && r <= 2.20));
    }
    if (human) {
        assert.equal(roster.filter(p => p === human).length, 1);
        assert.equal(world.players.filter(p => p.is_human).length, 1);
        assert.equal(human.tier_index, human.team.tier);
    }
}

// 开局校验（只在 World 刚建成时成立；赛季推进会成长、补位，阵容不再等于数据库）：
// 1) 每队阵容必须与固定数据库 PLAYER_DB 逐位一致，防止 players.js 与 vrs.js 漂移；
// 2) 开局实力必须随档位递增——固定属性后这条不变式不再有随机生成兜底，需要显式守住，
//    否则手工编辑数据库可能造出「弱档比强档还强」而无人报警。
function check_opening(world) {
    for (const team of world.teams) {
        const db = game.PLAYER_DB[team.name];
        assert.ok(db, `${team.name} 不在选手数据库中`);
        assert.equal(db.length, 5, `${team.name} 数据库不是五人`);
        team.roster.forEach((player, i) => {
            assert.equal(player.id, db[i].id);
            assert.equal(player.role, db[i].role);
            assert.equal(player.age, db[i].age);
            // 装载时会套一次属性保底，因此对数据库值套同一套保底后再逐项比较。
            const expected = Object.fromEntries(game.ATTR_KEYS.map(key => [key, db[i].attrs[key]]));
            game.apply_attribute_floors(expected);
            assert.ok(game.ATTR_KEYS.every(key => player[key] === expected[key]), `${player.id} 属性与数据库不符`);
        });
    }
    // 各档平均实力随档位非递减（同档内噪声较大，留 1 点容差）。
    const byTier = new Map();
    for (const team of world.teams) {
        const list = byTier.get(team.tier) || [];
        list.push(team.strength());
        byTier.set(team.tier, list);
    }
    let prev = -Infinity;
    for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
        const list = byTier.get(tier);
        const avg = list.reduce((s, v) => s + v, 0) / list.length;
        assert.ok(avg >= prev - 1.0, `档位 ${tier} 开局实力 ${avg.toFixed(1)} 低于更弱档位 ${prev.toFixed(1)}`);
        prev = avg;
    }
    const avg = list => list.reduce((s, t) => s + t.strength(), 0) / list.length;
    const vrs = avg(world.teams.filter(t => t.rank <= 50));
    const extra = avg(world.teams.filter(t => t.rank > 50));
    assert.ok(vrs > extra, `VRS 联赛开局实力 ${vrs.toFixed(1)} 未高于扩展联赛 ${extra.toFixed(1)}`);
}

// 时间系统：模板年（1 月 1 日为周一）必须与真实年份的星期几完全一致。
function check_time_system() {
    assert.equal(game.YEAR_DAYS, 365);
    assert.deepEqual(plain(game.MONTH_DAYS), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    for (let year = 2026; year <= 2050; year++) {
        // 真实 1 月 1 日的星期（0 = 周一）必须等于 year_start_weekday。
        const real = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
        assert.equal(game.year_start_weekday(year), real, `${year} 年 1 月 1 日的星期`);
        // 全年每一天的星期都要对上，且落在日历年之内。
        for (let day = 1; day <= 350; day += 7) {
            const date = game.game_date(year, day);
            const js = new Date(Date.UTC(year, date.month - 1, date.day_of_month));
            assert.equal((js.getUTCDay() + 6) % 7, date.weekday, `${year} 年第 ${day} 天的星期`);
            assert.equal(js.getUTCMonth() + 1, date.month);
            assert.equal(js.getUTCDate(), date.day_of_month);
            assert.equal(date.shift, (7 - real) % 7);
            assert.equal(date.weekday_name, game.WEEKDAY_NAMES[date.weekday]);
        }
    }
    // 模板日序 → 月日的换算与 WEEKDAY_NAMES 的对应关系。
    assert.deepEqual(plain([1, 2, 7, 8, 32, 365].map(day => game.month_day(day).month)), [1, 1, 1, 1, 2, 12]);
    assert.equal(game.WEEKDAY_NAMES[0], "周一");
    assert.equal(game.WEEKDAY_NAMES[6], "周日");
    assert.equal(game.week_of(1), 1);
    assert.equal(game.week_of(7), 1);
    assert.equal(game.week_of(8), 2);
    assert.equal(game.week_of(350), 50);
    assert.equal(game.week_monday(6), 36);
    // 引用期 = 开赛日往前 4 周所在周的周一（第 10 天的引用期落在上一年 12 月，因此是负数）。
    assert.equal(game.reference_day(37), 8);
    assert.equal(game.week_monday(game.week_of(37 - 28)), 8);
    assert.equal(game.reference_day(10), game.week_monday(game.week_of(10 - 28)));
    assert.ok(game.reference_day(10) < 1, "开季首站的引用期属于上一年年末");
    assert.equal(game.week_monday(game.week_of(37)) - game.reference_day(37), 28);
    assert.equal(game.game_date(2026, 10).weekday_name, "周三");
    assert.equal(game.game_date(2026, 1).weekday_name, "周一");
    assert.equal(game.game_date(2026, 1).month, 1);
    assert.equal(game.game_date(2026, 1).day_of_month, 5);
    assert.equal(game.date_full(game.game_date(2026, 10)), "2026年1月14日 (周三)");
    assert.equal(game.date_label(game.game_date(2027, 37)), "2月9日");
}

// 赛历：18 站主赛 + 16 站地区赛，日期结构、名额区间与零冲突。
function check_calendar() {
    const calendar = game.ANNUAL_CALENDAR;
    const main = calendar.filter(e => e.circuit === "main");
    const regional = calendar.filter(e => e.circuit === "regional");
    assert.equal(calendar.length, 34);
    assert.equal(main.length, 18);
    assert.equal(regional.length, 16);
    assert.equal(main.filter(e => e.grade === "MAJOR").length, 2);
    assert.equal(main.filter(e => e.grade === "S").length, 4);
    assert.equal(main.filter(e => e.grade === "A").length, 6);
    assert.equal(main.filter(e => e.grade === "B").length, 6);
    // 赛事名与 key 唯一，方便作为每站统计的索引。
    assert.equal(new Set(calendar.map(e => e.key)).size, calendar.length);
    assert.equal(new Set(main.map(e => e.name)).size, main.length);
    // 同一档位的地区赛也不能重名，否则积分榜与荣誉室会分不清是哪一站。
    for (const band of game.REGIONAL_BANDS) {
        const names = regional.filter(e => e.band === band.band).map(e => e.name);
        assert.equal(new Set(names).size, names.length, `地区赛第 ${band.band} 档有重名`);
    }
    // S/A/B 级两两不重叠（R1），相邻两站至少隔 6 天（R2）。
    const sorted = main.slice().sort((a, b) => a.start_day - b.start_day);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            assert.ok(sorted[i].end_day < sorted[j].start_day,
                `${sorted[i].name} 与 ${sorted[j].name} 的赛期重叠`);
        }
    }
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].start_day - sorted[i - 1].end_day - 1;
        assert.ok(gap >= 6, `${sorted[i - 1].name} → ${sorted[i].name} 只隔 ${gap} 天`);
    }
    // 每站都是「周内启动、周日收官」：IEM/BLAST/A 级周二→周日，B 级周三→周日，Major 周日→周日。
    for (const event of main) {
        assert.equal(game.game_date(2026, event.end_day).weekday_name, "周日", `${event.name} 收官日`);
        const expect = event.grade === "B" ? "周三" : event.is_major ? "周日" : "周二";
        assert.equal(game.game_date(2026, event.start_day).weekday_name, expect, `${event.name} 开赛日`);
        assert.equal(game.week_monday(game.week_of(event.start_day)) - game.reference_day(event.start_day), 28,
            `${event.name} 的引用期`);
    }
    // 两届 Major 各 15 天；S 级 13 天（周二→次周周日，与 Major 同制故赛期最长）；A 级 6 天；B 级 5 天。
    for (const event of main) {
        const days = event.end_day - event.start_day + 1;
        if (event.is_major) assert.equal(days, 15);
        else if (event.grade === "S") assert.equal(days, 13);
        else if (event.grade === "B") assert.equal(days, 5);
        else assert.equal(days, 6);
    }
    // 地区赛与同日期的主赛并行，日期完全一致。
    for (const event of regional) {
        const host = main.find(m => m.start_day === event.start_day && m.end_day === event.end_day);
        assert.ok(host, `${event.name} 没有同期主赛`);
        assert.equal(game.week_monday(game.week_of(event.start_day)) - game.reference_day(event.start_day), 28);
    }
    // 名次区间必须覆盖 1～100 的每一名，否则会有队伍整年无赛可打。
    for (let rank = 1; rank <= TEAM_COUNT; rank++) {
        const reachable = calendar.filter(event => game.event_allows(event, rank));
        assert.ok(reachable.length > 0, `名次 ${rank} 全年没有任何赛事`);
    }
    // 主赛名额：Major/S 级引用期 1–28 + 预选 29–36，A 级 9–32，B 级 17–48（一线/二线/挑战者）。
    // 地区赛按 33～100 名切成四个档位（每档 17 队），每档全程 4 站。
    for (const event of main) {
        if (event.is_major || event.grade === "S") {
            assert.deepEqual(plain(event.draw), [1, 28]);
            assert.deepEqual(plain(event.qual_draw), [29, 36]);
            assert.equal(event.teams, 32);
            // 阶梯瑞士轮：三个阶段各 5 轮、一天两轮，因此瑞士轮占赛期前 9 天；
            // 末段留 3 天打 8 强淘汰赛，两者之间不能重叠，否则玩家排期会撞车。
            assert.equal(event.swiss_rounds, 5, `${event.name} 每阶段应为 5 轮`);
            assert.equal(event.ladder_stages, 3, `${event.name} 应为三阶段阶梯`);
            assert.ok(event.start_day + 8 <= event.end_day - 3,
                `${event.name} 的赛期装不下三阶段阶梯瑞士轮 + 3 天淘汰赛`);
        } else if (event.grade === "A") {
            assert.deepEqual(plain(event.draw), [1, 32]);
            assert.equal(event.qual_draw, null);
            assert.equal(event.teams, 32);
            assert.equal(event.groups, 4);
            assert.equal(event.per_group, 2);
        } else {
            assert.deepEqual(plain(event.draw), [17, 48]);
            assert.equal(event.qual_draw, null);
            assert.equal(event.teams, 32);
            assert.equal(event.groups, 4);
            assert.equal(event.per_group, 2);
        }
    }
    // 地区赛：每站 30 队、四个档位各 4 站，且同一天的地区赛名单与主赛完全不重叠。
    const regional_total = calendar.filter(e => e.circuit === "regional");
    assert.equal(regional_total.length, 16);
    const band_count = {};
    for (const event of regional_total) {
        assert.equal(event.teams, 30);
        assert.ok(event.draw[1] - event.draw[0] + 1 >= 17, `${event.name} 的档位太小`);
        band_count[event.band] = (band_count[event.band] || 0) + 1;
        const host = main.find(m => m.start_day === event.start_day);
        for (let rank = event.draw[0]; rank <= event.draw[1]; rank++) {
            assert.equal(game.event_allows(host, rank), false,
                `${event.name} 与同期主赛 ${host.name} 在名次 ${rank} 上重叠`);
        }
    }
    assert.deepEqual(band_count, {0: 4, 1: 4, 2: 4, 3: 4});
    // 四个档位的名次区间必须恰好覆盖 33～100，中间不留空档。
    const bands_sorted = game.REGIONAL_BANDS.slice().sort((a, b) => a.min_rank - b.min_rank);
    assert.equal(bands_sorted[0].min_rank, 33);
    assert.equal(bands_sorted[bands_sorted.length - 1].max_rank, TEAM_COUNT);
    for (let i = 1; i < bands_sorted.length; i++) {
        assert.equal(bands_sorted[i].min_rank, bands_sorted[i - 1].max_rank + 1, "地区赛档位之间有断层");
    }
    // 每支球队全年都有至少 2 站比赛可打。
    for (let rank = 1; rank <= TEAM_COUNT; rank++) {
        const count = calendar.filter(event => game.event_allows(event, rank)).length;
        assert.ok(count >= 2, `名次 ${rank} 全年只有 ${count} 站赛事`);
    }
    assert.deepEqual(plain([1, 8, 9, 20, 21, 28, 29, 44, 45].map(game.rank_band).map(b => b.band)),
        [0, 0, 0, 0, 0, 1, 1, 1, 1]);
    assert.equal(game.band_of(1), 0);
    assert.equal(game.band_of(25), 0);
    assert.equal(game.band_of(26), 1);
    assert.equal(game.band_of(100), 3);
    assert.equal(game.A_EVENTS.length, 6);
    // 18 站主赛只覆盖 1～48 名（B 级为 17～48 名），其余名次由 16 站地区赛接住，
    // 保证每支队伍全年都有足够的比赛样本。
    for (const rank of [1, 8, 20, 28, 36, 44, 48]) {
        const eligible = game.eligible_tournaments(rank);
        assert.ok(eligible.length >= 6, `名次 ${rank} 的主赛站数只有 ${eligible.length}`);
        assert.equal(eligible.length, eligible.filter(e => game.event_allows(e, rank)).length);
    }
    assert.equal(game.eligible_tournaments(90).length, 0, "地区赛名次不打主赛");
    for (const rank of [33, 45, 60, 90, 100]) {
        const regional = game.ANNUAL_CALENDAR.filter(e => e.circuit === "regional" && game.event_allows(e, rank));
        assert.ok(regional.length >= 2, `名次 ${rank} 只有 ${regional.length} 站地区赛`);
        assert.ok(regional.every(e => e.draw[0] <= rank && rank <= e.draw[1]));
    }
}

// 转会邀约事件：接受挑战必须真的完成转会，且落点档位只能是「当前档」或「高一档」，
// 既不能越档也不能降档；留守选项必须实际抬高队伍磨合度（化学值）。曾经 p.league 恒为
// undefined 让所有档位类转会静默失效，这里用扰动断言守住「接受必定生效」。
function check_transfer_event() {
    const event = game.EVENTS.find(e => e.id === "transfer");
    assert.ok(event, "转会邀约事件存在");
    assert.equal(event.weight, 2);
    assert.ok(event.options[0].fx.transfer, "接受选项走 transfer 效果");
    assert.ok(event.options[1].fx.chem && event.options[1].fx.chem[0] > 0, "留守选项加磨合度");

    // 逐档位验证转会落点：同档与高一档都要出现，且从不越档或降档。
    let same = 0, up = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const world = new game.World(new game.Random(seed));
        const human = game.make_human(world, "transfer" + seed, "步枪手", new game.Random(seed + 1));
        for (const target of world.teams) {
            const from = human.team;
            const index = from.roster.indexOf(human);
            if (index >= 0) from.roster.splice(index, 1);
            target.roster.push(human);
            human.team = target;
            const before = target.tier;
            const message = game.transfer_offer(human, new game.Random(seed * 31 + before));
            assert.ok(message, `档位 ${before} 的转会邀约必须生效`);
            assert.notEqual(human.team, target, "转会必须换到别的队伍");
            const after = human.team.tier;
            assert.ok(after === before || after === before + 1, `落点档位 ${before} -> ${after} 越档`);
            if (after === before) same += 1; else up += 1;
        }
    }
    assert.ok(same > 0 && up > 0, "同档与升档都应出现");

    // 留守：同一份 fx 走一次 apply_effects，磨合度必须上升。
    const rng = new game.Random(99);
    const world = new game.World(rng);
    const human = game.make_human(world, "stay", "步枪手", new game.Random(100));
    const before = human.team.chemistry;
    game.apply_effects(human, event.options[1].fx, rng, []);
    assert.ok(human.team.chemistry > before, "留守必须抬高磨合度");
}

async function check() {
    // —— 基础规则 —— //
    assert.equal(game.ROLE_NAMES.length, 6);
    for (const weights of Object.values(game.ROLES)) {
        assert.ok(Math.abs(Object.values(weights).reduce((sum, w) => sum + w, 0) - 1) < 1e-12);
    }
    assert.deepEqual(Array.from([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]).map(game.round), [-2, -2, 0, 0, 2, 2]);
    assert.deepEqual(Array.from([0, 39, 40, 43, 44, 47, 48, 51, 52, 55, 56]).map(game.tier_of), [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
    assert.deepEqual(Array.from([63, 64, 71, 72, 79, 80, 86, 87, 93, 94, 99]).map(game.tier_of), [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    assert.deepEqual(plain(game.BOUNDS), [48, 52, 56, 64, 72, 80, 87, 94]);
    assert.equal(game.npc_retire_chance(28), 0);
    assert.equal(game.npc_retire_chance(40), 1);

    // 十四维位置加权：总评等于各属性按位置权重的加权和（半整数附近同样不能被浮点误差改变）。
    for (const [role, values] of [
        ["狙击手", [83, 28, 28, 37, 97, 2, 40, 55, 60, 30, 20, 50, 70, 66]],
        ["步枪手", [53, 99, 93, 32, 26, 30, 61, 44, 70, 55, 48, 40, 52, 58]],
        ["突破手", [58, 37, 28, 8, 48, 74, 82, 33, 40, 66, 25, 60, 44, 50]],
        ["辅助", [15, 70, 64, 65, 36, 98, 30, 52, 77, 64, 80, 55, 49, 45]],
    ]) {
        const attrs = Object.fromEntries(game.ATTR_KEYS.map((key, i) => [key, values[i]]));
        const expected = game.round(game.ATTR_KEYS.reduce((sum, key) => sum + game.ROLES[role][key] * attrs[key], 0));
        assert.ok(Math.abs(game.overall_of({role, ...attrs}) - expected) <= 1, `${role} 的加权总评`);
    }

    // —— 时间系统与赛历 —— //
    check_time_system();
    check_calendar();

    // —— 名单与实时名次的映射 —— //
    const rng = new game.Random(7);
    const world = new game.World(rng);
    assert.equal(game.VRS_TEAMS.length, TEAM_COUNT);
    assert.equal(game.VRS_TEAMS[0].name, "Spirit");
    assert.equal(game.VRS_TEAMS[99].rank, 100);
    assert.equal(source_ids.length, PLAYER_COUNT);
    assert.equal(new Set(source_ids).size, PLAYER_COUNT - 1);
    assert.equal(vrs_ids.length, 250);
    assert.equal(extra_ids.length, 250);
    assert.equal(new Set(extra_ids).size, 250);
    assert.ok(extra_ids.every(id => !vrs_ids.includes(id)));
    check_world(world);
    check_opening(world);
    check_transfer_event();
    // 每个名次区间映射到固定的档位（升降级规则）。
    for (const band of game.RANK_BANDS) {
        assert.equal(game.vrs_tier(band.min_rank), band.tier);
        assert.equal(game.vrs_tier(band.max_rank), band.tier);
    }
    assert.deepEqual(plain([1, 50, 51, 100].map(game.league_of)), [0, 0, 1, 1]);
    assert.deepEqual(plain([1, 50, 51, 100].map(game.league_key)), ["vrs", "vrs", "extra", "extra"]);
    assert.deepEqual(plain(Array.from(game.TIERS, (_, tier) => world.teams.filter(t => t.tier === tier).length)),
        [10, 20, 20, 8, 12, 14, 11, 5]);
    // 潜力沿名次严格递减，且世界前 50 名的潜力下限高于扩展联赛的上限。
    const sorted = world.teams.slice().sort((a, b) => a.rank - b.rank);
    assert.ok(sorted.every((team, i) => i === 0 || sorted[i - 1].potential_base > team.potential_base));
    const vrs_floor = Math.min(...world.teams.filter(t => t.rank <= 50).map(t => t.potential_base));
    const extra_ceiling = Math.max(...world.teams.filter(t => t.rank > 50).map(t => t.potential_base));
    assert.ok(extra_ceiling <= vrs_floor, `扩展联赛上限 ${extra_ceiling} 超过了前 50 名下限 ${vrs_floor}`);
    assert.ok(world.teams.every((team, i) => i === 0 || world.teams[i - 1].potential_base > team.potential_base));

    // —— 赛季积分：起点、累积、实时排名差收益 —— //
    assert.equal(game.START_RATING, 1000);
    assert.ok(world.teams.every(team => team.rating === game.START_RATING));
    assert.equal(world.teams.reduce((sum, team) => sum + team.rating, 0), game.START_RATING * TEAM_COUNT);
    // 同排名时赢 WIN_K/2、输 LOSS_K/2；赢多于输，一场结算的合计为正，因此不是零和。
    assert.ok(Math.abs(game.match_delta(50, 50, true) - game.WIN_K / 2) < 1e-9, "同排名取胜拿 WIN_K/2");
    assert.ok(Math.abs(game.match_delta(50, 50, false) + game.LOSS_K / 2) < 1e-9, "同排名落败扣 LOSS_K/2");
    assert.ok(game.match_delta(50, 50, true) + game.match_delta(50, 50, false) > 0, "胜负结算不再零和");
    // 排名差拉大：以强胜弱收益递减并趋近 0，以弱胜强收益递增。
    const even = game.match_delta(50, 50, true);
    const sweep = game.match_delta(1, 100, true);
    assert.ok(sweep < even, "以强胜弱拿得比势均力敌少");
    assert.ok(sweep < game.WIN_K * 0.1, "排名差拉满时以强胜弱趋近 0 分");
    assert.ok(game.match_delta(100, 1, true) > even * 1.5, "末位爆冷头名拿得最多");
    // 输球方向对称：输给越弱的对手扣得越多，输给强队几乎不扣。
    assert.ok(game.match_delta(1, 100, false) < -game.LOSS_K * 0.9, "以强输弱扣得最多");
    assert.ok(game.match_delta(100, 1, false) > -game.LOSS_K * 0.1, "以弱输强几乎不扣");
    const strong = world.teams[0], weak = world.teams[99];
    world.reset_season();
    assert.ok(strong.rank === 1 && weak.rank === TEAM_COUNT);
    const before_strong = strong.rating, before_weak = weak.rating;
    strong.play_match(weak, true);
    assert.ok(strong.rating > before_strong, "以强胜弱仍是正收益");
    assert.ok(before_weak - weak.rating < game.LOSS_K, "以弱输强损失很小");
    assert.ok((strong.rating - before_strong) + (weak.rating - before_weak) > 0, "一场结算的合计为正");
    world.reset_season();
    assert.ok(world.teams.every(team => team.rating === game.START_RATING), "赛季初全部回到 1000");
    // 实时排名由当前积分推出；全联盟同分时退回上一季末的名次。
    assert.equal(world.live_rank_of(strong), 1, "实时排名首位");
    assert.equal(world.live_rank_of(weak), TEAM_COUNT, "实时排名末位");
    assert.ok(world.teams.every(team => team.live_rank === team.rank), "赛季初实时排名回到上一季末名次");
    // 开季时冻结的引用期名次等于当时的实时名次。
    assert.ok(world.teams.every(team => team.ref_rank === team.rank));

    // —— 名额规则：主赛分档 + 地区赛并行 —— //
    assert.equal(game.MAIN_DRAW_MAX, 44);
    assert.equal(game.BAND_SIZE, 25);
    assert.equal(game.BAND_COUNT, 4);
    const rankOf = rank => world.teams.find(t => t.rank === rank);
    for (const event of game.ANNUAL_CALENDAR.filter(e => e.grade === "S")) {
        assert.equal(game.team_invited(rankOf(1), event), true);
        assert.equal(game.team_invited(rankOf(28), event), true);
        assert.equal(game.team_invited(rankOf(29), event), true, "29～36 名走预选名额");
        assert.equal(game.team_invited(rankOf(37), event), false);
        assert.equal(game.team_invited(rankOf(60), event), false);
    }
    for (const event of game.A_EVENTS) {
        // A 级名额 1～32：顶级豪门与世界强队同样受邀，32 队分 4 组每组 8 队、前二进淘汰赛。
        assert.equal(game.team_invited(rankOf(1), event), true, "顶级豪门也打 A 级");
        assert.equal(game.team_invited(rankOf(8), event), true);
        assert.equal(game.team_invited(rankOf(9), event), true);
        assert.equal(game.team_invited(rankOf(32), event), true);
        assert.equal(game.team_invited(rankOf(33), event), false, "A 级只邀 1～32 名");
    }
    // 地区赛按 25 队一档抽签，同一名次不会同时拿到主赛与地区赛的名额。
    for (const event of game.ANNUAL_CALENDAR.filter(e => e.circuit === "regional")) {
        for (let rank = 1; rank <= TEAM_COUNT; rank++) {
            const inBand = rank >= event.draw[0] && rank <= event.draw[1];
            if (!inBand) continue;
            assert.ok(event.draw[1] - event.draw[0] + 1 <= 50, `${event.name} 的档过大`);
        }
    }

    // —— 一站赛事：赛制、场次与名次分布 —— //
    world.reset_season();
    // S 级与 Major 同制：三阶段阶梯瑞士轮（竞争组/挑战组/传奇组，各 16 队锁线取 8），
    // 出线后 8 强单败，八强/半决赛 Bo3、决赛 Bo5。
    const event = game.ANNUAL_CALENDAR.find(e => e.key === "S1");
    assert.equal(event.format, "major");
    const participants = game.world_participants(world, event, null);
    assert.equal(participants.length, event.teams);
    assert.ok(participants.every(t => t.league === "vrs"), "S 级主赛只由 VRS 联赛球队参加");
    assert.equal(new Set(participants).size, participants.length);
    const total_before = world.teams.reduce((sum, t) => sum + t.rating, 0);
    for (const team of world.teams) {
        team.tour_wins = 0;
        team.tour_losses = 0;
    }
    const summary = game.run_tournament(participants, event, rng, new Map(), true);
    assert.equal(summary.teams.length, event.teams);
    assert.equal(summary.standings.length, event.teams);
    assert.equal(new Set(summary.standings).size, event.teams);
    assert.equal(summary.champion, summary.standings[0]);
    assert.equal(summary.runner_up, summary.standings[1]);
    // 锁线瑞士轮里晋级者恒为 3 胜，因此「打过几个阶段」直接决定总胜场：
    // 冠军 = 3 × 阶段数(1～3) + 淘汰赛三连胜，只可能是 6 / 9 / 12 胜。
    assert.ok([6, 9, 12].includes(summary.champion.tour_wins),
        `冠军应走完 N 个阶梯阶段 + 淘汰赛三连胜，实际 ${summary.champion.tour_wins} 胜`);
    assert.ok(summary.champion.tour_losses <= 6, "冠军最多在每个阶段各吞 2 负");
    assert.ok([5, 8, 11].includes(summary.runner_up.tour_wins),
        `亚军应走完 N 个阶梯阶段 + 淘汰赛两胜，实际 ${summary.runner_up.tour_wins} 胜`);
    assert.ok(summary.runner_up.tour_losses >= 1 && summary.runner_up.tour_losses <= 6);
    // 名次分布：8 强之后都算小组出局。
    const places = {};
    summary.standings.forEach((team, i) => {
        const label = game.placement_text(i + 1, event.teams);
        places[label] = (places[label] || 0) + 1;
    });
    assert.equal(places["冠军"], 1);
    assert.equal(places["亚军"], 1);
    assert.equal(places["四强"], 2);
    assert.equal(places["八强"], 4);
    assert.equal(places["小组出局"], 24);
    // 场次不是定值（每个阶段 33 场 + 淘汰赛 7 场，但每队只打自己够得着的阶段）：
    // 每队至少打满一个阶段的 3 场，最多三个阶段各 5 场 + 淘汰赛 3 场。
    for (const team of summary.teams) {
        const games = team.tour_wins + team.tour_losses;
        assert.ok(games >= 3 && games <= 18, `${team.name} 在 ${event.name} 打了 ${games} 场`);
    }
    // 每个阶段恒为 33 场（8+8+8+6+3，锁线规则把 16 队的对阵数完全定死），
    // 加上淘汰赛 4+2+1 = 7 场，一整站恰好 3 × 33 + 7 = 106 场。
    assert.equal(summary.standings.reduce((sum, team) => sum + team.tour_wins + team.tour_losses, 0),
        2 * (3 * 33 + 4 + 2 + 1));
    assert.ok(world.teams.reduce((sum, t) => sum + t.rating, 0) > total_before, "累积制：赛事后总积分增加");
    // 逐图统计：每名选手的地图数等于本队打过的图数，数据都在合理区间。
    const leaders = game.event_leaders(summary);
    assert.equal(leaders.stats.length, event.teams * 5);
    for (const entry of leaders.stats) {
        assert.ok(entry.maps >= 3, `${entry.player.id} 只打了 ${entry.maps} 图`);
        assert.ok(entry.rating >= 0.20 && entry.rating <= 2.20, `${entry.player.id} 的 Rating 越界`);
        assert.ok(entry.kills >= entry.maps && entry.kills <= entry.maps * 46, `${entry.player.id} 的击杀异常`);
        assert.ok(entry.deaths >= entry.maps * 3 && entry.deaths <= entry.maps * 42);
        assert.ok(entry.adr >= 15 && entry.adr <= 165);
        assert.ok(entry.kast >= 30 && entry.kast <= 96);
        const st = entry.player.ev_stats[event.key];
        assert.equal(st.maps, entry.maps);
        assert.equal(st.kills, entry.kills);
    }
    // 击杀榜按总击杀降序，表现榜按 Rating 降序。
    assert.ok(leaders.by_kills.every((e, i) => i === 0 || leaders.by_kills[i - 1].kills >= e.kills));
    assert.ok(leaders.by_rating.every((e, i) => i === 0 || leaders.by_rating[i - 1].rating >= e.rating));
    // 队伍场均 Rating 落在队员 Rating 的区间里。
    const teamRating = game.team_event_rating(summary.champion, event);
    const memberRatings = leaders.stats.filter(e => e.team === summary.champion).map(e => e.rating);
    assert.ok(teamRating >= Math.min(...memberRatings) && teamRating <= Math.max(...memberRatings));
    assert.ok(summary.champion.roster.every(p => p.yr_ratings.length === 1));

    // —— 各赛制都能完整跑完，且每队只打一次同一站 —— //
    const format_keys = ["B1", "A1", "S1", "S3"];
    format_keys.push(game.ANNUAL_CALENDAR.find(e => e.circuit === "regional").key);
    for (const key of format_keys) {
        const item = game.ANNUAL_CALENDAR.find(e => e.key === key);
        world.reset_season();
        for (const player of world.players) player.reset_year();
        const bracket = game.world_participants(world, item, null);
        for (const team of world.teams) {
            team.tour_wins = 0;
            team.tour_losses = 0;
        }
        const result = game.run_tournament(bracket, item, rng, new Map(), true);
        assert.equal(result.teams.length, item.teams, `${item.name} 的参赛队伍数`);
        assert.equal(new Set(result.teams).size, item.teams, `${item.name} 有重复参赛队`);
        // 名次表必须覆盖全部参赛队伍。
        assert.equal(result.standings.length, item.teams, `${item.name} 的名次表`);
        assert.equal(new Set(result.standings).size, item.teams, `${item.name} 的名次表有重复`);
        // 冠军在淘汰赛里一场不输；小组赛或瑞士轮阶段允许输球。
        if (item.format === "standard") {
            // 4 组 × 8 队：小组 7 场 + 淘汰赛 3 场，冠军至少赢下淘汰赛的 3 场。
            assert.ok(result.champion.tour_wins >= 3, `${item.name} 的冠军场次偏少`);
            assert.ok(result.champion.tour_wins + result.champion.tour_losses <= 10);
        }
        if (item.format === "major") {
            // 阶梯瑞士轮：冠军走完 1～3 个阶段（每阶段 3 胜、最多 2 负）+ 淘汰赛三连胜，故总胜场只可能是 6/9/12。
            assert.ok([6, 9, 12].includes(result.champion.tour_wins), `${item.name} 的冠军场次异常`);
            assert.ok(result.champion.tour_losses <= 6, `${item.name} 的冠军败场偏多`);
        }
        if (item.format === "regional") {
            // 4 轮瑞士轮 + 8 强单败：冠军的淘汰赛 3 场全胜，瑞士轮阶段可能输球。
            assert.ok(result.champion.tour_wins >= 4, `${item.name} 的冠军场次偏少`);
            assert.ok(result.champion.tour_losses <= 3, `${item.name} 的冠军败场偏多`);
        }
        assert.ok(result.standings[0] === result.champion && result.standings[1] === result.runner_up);
        // 阶梯瑞士轮要连打最多三个阶段，因此 Major/S 级的场次上限比单阶段赛制高得多。
        const max_games = item.format === "major" ? 18 : 12;
        for (const team of result.teams) {
            assert.ok(team.tour_wins + team.tour_losses >= 1, `${team.name} 在 ${item.name} 一场未打`);
            assert.ok(team.tour_wins + team.tour_losses <= max_games,
                `${team.name} 在 ${item.name} 打了太多场`);
        }
    }

    // —— 玩家赛程：名额判定、地区赛补位、主赛缺席 —— //
    const human = game.make_human(world, "test", "狙击手", rng);
    check_world(world, human);
    assert.equal(human.team.league, "extra");
    assert.equal(human.team.tier, 0, "玩家从扩展联赛丙级（倒数 1～10 名）起步");
    assert.ok(human.team.rank >= 91 && human.team.rank <= 100);
    assert.equal(human.contract_left, 1, "首份合同为 1 年");

    // —— 队伍磨合度：中性基准、实力映射、人员变动与事件效果 —— //
    {
        // 玩家入队就是一次阵容变动：从「刚组建」的基准再扣一次。
        assert.equal(human.team.chemistry, game.CHEM_START + game.CHEM_ROSTER_CHANGE,
            "玩家入队后应从基准扣一次人员变动");

        const probe = new game.Team({name: "chem-probe", rank: 5});
        const mult = chem => { probe.chemistry = chem; return Math.round(game.chem_multiplier(probe) * 1000) / 1000; };
        assert.equal(mult(game.CHEM_START), 1, "100% 应当是中性基准");
        assert.equal(mult(0), 0.95);
        assert.equal(mult(game.CHEM_MAX), 1.1);
        assert.equal(mult(game.CHEM_MAX + 500), 1.1, "超过上限不该继续放大");
        // 增益递减：150 以下全额、300 归零，否则一个赛季就会贴顶并永久静止。
        assert.equal(game.chem_gain_scale(game.CHEM_SOFT_FROM), 1);
        assert.equal(game.chem_gain_scale(150), 1);
        assert.equal(game.chem_gain_scale(game.CHEM_MAX), 0);
        assert.ok(game.chem_gain_scale(225) < 1 && game.chem_gain_scale(225) > 0);

        // 人员变动只对玩家所在队伍生效：NPC 队伍必须保持中性，不扰动已校准的世界。
        assert.ok(game.human_team(human.team), "玩家所在队伍应当被识别");
        const npc_team = world.teams.find(t => t !== human.team && !game.human_team(t));
        const npc_before = npc_team.chemistry;
        game.note_roster_change(npc_team);
        game.note_coach_change(npc_team);
        assert.equal(npc_team.chemistry, npc_before, "NPC 队伍的磨合度不该变动");

        const human_before = human.team.chemistry;
        game.note_roster_change(human.team);
        assert.equal(human.team.chemistry, human_before + game.CHEM_ROSTER_CHANGE, "队内人员进出应当扣磨合度");
        game.note_coach_change(human.team);
        assert.equal(human.team.chemistry, human_before + game.CHEM_ROSTER_CHANGE + game.CHEM_COACH_CHANGE,
            "教练更换应当扣磨合度");
        game.adjust_chemistry(human.team, 9999);
        assert.equal(human.team.chemistry, game.CHEM_MAX, "磨合度应当封顶在 300");

        // 随机事件里的磨合度效果：要真的改数、要写进结果行、也要在事件卡上给出方向标签。
        human.team.chemistry = 150;
        const lines = [];
        game.apply_effects(human, {chem: [10, 10]}, rng, lines);
        assert.equal(human.team.chemistry, 160, "事件的 chem 效果应当改磨合度");
        assert.ok(lines.some(line => line.includes("磨合度")), "磨合度变化应当出现在事件结果行里");
        assert.ok(game.option_hint({chem: [10, 10]}, human.role).some(hint => hint.text.includes("磨合度")),
            "事件卡应当标出磨合度方向");
        game.apply_effects(human, {chem: [-999, -999]}, rng, []);
        assert.equal(human.team.chemistry, 0, "磨合度应当有 0 下限");

        // 扰动生效：同一个 seed 逐次配对比较，只改磨合度，胜负必须跟着变（防止系数没接上而空转）。
        human.team.chemistry = game.CHEM_START;
        // 对手取同档位的另一支队伍，双方实力接近，胜负才由磨合度这一项主导。
        const foe = world.teams.find(t => t !== human.team && t.tier === human.team.tier);
        const tally = chem => {
            let wins = 0;
            for (let i = 0; i < 60; i++) {
                human.team.chemistry = chem;
                const event = {key: `chem-${chem}-${i}`, name: "磨合度校验", grade: "B", is_major: false};
                const result = game.simulate_series(human.team, foe, event, new game.Random(1000 + i),
                    new Map(), 3, false);
                if (result.winner === human.team) wins += 1;
            }
            return wins;
        };
        const low = tally(0);
        const high = tally(game.CHEM_MAX);
        assert.ok(high > low, `磨合度应当影响胜负：300% 的 ${high} 胜不该少于 0% 的 ${low} 胜`);
        human.team.chemistry = game.CHEM_START;
    }
    for (const rank of [1, 12, 25, 40, 50]) {
        world.reset_season();
        const team = world.teams.find(t => t.rank === rank);
        assert.equal(team.ref_rank, rank);
    }
    world.reset_season();
    for (const seed of [0, 1, 2]) {
        const probe = game.make_human(world, "probe" + seed, "步枪手", new game.Random(seed));
        const plan = game.human_year_plan(probe);
        const plays = plan.filter(item => item.plays);
        // 主赛的 18 站全部出现在赛程里，没名额的站以「旁观」形式推进时间。
        assert.equal(plan.filter(item => item.event.circuit === "main").length, 18);
        assert.ok(plays.length >= 4, `玩家全年只有 ${plays.length} 站比赛`);
        // 赛程里的每一站都必须与自己算出来的名额判定一致。
        const recomputed = [];
        for (const item of plan) {
            if (item.event.circuit !== "main") continue;
            // 口径必须与 human_year_plan 内部一致：按该站自己的引用期名次判定。
            const ok = game.event_allows(item.event, world.entry_rank_at(probe.team, item.event));
            recomputed.push([item.event.key, ok]);
            assert.equal(item.plays, ok, `${item.event.name} 的名额判定不一致`);
        }
        assert.deepEqual(recomputed.map(([, ok]) => ok).filter(Boolean).length,
            plan.filter(item => item.plays && item.event.circuit === "main").length);
        // R5：同一天不能打两站官方赛事。
        const byDay = new Map();
        for (const item of plays) {
            assert.ok(!byDay.has(item.event.start_day), `${probe.id} 同一天打两站`);
            byDay.set(item.event.start_day, item.event);
        }
        world.players.pop();
        probe.team.roster.pop();
        probe.team.dirty = true;
        world.gen_npc(probe.team, probe.role);
    }

    // —— 引用期锁定：名单只认「开赛日前 4 周」那一刻的名次 —— //
    // 两个方向都要守住：引用期之前打出的成绩必须改变本站名单（否则等于赛季初锁定），
    // 引用期一过本站就定死，之后再怎么升降都不再影响它（否则同一站会给出两份名单）。
    {
        world.reset_season();
        // 挑一站引用期落在赛季中，这样才有「引用期之前」的名次变化可言。
        const event = game.ANNUAL_CALENDAR.find(e =>
            e.circuit === "main" && game.reference_day(e.start_day) > 1);
        const ref_day = game.reference_day(event.start_day);
        const roster = () => game.world_participants(world, event, null).map(t => t.name);
        const open_list = roster();

        // 引用期之前把名次搅乱：原本 51～100 名冲到榜首、1～50 名跌到谷底，然后记快照。
        world.teams.forEach((team, i) => { team.rating = i < 50 ? 400 + i : 2000 + i; });
        world.invalidate_live_ranks();
        assert.equal(world.live_rank_of(world.teams[99]), 1, "实时排名应当被搅乱");
        world.snapshot_ranks(ref_day);
        const at_ref = roster();
        assert.notDeepEqual(at_ref, open_list, "引用期之前的名次变化必须改变本站名单");

        // 引用期之后再彻底搅乱一次并记快照：本站名单必须纹丝不动。
        world.teams.forEach((team, i) => { team.rating = i < 50 ? 2500 + i : 400 + i; });
        world.invalidate_live_ranks();
        world.snapshot_ranks(ref_day + 10);
        assert.deepEqual(roster(), at_ref, "引用期过后，本站名单不得再受名次变化影响");

        // 引用期之后的变化应当落到「引用期更晚」的站点上。
        const later = game.ANNUAL_CALENDAR.find(e =>
            e.circuit === "main" && game.reference_day(e.start_day) > ref_day + 10);
        const later_before = game.world_participants(world, later, null).map(t => t.name);
        world.teams.forEach((team, i) => { team.rating = i < 50 ? 400 + i : 3000 + i; });
        world.invalidate_live_ranks();
        world.snapshot_ranks(game.reference_day(later.start_day));
        assert.notDeepEqual(game.world_participants(world, later, null).map(t => t.name), later_before,
            "引用期更晚的站点应当看到后来的名次变化");
    }
    world.reset_season();

    // —— 赛程滑块与播报：「可参加」集合的变化必须双向可观测 —— //
    // 右栏滑块列出今年可参加的站（已打完的在前、未开赛的在后），集合按各站引用期名次现算：
    // 名次够上了要能播「可参加」，掉出去要能播「已失去」；引用期一过该站定死，要播「已锁定」，
    // 且只播一次。已开赛的站只是从「未来」挪进「已结束」（仍在表里），绝不能被当成「失去资格」。
    {
        world.reset_season();
        const probe = game.make_human(world, "slider", "步枪手", new game.Random(11));
        // 玩家从 91～100 名起步：赛季初只有丙级档地区赛可打，且全部在未来。
        const open = game.schedule_snapshot(probe, 0);
        assert.ok(open.length > 0, "赛季初应当有地区赛可打");
        assert.ok(open.every(item => !item.played && item.days > 0), "赛季初不该出现已打完的站");
        assert.ok(game.upcoming_matches(probe, 0).length === open.length, "赛季初的站都应是未开赛的");

        // 名次冲到第 1 并记快照（等价于赛季中打出成绩）：后面各站的资格推断必须跟着变。
        world.teams.forEach(team => { team.rating = 400; });
        probe.team.rating = 2500;
        world.invalidate_live_ranks();
        assert.equal(world.live_rank_of(probe.team), 1, "实时排名应当被搅乱");
        world.snapshot_ranks(1);
        const up = game.schedule_snapshot(probe, 0);
        const gained = game.diff_schedule(open, up);
        assert.ok(gained.added.length > 0, "名次大涨后应当拿到更多站的参赛资格");
        // 分档不同：升到第 1 就不再打丙级档地区赛，因此「增」与「减」是同时发生的。
        assert.ok(gained.lost.length > 0, "升到第 1 应当丢掉原来的丙级档地区赛");
        assert.equal(gained.locked.length, 0, "引用期还没到，不该有站被锁定");
        const added_lines = game.schedule_notice_lines(gained.added, "added", world.live_rank_of(probe.team))
            .map(text => text.replace(/\x1b\[[0-9;]*m/g, ""));
        assert.equal(added_lines.length, gained.added.length);
        assert.ok(added_lines.every(text =>
            /^根据当前排名战队排名 #1，可参加 .+，比赛日期 \d{4}\/\d+\/\d+ -- \d{4}\/\d+\/\d+，名额将在引用期 \d{4}\/\d+\/\d+ 确定$/
                .test(text)), `可参加播报格式不符：${added_lines[0]}`);

        // 名次再跌到末位：反向同样可观测（否则播报只是单向装饰）。
        world.teams.forEach(team => { team.rating = 2500; });
        probe.team.rating = 400;
        world.invalidate_live_ranks();
        assert.equal(world.live_rank_of(probe.team), TEAM_COUNT, "实时排名应当再被搅乱");
        world.snapshot_ranks(2);
        const down = game.schedule_snapshot(probe, 0);
        const lost = game.diff_schedule(up, down);
        assert.ok(lost.lost.length > 0, "名次大跌后应当失去主赛名额");
        assert.ok(lost.added.length > 0, "名次大跌后会掉回低档地区赛");
        assert.ok(game.schedule_notice_lines(lost.lost, "lost", TEAM_COUNT)
            .every(text => text.replace(/\x1b\[[0-9;]*m/g, "").includes("已失去")), "失去资格播报格式不符");

        // 引用期一过该站资格定死：只播一次「已锁定」，再对比不再重复。
        const target = down[down.length - 1];
        const ref = game.reference_day(target.start_day);
        assert.ok(ref > 2, "挑到的站引用期应落在快照之后");
        const at = day => game.schedule_snapshot(probe, day).find(item => item.key === target.key);
        assert.equal(at(ref - 1).locked, false, "引用期之前不应算已锁定");
        assert.equal(at(ref).locked, true, "引用期当天应转为已锁定");
        const locking = game.diff_schedule([at(ref - 1)], [at(ref)]);
        assert.deepEqual(plain(locking.locked.map(item => item.key)), [target.key]);
        assert.ok(game.schedule_notice_lines(locking.locked, "locked", 0)[0]
            .replace(/\x1b\[[0-9;]*m/g, "").startsWith("你所在战队已锁定"), "锁定播报格式不符");
        assert.equal(game.diff_schedule([at(ref)], [at(ref)]).locked.length, 0, "已锁定的站不应重复播报");

        // 已开赛的站从「未来」挪进「已结束」：仍在表里，不算失去资格。
        const target_end = game.ANNUAL_CALENDAR.find(item => item.key === target.key).end_day;
        const past = at(target_end + 1);
        assert.equal(past.played, true, "赛期已过的站应归入已结束");
        assert.equal(game.diff_schedule([at(ref)], [past]).lost.length, 0, "已开赛的站不算失去资格");
        assert.ok(past.days === undefined, "已结束的站不再带距今天数");

        probe.world.players.pop();
        probe.team.roster.pop();
        probe.team.dirty = true;
        world.gen_npc(probe.team, probe.role);
    }
    world.reset_season();

    // —— 玩家：事件、转会、合同、退役 —— //
    human.year = 4;
    for (const key of game.ATTR_KEYS) human[key] = 50;
    // 辅助的核心属性「道具」权重最高：同一事件里它的成长应高于非核心的「预瞄」。
    // 区间取大值只为放大 factor 差异、回避单次随机波动。
    game.apply_effects(human, {role: "辅助", preaim: [40, 40], utility: [40, 40], composure: [40, 40]}, rng, []);
    assert.equal(human.role, "辅助");
    assert.equal(human.last_role_year, 4);
    assert.ok(human.utility - 50 > human.preaim - 50, "辅助的道具成长应高于预瞄");
    assert.ok(human.utility - 50 >= human.composure - 50, "辅助的道具成长不低于抗压");
    // 标准档（EVENT_SCALE = 0.5）下真实小区间不再被取整归零；用独立随机源，避免扰动主随机流。
    const preaim_before = human.preaim;
    game.apply_effects(human, {preaim: [3, 5]}, new game.Random(1), []);
    assert.ok(human.preaim - preaim_before > 0, "真实小区间在标准档下不应被归零");
    // 选项方向标签：只标注该位置上缩放取整后仍可能变化的属性（辅助的道具高权重、突破极低权重）。
    const hints = game.option_hint({utility: [3, 5], entry: [1, 2], preaim: [-2, 1]}, "辅助");
    const tone_of = Object.fromEntries(hints.map(hint => [hint.text.split(" ")[0], hint.tone]));
    assert.equal(tone_of["道具"], "up", "辅助的道具应标为上升");
    assert.equal(tone_of["预瞄"], "down", "预瞄区间偏负应标为下降");
    assert.equal(tone_of["突破"], undefined, "辅助的突破权重极低且区间小，实际不涨，不应标注");
    assert.ok(game.option_hint({tier: 1}, "辅助").some(hint => hint.text === "转会升档"));
    // 位置侧重函数：道具一项，指挥（权重 0.10）明显高于突破手（权重 0.02）。
    assert.ok(game.role_attr_factor("指挥", "utility") > game.role_attr_factor("突破手", "utility") * 2);
    // 属性下限联动：表现属性高时，关联的基础属性不会低（单向保底，反向不成立）。
    const floored = Object.fromEntries(game.ATTR_KEYS.map(key => [key, 50]));
    floored.entry = 90;
    game.apply_attribute_floors(floored);
    assert.ok(floored.reaction >= 85 && floored.positioning >= 82 && floored.movement >= 80, "突破 90 应把反应/定位/身法抬到下限");
    assert.equal(floored.preaim, 82, "突破 90 → 预瞄 ≥ 82");
    assert.equal(floored.entry, 90, "保底不会反向抬高表现属性");
    assert.ok(game.ATTR_FLOORS.composure.length === 0 && game.ATTR_FLOORS.stability.length === 0, "心态类表现属性不与基础挂钩");
    const role_event = game.EVENTS.find(event => event.id === "role_awp");
    // 玩家现在从扩展联赛起步；这里临时把队伍当作 VRS 联赛，验证档位门槛按「相对档位」判定。
    const saved_tier = human.team.tier;
    const saved_league = human.team.league;
    human.team.league = "vrs";
    human.team.tier = game.VRS_BASE_TIER;
    human.team.dirty = true;
    assert.equal(human.tier_index, game.VRS_BASE_TIER, "tier_index 必须随球队读取");
    human.year = 6;
    assert.equal(role_event.cond(human, false), false, "挑战者档不触发转狙击手");
    human.team.tier = game.VRS_BASE_TIER + 1;
    assert.equal(role_event.cond(human, false), false, "三年冷却未满");
    human.year = 7;
    assert.equal(role_event.cond(human, false), true);
    human.team.tier = saved_tier;
    human.team.league = saved_league;

    // 玩家转会和 NPC 多轮交易都不能破坏阵容、不能把玩家交易走，也不能跨联赛搬运选手。
    const target = world.teams.find(team => team.league === human.team.league && team.tier === 2);
    game.move_to_team(world, human, target, rng);
    check_world(world, human);
    for (let i = 0; i < 20; i++) world.simulate_transfers(rng);
    assert.equal(human.team, target);
    check_world(world, human);
    assert.ok(world.teams.every(team => team.roster.every(p => p.team === team)));
    assert.equal(world.players.filter(p => p.is_human).length, 1);

    // 属性缓存：属性变化后总评与球队强度必须立刻重算。
    const cached = world.teams[10];
    const value_before = cached.strength();
    const boosted = cached.roster[0];
    for (const key of game.ATTR_KEYS) boosted[key] = 99;
    game.invalidate(boosted);
    assert.ok(cached.strength() > value_before, "球队强度缓存没有失效");

    // 所有位置采用同一年龄曲线：身体类衰退，意识/心态类不下降，道具持平。
    const low = {randint: min => min};
    for (const [age, expected] of [[21, 53], [26, 51], [28, 50], [29, 47]]) {
        for (const key of game.ATTR_KEYS) human[key] = 50;
        Object.assign(human, {age, injured: false});
        game.growth(human, low);
        assert.equal(human.preaim, expected);
        assert.equal(human.entry, expected);
        if (age === 29) {
            assert.equal(human.info, 50, "意识类属性不随年龄下降");
            assert.equal(human.utility, 50, "道具持平");
        }
    }
    human.injured = true;
    game.growth(human, low);
    assert.equal(human.injured, false);

    // 角色状态：每次刷新最多移动一档；稳定性越高，好状态持续越久、差状态越短。
    human.form = game.FORM_NEUTRAL;
    human.form_days = 0;
    human.stability = 50;
    let prev_form = human.form;
    const form_rng = new game.Random(3);
    for (let i = 0; i < 300; i++) {
        game.update_form(human, form_rng);
        assert.ok(Math.abs(human.form - prev_form) <= 1, "状态每次最多移动一档");
        prev_form = human.form;
    }
    assert.ok(human.form_days >= 3, "状态持续天数有下限");
    assert.ok(game.form_duration(5, 0.8) > game.form_duration(5, -0.8), "高稳定让 Life Game 更久");
    assert.ok(game.form_duration(0, 0.8) < game.form_duration(0, -0.8), "高稳定让 昏迷 更短");
    assert.equal(game.form_multiplier({form: game.FORM_NEUTRAL}), 1, "普通状态不修正表现");
    assert.equal(game.form_multiplier({}), 1, "无状态（NPC）不修正表现");

    // 练习赛：每周抽一支**同档位**的队伍（随机、不重复抽到自己）。
    {
        const tier = human.team.tier;
        const probe_rng = new game.Random(11);
        const seen = new Set();
        for (let i = 0; i < 80; i++) {
            const opponent = game.practice_opponent(world, human.team, probe_rng);
            assert.ok(opponent && opponent !== human.team, "练习赛必须抽到别的队伍");
            assert.equal(opponent.tier, tier, "练习赛对手必须与玩家队伍同档位");
            seen.add(opponent);
        }
        assert.ok(seen.size > 1, "练习赛对手应当是随机的，而不是固定同一支");
    }

    // 年内平均 Rating 的口径：有出场记录取本赛季均值，全空时返回 0（调用方据此跳过调整）。
    {
        const saved_yr = human.yr_ratings;
        const saved_career = human.rating_all;
        human.yr_ratings = [];
        human.rating_all = [];
        assert.equal(game.year_rating_baseline(human), 0, "没有任何记录时基准为 0");
        human.yr_ratings = [1.0, 1.2];
        assert.ok(Math.abs(game.year_rating_baseline(human) - 1.1) < 1e-9, "有记录时取年内均值");
        human.yr_ratings = saved_yr;
        human.rating_all = saved_career;
    }

    // 状态微调：明显高于年内均值升一档、明显低于降一档，小幅波动不动；每次最多一档且不越界。
    {
        human.form = game.FORM_NEUTRAL;
        human.stability = 50;
        assert.equal(game.adjust_form_by_practice(human, 1.30, 1.00), 1, "打得明显更好应升一档");
        assert.equal(human.form, game.FORM_NEUTRAL + 1);
        assert.equal(game.adjust_form_by_practice(human, 0.70, 1.00), -1, "打得明显更差应降一档");
        assert.equal(human.form, game.FORM_NEUTRAL);
        assert.equal(game.adjust_form_by_practice(human, 1.05, 1.00), 0, "小幅波动不改变状态");
        assert.equal(human.form, game.FORM_NEUTRAL);
        assert.equal(game.adjust_form_by_practice(human, 1.50, 0), 0, "基准缺失时不做调整");
        human.form = game.FORM_STATES.length - 1;
        assert.equal(game.adjust_form_by_practice(human, 1.50, 1.00), 0, "已在最高档不再上升");
        human.form = 0;
        assert.equal(game.adjust_form_by_practice(human, 0.50, 1.00), 0, "已在最低档不再下降");
        human.form = game.FORM_NEUTRAL;
        human.form_days = 0;
    }

    // 一场完整练习赛：只在生涯日志里留一行摘要，**积分 / 排名 / 战绩 / 赛季统计一律不动**。
    {
        const before = world.teams.map(team => ({
            rating: team.rating, wins: team.wins, losses: team.losses, matches: team.matches,
        }));
        const stats_before = Object.keys(human.ev_stats).length;
        const logged = [];
        const saved_yr = human.yr_ratings;
        const saved_weights = human.yr_rating_weights;
        // 年内 Rating 只由正式赛事写入（finalize_event → record_performance），练习赛不得追加任何一条。
        human.yr_ratings = [1.0];
        human.yr_rating_weights = [1.0];
        const season_maps_before = Object.values(human.ev_stats).reduce((sum, st) => sum + st.maps, 0);
        human.form = game.FORM_NEUTRAL;
        human.stability = 50;
        await game.play_practice_match(human, new game.Random(21), {
            write() {}, log(entry) { logged.push(entry); },
        }, 30, game.game_date(game.START_YEAR, 30));
        // 摘要格式（去掉颜色码后逐字对齐）：
        // 【练习赛】X 战胜 Y  (2:1)   Rating 0.87  状态↓
        const plain = text => text.replace(/\x1b\[[0-9;]*m/g, "");
        assert.equal(logged.length, 1, "一场练习赛只留一条日志条目");
        assert.equal(logged[0].kind, "match");
        assert.match(logged[0].date, /^\d+\/\d+$/);
        const line = plain(logged[0].lines[0]);
        const expected = new RegExp(`^【练习赛】${human.team.name} (战胜|负于) .+  \\(\\d:\\d\\)   ` +
            `Rating \\d\\.\\d\\d(  状态[↑↓])?$`);
        assert.ok(expected.test(line), `练习赛摘要格式不符：${line}`);
        // 胜/负与比分必须自洽（先到 2 胜者赢，Bo3 共 2～3 图）。
        const won = line.includes("战胜");
        const [, mine, theirs] = line.match(/\((\d):(\d)\)/);
        assert.equal(won, Number(mine) > Number(theirs), "摘要的胜负与比分不符");
        assert.equal(Math.max(Number(mine), Number(theirs)), 2, "Bo3 应有一方先到 2 胜");
        // 状态只能由本场表现驱动（这里没有别的刷新）：箭头与 form 的移动方向一致。
        const moved = line.includes("状态↑") ? 1 : line.includes("状态↓") ? -1 : 0;
        assert.equal(human.form, game.FORM_NEUTRAL + moved, "日志里的状态方向与实际不符");
        // 积分 / 排名 / 战绩 / 赛季统计全部原样。
        world.teams.forEach((team, i) => {
            assert.equal(team.rating, before[i].rating, `${team.name} 的积分被练习赛改动`);
            assert.equal(team.wins, before[i].wins, `${team.name} 的胜场被练习赛改动`);
            assert.equal(team.losses, before[i].losses, `${team.name} 的负场被练习赛改动`);
            assert.equal(team.matches, before[i].matches, `${team.name} 的场次被练习赛改动`);
        });
        assert.equal(Object.keys(human.ev_stats).length, stats_before, "练习赛不得写进赛季统计");
        // 赛季 Rating（年内平均 Rating 与生涯平均 Rating 的来源）必须与练习赛无关。
        assert.deepEqual(Array.from(human.yr_ratings), [1.0], "练习赛不得写进年内 Rating");
        assert.deepEqual(Array.from(human.yr_rating_weights), [1.0], "练习赛不得写进年内 Rating 权重");
        assert.equal(Object.values(human.ev_stats).reduce((sum, st) => sum + st.maps, 0), season_maps_before,
            "练习赛不得改变本赛季地图数");
        human.yr_ratings = saved_yr;
        human.yr_rating_weights = saved_weights;
    }

    // 合同邀约只在同一联赛内产生，选择转会后现役席位总数不变。
    human.age = 23;
    let contract_options;
    const contract_team = human.team;
    await game.contract_decision(world, human, rng, false, {
        write() {},
        async choose(prompt, options) { contract_options = options; return 1; },
    });
    assert.equal(contract_options[0], "续约留队");
    assert.ok(contract_options.length <= 4 && contract_options.length > 1);
    assert.ok(Math.abs(human.team.tier - contract_team.tier) <= 1);
    assert.equal(human.team.league, contract_team.league);
    assert.notEqual(human.team, contract_team);
    check_world(world, human);
    // 退役：自动模式按年龄判定，玩家一侧由界面上的「退役」按钮随时触发（io.choose 返回 RETIRE）。
    assert.equal(await game.ask_retire({age: 29}, true), null);
    assert.equal(await game.ask_retire({age: 30}, true), "征战多年后选择退役");
    assert.equal(await game.ask_retire({age: 32}, false), null);
    // 等待点返回 RETIRE 时立即结束生涯：当年剩余赛程跳过，retire_reason 标记为主动退役。
    const retire_player = await game.run_game("retire", "步枪手", 3, false, {
        write() {}, async simulate() {},
        async choose(prompt, options, meta) { return meta && meta.allow_retire ? game.RETIRE : 0; },
        clear_log() {},
    });
    assert.ok(retire_player.retired);
    assert.equal(retire_player.retire_reason, "主动宣布退役");
    assert.equal(retire_player.year, 1, "第 1 年等待点退役后不再进入下一年");
    // 面板快照：上场五人（含玩家）、教练与今年的赛程（右栏滑块数据源）。
    const snapshot = game.status_snapshot(human, {day: 0});
    assert.equal(snapshot.roster.length, 5);
    assert.equal(snapshot.roster.filter(item => item.me).length, 1);
    assert.ok(snapshot.coach, "面板快照缺少教练");
    // 磨合度：面板要拿到整数显示值与它对实力的修正（100% 为中性，修正为 0）。
    assert.equal(typeof snapshot.chemistry, "number", "面板快照缺少磨合度");
    assert.equal(snapshot.chemistry, Math.round(human.team.chemistry));
    assert.equal(snapshot.chem_bonus, game.chem_multiplier(human.team) - 1);
    // 赛程按开赛日升序，只含玩家有资格的站；未开赛的站带资格状态、引用期与依据名次。
    assert.ok(Array.isArray(snapshot.schedule) && snapshot.schedule.length > 0, "赛程快照为空");
    snapshot.schedule.forEach((item, i) => {
        assert.ok(item.key && item.name && item.tier && item.from && item.to, `赛程条目缺字段：${item.key}`);
        if (i) assert.ok(snapshot.schedule[i - 1].start_day <= item.start_day, "赛程未按开赛日排序");
        if (item.played) return;
        assert.equal(item.locked, game.reference_day(item.start_day) <= 0, `${item.name} 的资格锁定判定不符`);
        assert.ok(item.entry_rank >= 1 && item.entry_rank <= TEAM_COUNT, `${item.name} 的引用期名次越界`);
    });
    // 没带 day 的刷新（开局 / 年末）拿不到赛程，退回空态而不是给出过期数据 ——
    // 曾经因为这里返回 null 被渲染层当成「本赛季已无比赛」，选项后卡片会假空。
    assert.deepEqual(plain(game.status_snapshot(human).schedule), []);
    // 年度总结数据：十四维属性变化、Top20 榜与「必然退役」标记都要成形。
    const season_probe = game.season_payload(retire_player, world.compute_top20(), {
        rank: 10, move: 2,
        start_attrs: Object.fromEntries(game.ATTR_KEYS.map(key => [key, retire_player[key]])),
        start_value: retire_player.value(),
        will_retire: true,
    });
    assert.equal(season_probe.attrs.length, game.ATTR_KEYS.length);
    assert.equal(season_probe.must_retire, true);
    // 榜长取决于当时有多少选手带着本年 Rating，这里只校验结构。
    assert.ok(Array.isArray(season_probe.top20.list) && season_probe.top20.list.length <= 20);
    assert.ok(season_probe.top20.list.every(item => item.rank >= 1 && item.rank <= 20));
    assert.ok(season_probe.top20.list.filter(item => item.me).length <= 1);
    // 生涯战报数据：时间线逐年一条，荣誉室里只有冠军与 MVP 两类。
    assert.ok(Array.isArray(retire_player.mvps));
    assert.ok(retire_player.mvps.every(text => typeof text === "string"));
    const career_probe = game.career_payload(retire_player);
    assert.equal(career_probe.timeline.length, retire_player.year);
    assert.equal(career_probe.mvp_count, retire_player.mvps.length);
    assert.ok(career_probe.honors.every(item => item.kind === "win" || item.kind === "mvp"));
    assert.equal(career_probe.retire_reason, "主动宣布退役");
    assert.equal(game.honor_points([["Major", "MAJOR", "冠军"], ["IEM", "S", "冠军"]]), 23);
    assert.equal(game.c("test", game.CYAN + ";" + game.BOLD), "\x1b[36;1mtest\x1b[0m");
    // 瑞士轮名次：rest 里装的是战绩条目（带 .team）而不是队伍对象，
    // group_rank 仍要能给出 8 名之后的名次（曾经因此返回 null，导致误判「晋级八强」）。
    const swiss_probe = game.make_swiss(world.teams.slice(0, 16));
    const swiss_event = game.A_EVENTS[0];
    for (let round = 0; round < (swiss_event.swiss_rounds || 5); round++) {
        game.swiss_round(swiss_probe, swiss_event, rng, new Map(), false);
    }
    const swiss_outcome = game.swiss_result(swiss_probe);
    assert.equal(swiss_outcome.rest.length, 8);
    assert.ok(swiss_outcome.rest.every(entry => entry.team), "瑞士轮 rest 应为战绩条目");
    const swiss_state = {alive: swiss_outcome.advancing, rest: swiss_outcome.rest};
    assert.equal(game.group_rank(swiss_state, swiss_outcome.advancing[0]), 1);
    assert.equal(game.group_rank(swiss_state, swiss_outcome.rest[0].team), 9);
    assert.equal(game.group_rank(swiss_state, swiss_outcome.rest[7].team), 16);

    // —— 阶梯瑞士轮（Major / S 级）的关键不变量：「3 胜」必须是晋级的充分条件 —— //
    // 旧实现把 32 队塞进一锅 5 轮瑞士轮再取前 8，同战绩配对天然产出 16 支 ≥3 胜的队伍，
    // 于是每站都有约 8 支 3 胜 2 负的队伍被挡在八强之外（实测占全部 3-2 球队的 79.7%）。
    // 现在按领域文档改成三阶段各 16 队的锁线瑞士轮，每阶段恰好 8 队 3 胜、8 队 3 负。
    const ladder_event = game.ANNUAL_CALENDAR.find(e => e.format === "major" && e.circuit === "main");
    for (let seed = 0; seed < 6; seed++) {
        const ladder_rng = new game.Random(400 + seed);
        const ladder = game.make_ladder(world.teams.slice(0, ladder_event.teams));
        let guard = 0;
        while (!ladder.done) {
            game.ladder_round(ladder, ladder_event, ladder_rng, new Map(), false);
            assert.ok(++guard <= 3 * 5, "每个阶段固定 5 轮，三个阶段不应超过 15 轮");
        }
        assert.equal(ladder.results.length, game.LADDER_STAGES.length);
        assert.equal(guard, 3 * 5, "16 队锁线瑞士轮的轮次完全由对阵数决定，每阶段必须打满 5 轮");
        for (const item of ladder.results) {
            assert.equal(item.advancing.length, 8, `${item.name} 应有 8 队晋级`);
            assert.equal(item.rest.length, 8, `${item.name} 应有 8 队淘汰`);
            // 晋级者恒为 3 胜、淘汰者恒为 3 负——这就是「3 胜必晋级」。
            assert.ok(item.advancing.every(entry => entry.wins === game.CLINCH_WINS),
                `${item.name} 的晋级队伍必须都是 3 胜`);
            assert.ok(item.rest.every(entry => entry.losses === game.CLINCH_LOSSES),
                `${item.name} 的淘汰队伍必须都是 3 负`);
            assert.ok(item.advancing.every(entry => entry.losses < game.CLINCH_LOSSES));
            assert.ok(item.rest.every(entry => entry.wins < game.CLINCH_WINS));
            // 每个阶段 33 场（8 + 8 + 8 + 6 + 3），与真实 Major 的瑞士轮场次一致。
            const games = item.advancing.concat(item.rest).reduce((sum, entry) => sum + entry.wins, 0);
            assert.equal(games, 33, `${item.name} 应为 33 场`);
        }
        assert.equal(ladder.advancing.length, 8);
        // 名次表：8 强之后按「出局阶段」排——传奇组出局 9～16、挑战组 17～24、竞争组 25～32。
        assert.equal(ladder.rest.length, 24);
        const rank_state = {alive: ladder.advancing, rest: ladder.rest};
        assert.equal(game.group_rank(rank_state, ladder.rest[0].team), 9);
        assert.equal(game.group_rank(rank_state, ladder.rest[8].team), 17);
        assert.equal(game.group_rank(rank_state, ladder.rest[16].team), 25);
        assert.equal(game.group_rank(rank_state, ladder.rest[23].team), 32);
    }
    // 阶梯的参赛名单分段：传奇组直邀 8、挑战组直邀 8、竞争组 16（都按引用期名次排）。
    const ladder_field = world.teams.slice().sort((a, b) => a.rank - b.rank).slice(0, ladder_event.teams);
    const ladder_probe = game.make_ladder(ladder_field);
    assert.deepEqual(plain(ladder_probe.legend), plain(ladder_field.slice(0, 8)));
    assert.deepEqual(plain(ladder_probe.challenger), plain(ladder_field.slice(8, 16)));
    assert.deepEqual(plain(ladder_probe.competitor), plain(ladder_field.slice(16)));
    assert.equal(ladder_probe.legend.length + ladder_probe.challenger.length + ladder_probe.competitor.length,
        ladder_event.teams);

    // —— 系列赛：图数上限＝赛制，平局不可能出现，胜率必须体现实力差 —— //
    // 历史上 series_maps 把「这一场打几图」抽签定死（70% 两图、55% 四图），被当成封顶用：
    // 偶数封顶凑不出过半胜场 → 平局 → `winner: a_wins > b_wins ? a : b` 判给后手方 b。
    // 配对时 a 恒为种子更高的一方，于是每一场平局都送给弱队：引用期 #1 vs #2 只有 32.5% 胜率。
    const series_world = new game.World(new game.Random(31));
    const series_ranked = series_world.teams.slice().sort((a, b) => a.rank - b.rank);
    const series_event = game.ANNUAL_CALENDAR.find(e => e.key === "S1");
    // 上限就是赛制：非决赛 Bo3、Bo5 决赛 5 图、Bo3 决赛（地区赛）3 图。
    assert.equal(game.series_cap(false, series_event), 3);
    assert.equal(game.series_cap(true, game.ANNUAL_CALENDAR.find(e => e.is_major)), 5);
    assert.equal(game.series_cap(true, game.ANNUAL_CALENDAR.find(e => e.format === "regional")), 3);
    assert.ok(Math.abs(series_ranked[0].strength() - series_ranked[1].strength()) < 2,
        "样本队 #1 与 #2 的实力应接近，否则下面的 50% 断言没有意义");
    const series_rng = new game.Random(2026);
    const SERIES_TRIALS = 20000;
    let top_wins = 0;
    for (let i = 0; i < SERIES_TRIALS; i++) {
        const out = game.simulate_series(series_ranked[0], series_ranked[1], series_event, series_rng,
            new Map(), game.series_cap(false, series_event), false);
        assert.ok(out.a_wins !== out.b_wins, `系列赛不允许平局：${out.a_wins}:${out.b_wins}`);
        assert.ok(out.a_wins + out.b_wins >= 2 && out.a_wins + out.b_wins <= 3, "非决赛应为 Bo3");
        if (out.winner === series_ranked[0]) top_wins += 1;
    }
    const top_rate = top_wins / SERIES_TRIALS;
    assert.ok(Math.abs(top_rate - 0.5) < 0.02,
        `近等实力双方的胜率应接近 50%，实际 ${(top_rate * 100).toFixed(1)}%`);
    // 强弱必须被体现出来：旧实现在这一格只有 90.7%（平局全送弱队把差距压平了）。
    let strong_wins = 0;
    const WEAK_TRIALS = 4000;
    for (let i = 0; i < WEAK_TRIALS; i++) {
        const out = game.simulate_series(series_ranked[0], series_ranked[series_ranked.length - 1], series_event,
            series_rng, new Map(), game.series_cap(false, series_event), false);
        if (out.winner === series_ranked[0]) strong_wins += 1;
    }
    assert.ok(strong_wins / WEAK_TRIALS > 0.9,
        `引用期第 1 名打末位的胜率过低：${(strong_wins / WEAK_TRIALS * 100).toFixed(1)}%`);

    // —— 赛制切换线：锁线瑞士轮里「胜则晋级 / 负则淘汰」的对局是 Bo3，其余是 Bo1 —— //
    // 领域文档 §4.2：R1 / R2 全 Bo1，R3 的 2-0 与 0-2 对局、R4 与 R5 的全部对局才是 Bo3。
    const cap_event = game.ANNUAL_CALENDAR.find(e => e.is_major);
    for (const [wins, losses, want] of [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
        [2, 0, 3], [2, 1, 3], [1, 2, 3], [0, 2, 3], [2, 2, 3]]) {
        const entry = {wins, losses};
        assert.equal(game.swiss_series_cap(cap_event, entry, entry), want,
            `${wins}-${losses} 的局面应为 Bo${want}`);
    }
    const shape = game.make_clinch_swiss(series_world.teams.slice(0, 16));
    const shape_rng = new game.Random(88);
    const by_round = [];
    for (let i = 0; i < 8 && shape.table.some(entry => !entry.resolved); i++) {
        by_round.push(game.clinch_round(shape, cap_event, shape_rng, new Map(), false, "竞争组"));
    }
    assert.equal(by_round.length, 5, "16 队锁线瑞士轮应固定 5 轮");
    assert.deepEqual(plain(by_round.map(list => list.length)), [8, 8, 8, 6, 3], "逐轮场次应为 8/8/8/6/3");
    const bo1_count = list => list.filter(m => m.a_wins + m.b_wins === 1).length;
    assert.equal(bo1_count(by_round[0]), 8, "R1 应全为 Bo1");
    assert.equal(bo1_count(by_round[1]), 8, "R2 应全为 Bo1");
    assert.equal(bo1_count(by_round[2]), 4, "R3 应只有 1-1 的 4 场是 Bo1");
    assert.equal(bo1_count(by_round[3]), 0, "R4 应全为 Bo3");
    assert.equal(bo1_count(by_round[4]), 0, "R5 应全为 Bo3");

    // —— 赛季末重排名次 —— //
    world.reset_season();
    for (const player of world.players) player.reset_year();
    world.simulate_year(rng);
    const ranks_before = new Map(world.teams.map(t => [t, t.rank]));
    const {standings, changes} = world.finalize_rankings();
    assert.equal(standings.length, TEAM_COUNT);
    assert.equal(new Set(standings).size, TEAM_COUNT);
    assert.deepEqual(plain(standings.map(t => t.rank)), Array.from({length: TEAM_COUNT}, (_, i) => i + 1));
    for (const team of world.teams) {
        assert.equal(changes.get(team), ranks_before.get(team) - team.rank);
        assert.equal(team.tier, game.vrs_tier(team.rank));
        assert.equal(team.league, game.league_key(team.rank));
        assert.equal(team.top20_weight, game.vrs_weight(team.rank));
    }
    const max_move = Math.ceil((1 - game.RANK_CARRY) * (TEAM_COUNT - 1)) + 2;
    assert.ok([...changes.values()].every(move => Math.abs(move) <= max_move), `单季名次变动超过 ${max_move}`);
    assert.ok(standings[0].potential_base > standings[TEAM_COUNT - 1].potential_base);
    assert.equal(standings[0].tier, 7);
    assert.equal(standings[TEAM_COUNT - 1].tier, 0);
    // 一个赛季之后，全部队伍都打过比赛（赛历覆盖到 1～100 名的每一支队伍）。
    assert.ok(world.teams.every(team => team.matches > 0), "有队伍整季无赛可打");

    // 赛事总结弹窗的数据（event_summary_payload）：总览榜单、MVP 与逐场逐图明细都要成形。
    function check_summary_payloads(payloads) {
        assert.ok(payloads.length > 0, "整段生涯没有产生赛事总结");
        const round_scale = [];
        for (const p of payloads) {
            assert.ok(p.event.name && p.event.tier && p.event.from && p.event.to);
            assert.ok(p.result.champion && p.result.runner_up);
            assert.equal(p.result.semi.length, 2);
            assert.equal(p.result.quarter.length, 4);
            assert.ok(p.mvp && p.mvp.id && p.mvp.team && p.mvp.role);
            assert.equal(p.rating_board[0].id, p.mvp.id, "MVP 应是全场 Rating 最高的选手");
            assert.ok(p.rating_board.length > 0 && p.rating_board.length <= 10);
            assert.ok(p.kill_board.length > 0 && p.kill_board.length <= 10);
            assert.ok(p.rating_board.every((e, i) => i === 0 || p.rating_board[i - 1].rating >= e.rating));
            assert.ok(p.kill_board.every((e, i) => i === 0 || p.kill_board[i - 1].kills >= e.kills));
            assert.ok(p.you.team && p.you.placement && p.you.maps > 0);
            // 本站积分：逐场变化的求和 === 合计，且「站前 + 本站变化 = 站末」自洽。
            assert.equal(p.detail.reduce((sum, m) => sum + m.elo, 0), p.you.elo_total, "逐场积分之和与本站合计不一致");
            assert.equal(p.you.season_before + p.you.elo_total, p.you.season_after, "站前 + 本站变化 ≠ 站末");
            // 逐场逐图明细：每图双方各 5 行，玩家恰好出现在我方一条。
            assert.ok(p.detail.length > 0, "玩家参赛却没有任何逐场记录");
            // 同一站里同一个赛程标签最多出现一次（瑞士轮各轮、淘汰赛各轮都不会重打）。
            // 曾经因为 finish_player_event 把淘汰赛对阵表重置回 8 强，导致四分之一决赛打了两遍、
            // 已经输掉的队伍复活。玩家视角的赛程重复只能在这里发现。
            const labels = p.detail.map(match => match.stage);
            assert.equal(new Set(labels).size, labels.length, `${p.event.name} 出现了重复的赛程标签`);
            // 阶梯瑞士轮（Major/S 级）：玩家打过的每个阶段都必须是终局战绩——恰好 3 胜（晋级）
            // 或恰好 3 负（淘汰）。这条直接守住「3 胜必晋级」。
            const ladder_records = new Map();
            for (const match of p.detail) {
                const stage = game.LADDER_STAGES.find(name => match.stage.startsWith(`${name} 第 `));
                if (!stage) continue;
                const rec = ladder_records.get(stage) || {wins: 0, losses: 0};
                if (match.won) rec.wins += 1;
                else rec.losses += 1;
                ladder_records.set(stage, rec);
            }
            for (const [stage, rec] of ladder_records) {
                assert.ok(rec.wins === game.CLINCH_WINS || rec.losses === game.CLINCH_LOSSES,
                    `${p.event.name} 的${stage}战绩 ${rec.wins}-${rec.losses} 不是终局（应 3 胜晋级 / 3 负淘汰）`);
            }
            for (const match of p.detail) {
                assert.ok(match.stage && match.opponent && match.score.length === 2);
                // 每场都结算出一条整数积分，方向与胜负一致，且取整不会把一场胜负抹成 0。
                assert.ok(Number.isInteger(match.elo) && match.elo !== 0, `${p.event.name} 的 ${match.stage} 积分变化异常`);
                assert.equal(match.elo > 0, match.won, `${p.event.name} 的 ${match.stage} 积分方向与胜负不符`);
                assert.ok(match.maps.length >= 1 && match.maps.length <= 5);
                for (const mp of match.maps) {
                    assert.equal(mp.mine.length, 5);
                    assert.equal(mp.theirs.length, 5);
                    assert.equal(mp.mine.filter(row => row.me).length, 1);
                    assert.equal(mp.theirs.filter(row => row.me).length, 0);
                    for (const row of [...mp.mine, ...mp.theirs]) {
                        assert.ok(row.rating >= 0.20 && row.rating <= 2.20);
                        assert.ok(row.adr >= 15 && row.adr <= 165);
                    }
                    // 单图比分必须遵守 MR12：常规时间先到 13 胜（负方 0～11）；
                    // 12-12 才进加时，每段加时双方各 3 回合、先到 4 分，终分 16-14 / 19-16 …
                    const [ms, os] = mp.score;
                    const hi = Math.max(ms, os);
                    const lo = Math.min(ms, os);
                    assert.equal(mp.won, ms > os, "单图比分与单图胜负不一致");
                    if (mp.overtimes === 0) {
                        assert.equal(hi, 13, "常规时间的胜方应为 13 分");
                        assert.ok(lo <= 11, `常规时间负方回合数 ${lo} 超过 11`);
                    } else {
                        assert.equal(hi, 16 + 3 * (mp.overtimes - 1),
                            `加时终分 ${ms}-${os} 与 ${mp.overtimes} 个加时不符`);
                        assert.ok(hi - lo >= 2 && hi - lo <= 4, `加时分差 ${hi - lo} 不在 2～4 之间`);
                        assert.ok(lo >= 12, `加时负方回合数 ${lo} 小于 12`);
                    }
                    // 单图总击杀的粗略安全带（现实约每回合 6.7 次）。上下界都很松，只挡「击杀
                    // 被写死成每图固定值」这类量级错误；真正的「随回合数缩放」由下面的分组比对来守。
                    const rounds = ms + os;
                    const total_kills = [...mp.mine, ...mp.theirs].reduce((sum, row) => sum + row.kills, 0);
                    round_scale.push([rounds, total_kills, total_kills / 10 / rounds]);
                    assert.ok(total_kills >= rounds * 2 && total_kills <= rounds * 11,
                        `单图总击杀 ${total_kills} 与 ${rounds} 回合不相称`);
                }
            }
        }
        // 计数类数据必须跟着回合数走：把整段生涯的图按长短分组，**整图总击杀**要随回合数抬升。
        // 注意不能比「每回合击杀」——速胜图多是强弱悬殊，强队刷得凶，每回合击杀反而更高；
        // 真正该守住的是总击杀这个绝对量（历史实现里它是每图固定值，与回合数无关）。
        const short = round_scale.filter(([rounds]) => rounds <= 19);
        const long = round_scale.filter(([rounds]) => rounds >= 25);
        assert.ok(short.length > 20 && long.length > 20,
            `样本不足：短图 ${short.length}、长图 ${long.length}`);
        const mean_of = pick => list => list.reduce((sum, row) => sum + pick(row), 0) / list.length;
        const mean_kills = mean_of(row => row[1]);
        assert.ok(mean_kills(long) > mean_kills(short) * 1.3,
            `长图总击杀应明显高于短图：短图 ${mean_kills(short).toFixed(0)}、长图 ${mean_kills(long).toFixed(0)}`);
        // 每回合击杀的整体水平也要落在真实区间（现实约 0.68）。太松会让「人均 20 杀」这种
        // 不可能的数据溜过去，太紧则说明常数被改崩了。
        const overall = mean_of(row => row[2])(round_scale);
        assert.ok(overall >= 0.55 && overall <= 0.85,
            `每回合场均击杀 ${overall.toFixed(3)} 偏离真实水平（约 0.68）`);
    }

    // 结构化日志（io.log）：年份抬头与逐日条目都带日期与类型，且每年清空只留当年。
    // 练习赛只在日志里留一行摘要（不弹窗口），且状态确实会随表现升降（否则机制对玩家不可见）。
    function check_log_entries(entries) {
        assert.ok(entries.length > 0, "整段生涯没有产生结构化日志");
        assert.ok(entries.every(entry => entry.kind && entry.date &&
            Array.isArray(entry.lines) && entry.lines.length), "日志条目缺字段");
        assert.equal(entries.filter(entry => entry.kind === "year").length, 1, "每年清空后应只剩当年");
        assert.ok(entries.some(entry => ["match", "idle", "event"].includes(entry.kind)));
        // 赛程播报：整段生涯里，名次的变化必须真的产生过 notice 条目，且同一天允许出现多条
        // 不同类型（事件行 + 播报行同一天），日期列重复但条目互不覆盖。
        const notices = entries.filter(entry => entry.kind === "notice");
        assert.ok(notices.length > 0, "整段生涯没有产生赛程播报");
        assert.ok(notices.every(entry => /(可参加|已失去|你所在战队已锁定)/.test(
            entry.lines.join("").replace(/\x1b\[[0-9;]*m/g, ""))), "赛程播报内容不符");
        const by_date = new Map();
        for (const entry of entries) by_date.set(entry.date, (by_date.get(entry.date) || 0) + 1);
        assert.ok([...by_date.values()].some(count => count > 1), "同一天应当能容纳多条不同类型的日志");
        const practice_lines = entries.flatMap(entry => entry.lines)
            .map(text => text.replace(/\x1b\[[0-9;]*m/g, ""))
            .filter(text => text.startsWith("【练习赛】"));
        assert.ok(practice_lines.length > 0, "整段生涯没有产生练习赛日志");
        assert.ok(practice_lines.every(text => /^【练习赛】.+ (战胜|负于) .+  \(\d:\d\)   Rating \d\.\d\d/
            .test(text)), "练习赛日志格式不符");
        assert.ok(practice_lines.some(text => text.includes("状态↑") || text.includes("状态↓")),
            "整段生涯里练习赛从未改变过状态（机制对玩家不可见）");
    }

    // —— 完整生涯：积分、名次、数据、历史与退役都要自洽 —— //
    for (let seed = 0; seed < 14; seed++) {
        const payloads = [];
        const log_entries = [];
        const io = seed === 0 ? {
            ...silent,
            summary(payload) { payloads.push(payload); },
            log(entry) { log_entries.push(entry); },
            clear_log() { log_entries.length = 0; },
        } : silent;
        const player = await game.run_game("auto", game.ROLE_NAMES[seed % 6], seed, true, io);
        assert.ok(player.retired && player.retire_reason);
        assert.equal(player.age, 30);
        assert.equal(player.year, 14);
        assert.equal(player.history.length, player.year);
        assert.equal(player.history[0].year, 2026);
        assert.equal(player.history[0].age, 16);
        assert.equal(player.rating_all.length, player.history.reduce((sum, y) => sum + y.n, 0));
        assert.ok(player.rating_all.every(r => r >= 0.20 && r <= 2.20));
        assert.ok(player.top1_count <= player.top20_count && player.top20_count <= player.year);
        assert.ok(player.value() >= 1 && player.value() <= 500);
        // 生涯击杀与地图数必须与逐年记录一致。
        assert.equal(player.kills_all, player.history.reduce((sum, y) => sum + y.kills, 0));
        assert.equal(player.deaths_all, player.history.reduce((sum, y) => sum + y.deaths, 0));
        assert.equal(player.maps_all, player.history.reduce((sum, y) => sum + y.maps, 0));
        // 每一年都要记录队伍名次与赛季积分，且名次在合法范围内。
        assert.ok(player.history.every(y => Number.isInteger(y.rank) && y.rank >= 1 && y.rank <= TEAM_COUNT));
        assert.ok(player.history.every(y => Number.isFinite(y.rating) && Number.isInteger(y.move)));
        assert.ok(player.history.every(y => y.team && y.tier));
        // 出战站数与年度荣誉数量一致，年度 Rating 条数与出战站数一致。
        assert.ok(player.history.every(y => y.titles <= y.n));
        check_world(player.world, player);
        // 累积制不守恒：赛季末总积分高于起跑线（每队仍各自被限制在合法区间内）。
        const sum = player.world.teams.reduce((s2, t) => s2 + t.rating, 0);
        assert.ok(sum > game.START_RATING * TEAM_COUNT, `赛季末总积分 ${sum} 未体现累积`);
        if (seed === 0) {
            check_summary_payloads(payloads);
            check_log_entries(log_entries);
        }
    }

    // 手动选择生涯：每一站都要打完整个赛程，并且玩家的场次与赛季末记录一致。
    const manual = await game.run_game("manual", "指挥", 7, false, {
        write() {},
        async simulate() {},
        async choose(prompt) {
            return prompt.includes("退役") || prompt.includes("功成身退") ? 1 : 0;
        },
    });
    assert.equal(manual.age, 32);
    assert.equal(manual.year, 16);
    assert.equal(manual.retire_reason, "年满 32 岁, 正式告别职业赛场");
    assert.ok(manual.history.every(y => y.rank >= 1 && y.rank <= TEAM_COUNT));
    check_world(manual.world, manual);

    console.log("通过：时间系统与逐日赛历（18 站主赛 + 16 站地区赛、零冲突、周日收官）、"
        + "名额与分档、时间推进与玩家赛程、赛制与名次分布、逐图选手数据与赛事总结、"
        + "赛季积分与实时名次、Top20 权重、补位池、属性与阵容、转会邀约落点与留守磨合度、合同及退役、"
        + "14 段完整自动生涯与手动生涯检查。");
}

check().catch(error => { console.error(error); process.exitCode = 1; });
