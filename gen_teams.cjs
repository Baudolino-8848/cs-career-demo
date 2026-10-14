// 数据生成器：把 VRS 前 50 名快照扩展成 100 支战队，并写出 vrs.js。
// 前 50 名的名次、积分和五名选手 ID 完全保留原快照；第 51～100 名是本地生成的扩展联赛，
// 生成结果被固化进 vrs.js，因此网页端不需要随机数或网络请求即可得到同一份名单。
//
// 用法（在 cs_career 目录下）：
//   node gen_teams.cjs
//
// 生成是确定性的（固定种子）。为了让「重跑不改变现有第 51～100 名」，生成器沿用最初的
// 随机序列（先抽 EXTRA 个候选俱乐部名、再抽 EXTRA×5 个候选 ID），只写出前 KEEP 支，
// 因此重复运行得到完全相同的文件，且与当前 vrs.js 逐字一致。扩展联赛的俱乐部名和选手 ID
// 都只在本生成器中出现一次，不与 VRS 名单冲突。年龄、位置、属性和后续生涯由 game.js 模拟。

const fs = require("node:fs");
const path = require("node:path");

const SEED = "cs_career-extra-league-2049";
const EXTRA = 100;   // 候选扩展战队数量（沿用最初的随机序列，保证前 50 支不变）
const KEEP = 50;     // 实际写入 vrs.js 的扩展战队数量（第 51～100 名）
const TEAM_COUNT = 100;  // 世界战队总数
const ROSTER = 5;    // 每队五人
const FIRST_RANK = 51;
const GEN_LAST_RANK = 150;  // 积分公式沿用最初的 150 队参数，保证第 51～100 名积分不变

// 候选扩展联赛五档（沿用最初的生成规则，含已经裁掉的名次区间）。这里只用于推导写入
// vrs.js 的档位序号字段；该字段是历史遗留数据，游戏实际按 data.js 的 RANK_BANDS 重算档位。
const EXTRA_TIERS = [
    {name: "扩展联赛·甲级", base: 56, min_rank: 51, max_rank: 70},
    {name: "扩展联赛·乙级", base: 52, min_rank: 71, max_rank: 90},
    {name: "扩展联赛·丙级", base: 48, min_rank: 91, max_rank: 110},
    {name: "扩展联赛·丁级", base: 44, min_rank: 111, max_rank: 130},
    {name: "扩展联赛·戊级", base: 40, min_rank: 131, max_rank: 150},
];

// 固定种子的 xorshift，保证生成过程可复现。
function make_rng(seed) {
    let state = 0;
    for (const char of seed) state = (Math.imul(state ^ char.codePointAt(0), 0x01000193) >>> 0);
    return function random() {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}

function shuffle(values, random) {
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
}

const FIRST = ["Vanguard", "Apex", "Nova", "Onyx", "Vertex", "Radiant", "Zenith", "Quartz",
    "Halcyon", "Cobalt", "Ember", "Granite", "Havoc", "Ironclad", "Jade",
    "Kraken", "Lumen", "Mirage", "Nimbus", "Obsidian", "Pinnacle", "Quasar", "Rift",
    "Saber", "Tempest", "Umbral", "Vortex", "Warden", "Xenon", "Yonder", "Zephyr"];
const SECOND = ["Dawn", "Legion", "Harbor", "Summit", "Forge", "Ascent", "Reborn", "Peak",
    "Signal", "Union", "Drift", "Crest", "Pulse", "Vale", "Surge", "Arc", "Crown", "Current"];
const SUFFIX = ["Gaming", "Esports", "eSports", "Club", "Collective", "Wolves", "Dragons",
    "Tigers", "Hawks", "Vipers", "Bears", "Lions", "Sharks", "Ravens", "Foxes", "Comets"];

// 生成 100 个不与 VRS 名单冲突的俱乐部名；组合冲突时继续抽取。
function build_team_names(random, taken) {
    const names = [];
    const seen = new Set(taken);
    while (names.length < EXTRA) {
        const roll = random();
        const name = roll < 0.4
            ? `${pick(FIRST)} ${pick(SECOND)}`
            : roll < 0.75
                ? `${pick(FIRST)} ${pick(SUFFIX)}`
                : `${pick(SECOND)} ${pick(SUFFIX)}`;
        if (seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;

    function pick(values) {
        return values[Math.floor(random() * values.length)];
    }
}

// 扩展联赛选手 ID 使用 VRS 名单里完全不存在的 ui 前缀加三位序号，保证与 VRS 的 250 个 ID
// 以及彼此之间都不重复；序号按固定种子打乱，避免同队 ID 连号。
function build_player_ids(random, taken) {
    const ids = [];
    const seen = new Set(taken);
    for (let i = 0; i < EXTRA * ROSTER; i++) {
        const id = `ui${String(i + 1).padStart(3, "0")}`;
        if (seen.has(id)) throw new Error(`选手 ID ${id} 与现有名单冲突`);
        seen.add(id);
        ids.push(id);
    }
    return shuffle(ids, random);
}

// 扩展联赛积分从 VRS 末位 1195 分之后继续衰减到 1 分附近，保证第 51 名不会出现断崖。
// 沿用最初的 150 队参数（GEN_LAST_RANK），使第 51～100 名的积分与裁掉 101～150 名之前一致。
function extra_points(rank) {
    const ripple = 0.96 + 0.09 * Math.sin(rank / 3.1) + 0.05 * Math.cos(rank / 1.7);
    return Math.max(1, Math.round(1195 * ((GEN_LAST_RANK + 1 - rank) / EXTRA) ** 1.6 * ripple));
}

// 名次落在哪一档；与 data.js 的 TIERS 范围一致，档位序号随实力递增。
function extra_tier_index(rank) {
    return EXTRA_TIERS.findIndex(tier => tier.min_rank <= rank && rank <= tier.max_rank);
}

// 按括号深度取出 VRS_TEAMS 的外层数组文本范围；数组内还有名单数组，不能只看最后一个 "]"。
function teams_range(text) {
    const start = text.indexOf("const VRS_TEAMS = [");
    if (start < 0) throw new Error("vrs.js 中找不到 VRS_TEAMS 数组");
    const open = text.indexOf("[", start);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "[") depth += 1;
        else if (text[i] === "]") {
            depth -= 1;
            if (depth === 0) return [open, i];
        }
    }
    throw new Error("vrs.js 中 VRS_TEAMS 数组没有闭合");
}

function read_existing(text) {
    const [open, close] = teams_range(text);
    // 源文件是 JavaScript 数组字面量，末项后允许有尾逗号，JSON.parse 不接受，先去掉。
    return JSON.parse(text.slice(open, close + 1).replace(/,\s*\]$/, "]"));
}

