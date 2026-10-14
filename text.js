"use strict";

const CYAN = "36", GREEN = "32", YELLOW = "33", RED = "31", MAGENTA = "35";
const BOLD = "1", DIM = "2";
const STAR = "★";

// 使用颜色及字重标记包装文字，浏览器输出层负责转换为安全的 span 节点。
// 标记可以组合，例如青色加粗使用 "36;1"；结束标记恢复默认文字样式。
function c(text, code) {
    return `\x1b[${code}m${text}\x1b[0m`;
}

// 中文按两列估算宽度，补齐文字表格；窄屏仍可由样式自动换行。
function pad(text, width) {
    text = String(text);
    const length = [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2E80 ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - length));
}

// 增减数保留正号，便于在年度总结中区分成长和衰退。
function signed(value) {
    const n = round(value);
    return `${n >= 0 ? "+" : ""}${n}`;
}

// 属性变动摘要 + 定性刷新：事件改变属性后调用，只列变化的项，返回给调用方写进日志。
function attribute_delta_lines(before, p) {
    const changed = [];
    for (const [key, label] of ATTRS) {
        const diff = p[key] - before[key];
        if (diff) changed.push(`${label} ${signed(diff)}`);
    }
    if (!changed.length) return [];
    const summary = p.form !== undefined
        ? `当前总评 ${p.overall()}   状态 ${FORM_STATES[p.form]}`
        : `当前总评 ${p.overall()}`;
    return ["属性变化: " + changed.join("  "), summary];
}

// 年度队伍排名：赛季末按积分重排后的名次、升降幅度与赛季积分。
function print_team_standing(human, rank, move, start_rank, io) {
    const arrow = move > 0 ? c(` ↑${move}`, GREEN) : move < 0 ? c(` ↓${-move}`, RED) : c(" —", DIM);
    const tier = LEAGUES[league_of(human.team.rank)].short + " " + TIERS[human.team.tier].name;
    io.write("  " + c("队伍排名", BOLD) + "   " + c(human.team.name, CYAN) + c(` [${tier}]`, DIM) + arrow +
        `   世界第 ${c(rank, YELLOW + ";" + BOLD)} 名 / 100` +
        `   ${c(human.team.shown_rating, CYAN)} 分   ${human.team.wins}胜${human.team.losses}负`);
}

// 年度变化以赛季开始时的快照为基准，包含事件影响、自然成长和表现带来的身价变化。
// 新增本年出战地图数、击杀与 K/D，与每站「赛事总结」里的口径一致。
function print_annual_summary(human, start_attrs, start_value, rank_line, io) {
    const yr = human.yr_ratings;
    const avg = yr.length ? yr.reduce((sum, r) => sum + r, 0) / yr.length : 0;
    const st = Object.values(human.ev_stats);
    const maps = st.reduce((sum, item) => sum + item.maps, 0);
    const kills = st.reduce((sum, item) => sum + item.kills, 0);
    const deaths = st.reduce((sum, item) => sum + item.deaths, 0);
    const adr = maps ? st.reduce((sum, item) => sum + item.adr, 0) / maps : 0;
    io.write();
    io.write("  " + c(`== ${START_YEAR + human.year - 1} 年度总结 ==`, BOLD));
    io.write(`   出战 ${yr.length} 站 / ${maps} 图   冠军 ${human.yr_titles} 个   平均 Rating ${c(avg.toFixed(2), CYAN)}`);
    io.write(`   击杀 ${c(kills, YELLOW)}   阵亡 ${deaths}   K/D ${(kills / Math.max(1, deaths)).toFixed(2)}   场均 ADR ${adr.toFixed(0)}`);
    const changed = ATTRS.map(([key, label]) => label + signed(human[key] - start_attrs[key]));
    io.write("   属性变化: " + changed.join("  "));
    const dv = human.value() - start_value;
    const arrow = dv > 0 ? "↑" : dv < 0 ? "↓" : "→";
    io.write(`   身价 ${human.value()} 万 (${arrow}${Math.abs(dv)})`);
    io.write("   " + rank_line);
}

// 榜单只统计 VRS 联赛（世界前 50 名战队），因此每行都带队伍的世界名次。
// 玩家的名次 index 由调用方（top20_rank）算好传入，这里只负责输出，不再重复累计入选次数。
function print_top20(ranking, human, year_label, index, io) {
    io.write();
    io.write(c(`  ===== ${year_label} 年度世界 Top20 评选 =====`, CYAN + ";" + BOLD));
    ranking.forEach(([score, avg, pl], i) => {
        const line = `  ${String(i + 1).padStart(2)}. ${pad(pl.id, 12)} #${String(pl.team.rank).padStart(3)} ${pad(pl.team ? pl.team.name : "-", 16)} ${pad(pl.role, 6)} ${String(pl.age).padStart(2)}岁  Rating ${avg.toFixed(2)}  评分 ${score.toFixed(1)}  ${brief_honor(pl.yr_honors)}`;
        io.write(pl === human ? c(line + "  <- 你", YELLOW + ";" + BOLD) : line);
    });
}

// 生涯战报汇总生涯数据；赛事冠军数与荣誉室来自逐年累计的 honors。
function ending(p, io) {
    const [grade, title] = grade_of(p);
    const avg = p.rating_all.length ? p.rating_all.reduce((sum, r) => sum + r, 0) / p.rating_all.length : 0;
    io.write();
    io.write(c("=".repeat(64), CYAN));
    io.write(c("                     生 涯 战 报", BOLD));
    io.write(c("=".repeat(64), CYAN));
    io.write(`  选手 ID   : ${p.id}   位置: ${p.role}`);
    io.write(`  职业年限  : ${START_YEAR} 年 - ${START_YEAR + p.year - 1} 年   (16 岁 - ${p.age} 岁, 共 ${p.year} 个赛季)`);
    io.write(`  生涯峰值  : ${p.peak}  (最终 ${p.overall()} )`);
    io.write(`  平均 Rating: ${avg.toFixed(2)}   出战 ${p.history.reduce((sum, y) => sum + y.n, 0)} 站`);
    io.write(`  生涯击杀  : ${p.kills_all}   阵亡 ${p.deaths_all}   K/D ${(p.kills_all / Math.max(1, p.deaths_all)).toFixed(2)}   地图 ${p.maps_all}`);
    io.write(`  赛事冠军  : ${p.honors.filter(h => h.includes("冠军")).length} 个`);
    io.write(`  入选 Top20 : ${p.top20_count} 次   (其中年度第一 ${p.top1_count} 次)`);
    io.write(`  身价      : ${p.value()} 万`);
    io.write();
    io.write("  " + c("生涯时间线 (每年一行)", BOLD));
    for (const y of p.history) {
        const mark = y.honors.length ? " " + c(STAR, YELLOW) : "";
        const rank = y.rank ? ` #${pad(y.rank, 3)}` : "";
        io.write(`   ${y.year}  ${pad(y.age, 3)} 岁  ${pad(y.team, 14)} ${pad("[" + y.tier + "]", 12)}${rank} ${String(y.n).padStart(2)}站${y.titles}冠  Rating ${y.avg.toFixed(2)}${mark}`);
    }
    io.write();
    io.write("  " + c("荣誉室", BOLD));
    if (p.honors.length) p.honors.forEach(h => io.write("   " + c(STAR, YELLOW) + " " + h));
    else io.write("   （空空如也）");
    io.write();
    io.write(`  退役原因  : ${p.retire_reason || "——"}`);
    io.write();
    io.write(c(`  最终评级: ${grade}  ${title}`, MAGENTA + ";" + BOLD));
    io.write(c("=".repeat(64), CYAN));
}