// 只重写数组这一段，保留文件头注释和常量。
function replace_teams_array(text, replacement) {
    const [open, close] = teams_range(text);
    return text.slice(0, open) + replacement + text.slice(close + 1);
}

function main() {
    const file = path.join(__dirname, "vrs.js");
    const text = fs.readFileSync(file, "utf8");
    const current = read_existing(text);
    // 允许对已经扩展过的 vrs.js 重新生成：前 50 名始终作为 VRS 基准保留，其余整段重算。
    const existing = current.slice(0, 50);
    if (existing.length !== 50) throw new Error(`vrs.js 前 50 名不完整，实际 ${existing.length} 项`);
    for (const [i, team] of existing.entries()) {
        if (team.rank !== i + 1) throw new Error(`第 ${i + 1} 项名次为 ${team.rank}`);
        if (team.roster.length !== ROSTER) throw new Error(`${team.name} 名单不是五人`);
    }

    const random = make_rng(SEED);
    const names = build_team_names(random, existing.map(team => team.name));
    const ids = build_player_ids(random, existing.flatMap(team => team.roster));

    // 先按最初的规则生成全部 EXTRA 支候选，再只保留前 KEEP 支（第 51～100 名）。
    // 候选的数量与随机调用顺序不变，因此保留段的队名、ID、积分与裁掉 101～150 名之前一致。
    const candidates = names.map((name, i) => {
        const rank = FIRST_RANK + i;
        // 只写名次、积分、队名、名单和档位序号；档位名与潜力基数由 data.js 按序号查表。
        return {
            rank,
            points: extra_points(rank),
            name,
            roster: ids.slice(i * ROSTER, (i + 1) * ROSTER),
            league: "extra",
            tier: 5 + extra_tier_index(rank),
        };
    });
    const extra = candidates.slice(0, KEEP);

    const all = existing.concat(extra);
    if (all.length !== TEAM_COUNT) throw new Error(`战队总数是 ${all.length}，预期 ${TEAM_COUNT}`);
    if (current.length === TEAM_COUNT && current.some((team, i) => team.rank !== all[i].rank || team.name !== all[i].name ||
        team.points !== all[i].points || team.league !== all[i].league || team.tier !== all[i].tier ||
        team.roster.join() !== all[i].roster.join())) {
        console.log("提示：现有扩展联赛与本次生成规则不同，已按当前规则重写。");
    }
    if (new Set(all.map(team => team.name)).size !== TEAM_COUNT) throw new Error("俱乐部名存在重复");
    // VRS 原表本身有一个重复 ID（bobeksde 同时出现在两队），这里只要求扩展联赛不引入重复。
    const roster_ids = all.flatMap(team => team.roster);
    const extra_ids = extra.flatMap(team => team.roster);
    if (roster_ids.length !== TEAM_COUNT * ROSTER) throw new Error("选手席位数量不对");
    if (new Set(extra_ids).size !== extra_ids.length) throw new Error("扩展联赛选手 ID 存在重复");
    if (extra_ids.some(id => existing.some(team => team.roster.includes(id)))) throw new Error("扩展联赛选手 ID 与 VRS 名单冲突");
    const counts = EXTRA_TIERS.map((_, tier) => extra.filter(team => extra_tier_index(team.rank) === tier).length);
    if (counts.join() !== "20,20,10,0,0") throw new Error(`扩展联赛分档数量不符：${counts}`);
    for (let i = 1; i < extra.length; i++) {
        if (extra[i].points > extra[i - 1].points * 1.2) {
            throw new Error(`积分在第 ${extra[i].rank} 名出现异常跳升`);
        }
    }

    const body = "[\n" + all.map(team => `    ${JSON.stringify(team)},`).join("\n") + "\n]";
    fs.writeFileSync(file, replace_teams_array(text, body), "utf8");
    console.log(`已写出 ${all.length} 支战队：VRS 快照 50 支 + 扩展联赛 ${extra.length} 支`);
    console.log(`选手 ID 共 ${new Set(roster_ids).size} 个（VRS 250 含 1 个原表重复 + 扩展联赛新增 ${extra.length * ROSTER} 个）`);
    console.log(`扩展联赛分档 ${counts.slice(0, 3).join("/")} 支，积分 ${extra[0].points} → ${extra[extra.length - 1].points}`);
}

main();
