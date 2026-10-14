"use strict";

const output = document.querySelector("#output");
const panel = document.querySelector("#choices-panel");
const question = document.querySelector("#question");
const choice_desc = document.querySelector("#choice-desc");
const choices = document.querySelector("#choices");
const start_form = document.querySelector("#start-form");
const player_id = document.querySelector("#player-id");
const sim_status = document.querySelector("#sim-status");
const game_panel = document.querySelector("#game-panel");

// 左栏常驻面板与右栏顶部状态。
const side_empty = document.querySelector("#side-empty");
const side_content = document.querySelector("#side-content");
const st_id = document.querySelector("#st-id");
const st_role = document.querySelector("#st-role");
const st_team = document.querySelector("#st-team");
const st_value = document.querySelector("#st-value");
const st_ovr = document.querySelector("#st-ovr");
const st_form = document.querySelector("#st-form");
const st_form_days = document.querySelector("#st-form-days");
const st_rank = document.querySelector("#st-rank");
const st_attrs = document.querySelector("#st-attrs");
const st_season = document.querySelector("#st-season");
const retire_btn = document.querySelector("#retire-btn");
const progress = document.querySelector("#progress");
const progress_fill = document.querySelector("#progress-fill");
const progress_label = document.querySelector("#progress-label");
const world_rank = document.querySelector("#world-rank");

// 右栏：队伍成员与下一场比赛。
const main_panel = document.querySelector(".main");
const st_coach = document.querySelector("#st-coach");
const st_roster = document.querySelector("#st-roster");
const st_roles = document.querySelector("#st-roles");
const next_card = document.querySelector("#next-card");

// 赛事总结二级窗口。
const ev_modal = document.querySelector("#event-modal");
const ev_panel = document.querySelector("#event-modal .modal-panel");
const ev_tier = document.querySelector("#ev-tier");
const ev_title = document.querySelector("#ev-title");
const ev_date = document.querySelector("#ev-date");
const ev_body = document.querySelector("#ev-body");
const ev_buttons = [...document.querySelectorAll("#event-modal .ev-btn")];

// 年度总结 / 生涯战报二级窗口。
const season_modal = document.querySelector("#season-modal");
const season_panel = document.querySelector("#season-modal .modal-panel");
const season_tier = document.querySelector("#season-tier");
const season_sub = document.querySelector("#season-sub");
const season_body = document.querySelector("#season-body");
const season_next = document.querySelector("#season-next");
const season_retire = document.querySelector("#season-retire");
const season_confirm = document.querySelector("#season-confirm");
const confirm_yes = document.querySelector("#confirm-yes");
const confirm_no = document.querySelector("#confirm-no");
const career_modal = document.querySelector("#career-modal");
const career_tier = document.querySelector("#career-tier");
const career_sub = document.querySelector("#career-sub");
const career_body = document.querySelector("#career-body");
const career_again = document.querySelector("#career-again");

// 将文字颜色码映射到样式类；只解释已知的颜色和字重，不把输出内容当作 HTML 执行。
const text_styles = {
    "36": "text-cyan", "32": "text-green", "33": "text-yellow",
    "31": "text-red", "35": "text-magenta", "1": "text-bold", "2": "text-dim",
};

// 把带颜色标记的文字铺进容器：按样式标记切分成文本节点和 span，绝不把内容当 HTML 执行。
function append_marked(container, text = "") {
    const pattern = /\x1b\[([0-9;]*)m/g;
    let start = 0;
    let styles = [];
    for (const match of text.matchAll(pattern)) {
        append_text(text.slice(start, match.index));
        styles = match[1] === "0" ? [] : match[1].split(";").map(code => text_styles[code]).filter(Boolean);
        start = match.index + match[0].length;
    }
    append_text(text.slice(start));

    function append_text(value) {
        if (!value) return;
        if (!styles.length) container.append(document.createTextNode(value));
        else {
            const span = document.createElement("span");
            span.className = styles.join(" ");
            span.textContent = value;
            container.append(span);
        }
    }
}

// 一行普通输出（无日期）：开局引导、年度总结、生涯战报等。
function write_line(text = "") {
    const row = el("div", "log-plain");
    append_marked(row, text);
    output.append(row);
    output.scrollTop = output.scrollHeight;
}

// 一条结构化日志：日期列 + 内容行，kind（match / event / idle / year）决定配色。
function write_entry(entry) {
    const row = el("div", "log-item k-" + entry.kind);
    row.append(el("span", "date", entry.date));
    const lines = el("div", "lines");
    for (const line of entry.lines) {
        const paragraph = el("p");
        append_marked(paragraph, line);
        lines.append(paragraph);
    }
    row.append(lines);
    output.append(row);
    output.scrollTop = output.scrollHeight;
}

// 生涯日志每年清空（新赛季开始时由 game.js 触发）。
function clear_log() {
    output.replaceChildren();
    output.scrollTop = 0;
}

// 建节点的小工具：文字一律走 textContent，快照里的 ID / 队名不会被当作 HTML 执行。
function el(tag, className = "", text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null) node.textContent = text;
    return node;
}

// 属性分两组渲染，与 data.js 的 ATTR_BASE_KEYS / ATTR_PERF_KEYS 保持一致。
const ATTR_GROUPS = [
    {label: "基础 · 硬件", keys: () => ATTR_BASE_KEYS},
    {label: "表现 · 打成成绩", keys: () => ATTR_PERF_KEYS},
];

// 属性条分档着色（0～100）：阈值 40 / 60 / 75，越高越「热」。样式类见 style.css 的 .fill.tN。
function attr_tier(value) {
    if (value >= 75) return 3;
    if (value >= 60) return 2;
    if (value >= 40) return 1;
    return 0;
}

// 左栏常驻面板：把 game.js 送来的纯数据快照铺进 DOM，每次刷新整块重建。
function renderStatus(s) {
    side_empty.hidden = true;
    side_content.hidden = false;

    st_id.textContent = s.id;
    st_role.textContent = s.role;
    st_team.replaceChildren(
        el("b", "", s.team_name),
        document.createTextNode(` · ${s.league_short} ${s.tier_name}`),
    );
    st_value.replaceChildren(
        document.createTextNode("身价 "),
        el("b", "", `${s.value} 万`),
    );
    st_ovr.textContent = String(s.overall);

    // 状态：好状态（≥4）绿、差状态（≤2）红、普通保持默认灰。
    if (s.form) {
        const sign = s.form.mod_pct >= 0 ? "+" : "";
        st_form.textContent = `${s.form.name} ${sign}${s.form.mod_pct}%`;
        st_form.className = "tag " + (s.form.index >= 4 ? "green" : s.form.index <= 2 ? "red" : "");
        st_form_days.textContent = `剩余 ${s.form.days} 天`;
    } else {
        st_form.textContent = "—";
        st_form.className = "tag";
        st_form_days.textContent = "";
    }
    st_rank.textContent = `世界排名 ${s.world_rank}`;

    st_attrs.replaceChildren();
    for (const group of ATTR_GROUPS) {
        const box = el("div", "attr-group");
        box.append(el("div", "micro", group.label));
        for (const key of group.keys()) {
            const core = s.role_weights[key] >= 0.10;
            const row = el("div", "bar-row");
            const label = el("span", "lb");
            if (core) label.append(el("i", "core"));
            label.append(document.createTextNode(ATTR_LABEL[key]));
            const track = el("span", "track");
            const fill = el("i", "fill t" + attr_tier(s.attrs[key]));
            fill.style.width = Math.max(0, Math.min(100, s.attrs[key])) + "%";
            track.append(fill);
            row.append(label, track, el("span", "vl", String(s.attrs[key])));
            box.append(row);
        }
        st_attrs.append(box);
    }

    st_season.replaceChildren();
    const season_rows = [
        ["赛季积分", String(s.season.points)],
        ["实时名次", `#${s.season.rank} / 100`],
        ["出战", `${s.season.events} 站` + (s.season.maps ? ` / ${s.season.maps} 图` : "")],
        ["生涯峰值", String(s.peak)],
    ];
    for (const [label, value] of season_rows) {
        const row = el("div", "season-row");
        row.append(el("span", "", label), el("span", "sc", value));
        st_season.append(row);
    }

    renderRoster(s);
    renderNext(s);

    progress.hidden = false;
    world_rank.hidden = false;
    world_rank.textContent = `世界 #${s.season.rank}`;

    // 左栏内容变了（队伍、属性、赛季数据），右栏高度跟着重新对齐。
    syncPanelHeight();
}

// 右栏「队伍成员」：上场五人（玩家高亮）与位置标签，右上角是教练。
function renderRoster(s) {
    st_coach.replaceChildren(document.createTextNode("教练："), el("b", "", s.coach));
    st_roster.replaceChildren();
    st_roles.replaceChildren();
    for (const member of s.roster) {
        const box = el("div", "member" + (member.me ? " me" : ""));
        box.append(el("div", "m-id", member.id), el("div", "m-age", `${member.age} 岁`));
        const ovr = el("div", "m-ovr");
        ovr.append(document.createTextNode(String(member.overall)), el("small", "", "总评"));
        box.append(ovr);
        const value = el("div", "m-value");
        value.append(el("span", "", "身价"), document.createTextNode(`${member.value} 万`));
        box.append(value);
        st_roster.append(box);
        st_roles.append(el("span", "", member.role || ""));
    }
}

// 右栏「下一场比赛」：距今天数、赛事名、等级与日期；本赛季打完时提示结束。
function renderNext(s) {
    next_card.replaceChildren();
    if (!s.next) {
        const head = el("div", "next-head");
        head.append(el("span", "", "下一场比赛"));
        next_card.append(head, el("div", "next-idle", "本赛季已无比赛"));
        return;
    }
    const head = el("div", "next-head");
    head.append(el("span", "", "下一场比赛"), el("span", "days", `距离天数：${s.next.days} 天`));
    next_card.append(head);
    const main = el("div", "next-main");
    main.append(el("div", "n-name", s.next.name));
    const tier = el("div", "n-tier");
    tier.append(document.createTextNode("赛事等级："), el("b", "", s.next.tier));
    main.append(tier, el("div", "n-date", `比赛日期 ${s.next.from} — ${s.next.to}`));
    next_card.append(main);
}

// 右栏高度跟随左栏内容：底部与左栏的「退役」按钮对齐，日志在卡片内部滚动。
// 窄屏是单列布局，右栏回到自适应高度（日志卡自带固定高度）。
function syncPanelHeight() {
    if (window.innerWidth <= 820 || side_content.hidden) {
        main_panel.style.height = "";
        return;
    }
    const height = document.querySelector("#status-panel").offsetHeight;
    main_panel.style.height = height ? height + "px" : "";
}

window.addEventListener("resize", syncPanelHeight);

// 右栏顶部的赛季进度条：由 io.simulate 每段模拟时带上的进度信息驱动。
function updateProgress(day, total) {
    progress.hidden = false;
    const pct = total ? Math.max(0, Math.min(100, day / total * 100)) : 0;
    progress_fill.style.width = pct + "%";
    progress_label.textContent = `赛季第 ${Math.min(day, total)} / ${total} 天`;
}

/* ==========================================================================
 * 赛事总结二级窗口
 * --------------------------------------------------------------------------
 * 打开时默认「总览」，可切「详细数据」查看本站每场比赛与逐图明细；
 * 关闭后清空内容、从视图退场，不保留任何入口（玩家无法再次查看）。
 * Swing 由 game.js 随 payload 逐图给出（与 swing_of 同源），这里只做平均与格式化。
 * ========================================================================== */
const ev_swing_text = value => (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
const ev_rating_class = rating => (rating >= 1.25 ? "r-hi" : rating >= 1.00 ? "r-mid" : "r-low");

// 总览：赛事前八名、赛事 MVP、你的表现，以及全场 Rating / 击杀 Top10。
function overviewNode(p) {
    const grid = el("div", "ev-grid");
    const left = el("div");

    const result = el("div", "ev-card");
    result.append(el("h3", "", "赛事结果"));
    const placements = [
        ["冠军", [p.result.champion], true],
        ["亚军", [p.result.runner_up], false],
        ["四强", p.result.semi, false],
        ["八强", p.result.quarter, false],
    ];
    for (const [label, names, gold] of placements) {
        const row = el("div", "placing" + (gold ? " gold" : ""));
        row.append(el("span", "k", label));
        const value = el("span", "v");
        names.forEach((name, index) => {
            if (index) value.append(document.createTextNode("、"));
            value.append(el("b", "", name));
        });
        row.append(value);
        result.append(row);
    }
    left.append(result);

    if (p.mvp) {
        const mvp = el("div", "ev-card");
        mvp.append(el("h3", "", "赛事 MVP"));
        const main = el("div", "mvp-main");
        main.append(el("div", "mvp-team", p.mvp.team));
        const who = el("div", "mvp-who");
        who.append(el("b", "", p.mvp.id), el("span", "", p.mvp.role));
        main.append(who);
        mvp.append(main);
        const rating = el("div", "mvp-rating");
        rating.append(el("span", "lb", "RATING"), el("span", "vl", p.mvp.rating.toFixed(2)));
        mvp.append(rating);
        left.append(mvp);
    }

    const you = el("div", "ev-card");
    you.append(el("h3", "", "你的表现"));
    const place = el("div", "you-place");
    place.append(document.createTextNode("队伍表现  "), el("b", "", p.you.placement));
    const rate = el("div", "you-place");
    rate.append(document.createTextNode("Rating  "), el("b", "", p.you.rating.toFixed(2)));
    you.append(place, rate);
    const nums = el("div", "you-nums");
    for (const [label, value] of [["击杀", p.you.kills], ["助攻", p.you.assists], ["死亡", p.you.deaths]]) {
        const box = el("div", "you-num");
        box.append(el("b", "", String(value)), el("span", "", label));
        nums.append(box);
    }
    you.append(nums);
    const meta = el("div", "you-meta");
    const meta_rows = [["地图", String(p.you.maps)], ["KAST", p.you.kast.toFixed(0) + "%"], ["ADR", p.you.adr.toFixed(0)]];
    for (const [label, value] of meta_rows) {
        const box = el("div");
        box.append(el("b", "", value), document.createTextNode(label));
        meta.append(box);
    }
    you.append(meta);
    left.append(you);

    const boards = el("div", "boards");
    boards.append(boardNode("Rating 榜单", p.rating_board, item => item.rating.toFixed(2)));
    boards.append(boardNode("击杀榜", p.kill_board, item => String(item.kills)));
    grid.append(left, boards);
    return grid;
}

function boardNode(title, list, valueOf) {
    const box = el("div", "board");
    box.append(el("h3", "", title));
    const ol = el("ol");
    list.forEach((item, index) => {
        const li = el("li", item.me ? "me" : "");
        li.append(el("span", "no" + (index < 3 ? " top" : ""), String(item.rank)));
        const name = el("span", "nm");
        name.append(el("b", "", item.id), el("span", "", item.team));
        li.append(name, el("span", "vl", valueOf(item)));
        ol.append(li);
    });
    box.append(ol);
    return box;
}

// 详细数据：左侧每场比赛，右侧「图一 / 图二 / … / 全场表现」切换的双方选手表格。
function detailNode(p, state) {
    const grid = el("div", "detail-grid");
    const left = el("div");

    const team = el("div", "ev-card team-card");
    team.append(el("div", "team-name", p.you.team));
    const place = el("div", "team-place");
    place.append(document.createTextNode("队伍表现  "), el("b", "", p.you.placement));
    team.append(place);
    left.append(team);

    const list = el("div", "match-list");
    p.detail.forEach((match, index) => {
        const box = el("div", "match" + (index === state.matchIdx ? " on" : ""));
        box.append(el("div", "stage", match.stage));
        const line = el("div", "line");
        line.append(el("b", "", p.you.team), document.createTextNode(` vs ${match.opponent}  `));
        line.append(el("span", "res " + (match.won ? "win" : "lose"), match.won ? "胜" : "负"));
        box.append(line);
        box.addEventListener("click", () => {
            state.matchIdx = index;
            state.mapIdx = "all";
            drawEventSummary(p, state);
        });
        list.append(box);
    });
    left.append(list);
    grid.append(left);

    const match = p.detail[state.matchIdx];
    const main = el("div", "detail-main");
    const tabs = el("div", "map-tabs");
    match.maps.forEach((_, index) => tabs.append(mapTabNode(`图${"一二三四五"[index]}`, index, p, state)));
    tabs.append(mapTabNode("全场表现", "all", p, state));
    main.append(tabs);

    const wrap = el("div", "stat-wrap");
    if (state.mapIdx === "all") {
        wrap.append(statTableNode(match, match.maps, "全场表现", `共 ${match.maps.length} 图`, p));
    } else {
        const map = match.maps[state.mapIdx];
        wrap.append(statTableNode(match, [map], `图${"一二三四五"[state.mapIdx]}`, map.won ? "本图获胜" : "本图失利", p));
    }
    main.append(wrap);
    grid.append(main);
    return grid;
}

function mapTabNode(label, index, p, state) {
    const button = el("button", "map-tab" + (state.mapIdx === index ? " on" : "") + (index === "all" ? " all" : ""), label);
    button.type = "button";
    button.addEventListener("click", () => {
        state.mapIdx = index;
        drawEventSummary(p, state);
    });
    return button;
}

function statTableNode(match, maps, caption, tag, p) {
    const table = el("table", "stat-table");
    const cap = el("caption");
    cap.append(document.createTextNode(caption), el("span", "tag", tag));
    table.append(cap);
    const head = el("thead");
    const row = el("tr");
    for (const label of ["选手", "K/D/A", "Swing", "ADR", "KAST", "Rating"]) row.append(el("th", "", label));
    head.append(row);
    table.append(head);
    table.append(sideBody(p.you.team, maps, "mine"));
    table.append(sideBody(match.opponent, maps, "theirs"));
    return table;
}

// 一支队伍的选手表：K/D/A 取各图总和，Swing / ADR / KAST / Rating 取各图平均，段内按 Rating 降序。
function sideBody(team, maps, key) {
    const body = el("tbody");
    const head_row = el("tr", "team-row");
    const cell = el("td", "", team);
    cell.colSpan = 6;
    head_row.append(cell);
    body.append(head_row);

    const sumOf = (index, field) => maps.reduce((total, map) => total + map[key][index][field], 0);
    const avgOf = (index, field) => sumOf(index, field) / maps.length;
    const order = maps[0][key].map((_, index) => index)
        .sort((a, b) => avgOf(b, "rating") - avgOf(a, "rating"));

    for (const index of order) {
        const player = maps[0][key][index];
        const rating = avgOf(index, "rating");
        const row = el("tr", player.me ? "me" : "");
        const name = el("td");
        name.append(document.createTextNode(player.id));
        if (player.role) name.append(el("span", "role", player.role));
        row.append(name);
        const kda = `${Math.round(sumOf(index, "kills"))}-${Math.round(sumOf(index, "deaths"))}-${Math.round(sumOf(index, "assists"))}`;
        row.append(el("td", "", kda));
        const swing = avgOf(index, "swing");
        row.append(el("td", swing >= 0 ? "sw-up" : "sw-dn", ev_swing_text(swing)));
        row.append(el("td", "", avgOf(index, "adr").toFixed(0)));
        row.append(el("td", "", avgOf(index, "kast").toFixed(0) + "%"));
        row.append(el("td", ev_rating_class(rating), rating.toFixed(2)));
        body.append(row);
    }
    return body;
}

// 把当前状态画进窗口（总览 / 详细数据），切换时只重建正文。
function drawEventSummary(p, state) {
    ev_tier.textContent = p.event.tier;
    ev_title.textContent = p.event.name;
    ev_date.textContent = `比赛日期：${p.event.from} — ${p.event.to}`;
    ev_body.replaceChildren(state.view === "overview" ? overviewNode(p) : detailNode(p, state));
    ev_body.scrollTop = 0;
}

// 打开窗口：默认总览，可切详细数据或按 Esc 关闭；关闭后清空内容并退场，之后无法再查看。
function show_event_summary(payload) {
    return new Promise(resolve => {
        const state = {view: "overview", matchIdx: 0, mapIdx: "all"};
        const close = () => {
            ev_body.replaceChildren();
            ev_modal.hidden = true;
            document.removeEventListener("keydown", on_key);
            resolve();
        };
        const on_key = event => {
            if (event.key === "Escape") close();
        };
        ev_buttons.forEach(button => {
            button.classList.toggle("on", button.dataset.view === "overview");
            button.onclick = () => {
                const view = button.dataset.view;
                if (view === "close") {
                    close();
                    return;
                }
                state.view = view;
                ev_buttons.forEach(other => other.classList.toggle("on", other === button));
                drawEventSummary(payload, state);
            };
        });
        document.addEventListener("keydown", on_key);
        ev_modal.hidden = false;
        drawEventSummary(payload, state);
        ev_panel.focus();
    });
}

/* ==========================================================================
 * 年度总结 / 生涯战报二级窗口
 * --------------------------------------------------------------------------
 * 年度总结：队伍年终排名、本赛季数据、属性变化、世界 Top20；底部「进入下一年」与
 * 「退役」（退役还要二次确认）。必然退役的年份只留「查看生涯战报」。
 * 生涯战报：生涯概览、逐年时间线、冠军与赛事 MVP 荣誉室、退役原因；底部「再来一局」。
 * 两者关掉后都清空内容、不保留入口。
 * ========================================================================== */

// 指标格：大数字 + 说明，tone 决定数字配色（cy / yl / gr / violet）。
function metricNode(value, label, tone = "") {
    const box = el("div", "metric" + (tone ? " " + tone : ""));
    box.append(el("b", "", value), el("span", "", label));
    return box;
}

// 年度 Top20 榜：名次 + 选手 + 队伍与位置，玩家那行高亮，底部标注玩家名次。
function top20BoardNode(p) {
    const box = el("div", "board");
    box.append(el("h3", "", `${p.year} 年度世界 Top20 评选`));
    const list = el("ol");
    for (const entry of p.top20.list) {
        const li = el("li", entry.me ? "me" : "");
        li.append(el("span", "no" + (entry.rank <= 3 ? " top" : ""), String(entry.rank)));
        const name = el("span", "nm");
        name.append(el("b", "", entry.id),
            el("span", "", `#${entry.team_rank} ${entry.team} · ${entry.role}`));
        li.append(name, el("span", "vl", entry.rating.toFixed(2)));
        list.append(li);
    }
    box.append(list);
    box.append(el("div", "board-note", p.top20.mine
        ? `你 · 第 ${p.top20.mine} 名（入选 Top20）`
        : "你 · 未入选 Top20"));
    return box;
}

// 年度总结正文：队伍年终排名 → 本赛季数据 → 属性变化 → 世界 Top20。
function renderSeasonBody(p) {
    const body = document.createDocumentFragment();

    const rankCard = el("div", "ev-card");
    const row = el("div", "rank-row");
    const team = el("div", "rank-team");
    team.append(el("b", "", p.team.name),
        el("span", "", `${p.team.league} ${p.team.tier} · 世界第 ${p.team.rank} 名`));
    const badge = el("div", "rank-badge");
    badge.append(el("span", "lb", "赛季积分"), el("span", "vl", String(p.team.points)));
    const move = el("span", "mv " + (p.team.move > 0 ? "up" : p.team.move < 0 ? "dn" : "flat"));
    move.textContent = p.team.move > 0 ? `↑ ${p.team.move} 位`
        : p.team.move < 0 ? `↓ ${-p.team.move} 位` : "— 名次持平";
    badge.append(move);
    row.append(team, badge);
    rankCard.append(row,
        el("div", "rank-meta", `本赛季 ${p.team.wins} 胜 ${p.team.losses} 负 · 年终按赛季积分重排`));
    body.append(rankCard);

    const statsCard = el("div", "ev-card");
    statsCard.append(el("h3", "", "本赛季"));
    const stats = el("div", "stat-grid cols-3");
    stats.append(
        metricNode(String(p.stats.events), "出战站数", "cy"),
        metricNode(String(p.stats.maps), "地图数", "cy"),
        metricNode(String(p.stats.titles), "冠军", "yl"),
        metricNode(p.stats.rating.toFixed(2), "平均 Rating", "gr"),
        metricNode(p.stats.kd.toFixed(2), "K / D"),
        metricNode(p.stats.adr.toFixed(0), "场均 ADR"),
        metricNode(String(p.stats.kills), "击杀", "yl"),
        metricNode(String(p.stats.deaths), "阵亡"),
        metricNode(`${p.stats.value} 万`,
            `身价 ${p.stats.value_delta >= 0 ? "↑" : "↓"}${Math.abs(p.stats.value_delta)}`, "cy"),
    );
    statsCard.append(stats);
    body.append(statsCard);

    const attrCard = el("div", "ev-card");
    attrCard.append(el("h3", "", "属性变化"));
    const attrs = el("div", "attr-deltas");
    for (const attr of p.attrs) {
        const box = el("div", "attr-delta");
        const value = el("b", attr.delta > 0 ? "up" : attr.delta < 0 ? "dn" : "flat");
        value.textContent = (attr.delta > 0 ? "+" : "") + attr.delta;
        box.append(el("span", "", attr.label), value);
        attrs.append(box);
    }
    attrCard.append(attrs);
    body.append(attrCard);

    body.append(top20BoardNode(p));
    return body;
}

// 生涯战报正文：生涯概览 → 逐年时间线 → 荣誉室（冠军 ★ 与赛事 MVP ◆）→ 退役原因。
function renderCareerBody(p) {
    const body = document.createDocumentFragment();

    const over = el("div", "ev-card");
    over.append(el("h3", "", "生涯概览"));
    const stats = el("div", "stat-grid cols-3");
    stats.append(
        metricNode(String(p.seasons), `赛季 · ${p.age_start}-${p.age_end} 岁`, "cy"),
        metricNode(String(p.events), "出战站数", "cy"),
        metricNode(String(p.maps), "地图数"),
        metricNode(String(p.peak), `生涯峰值（最终 ${p.overall}）`),
        metricNode(p.rating.toFixed(2), "平均 Rating", "gr"),
        metricNode(p.kd.toFixed(2), "K / D"),
        metricNode(String(p.kills), "生涯击杀", "yl"),
        metricNode(String(p.deaths), "阵亡"),
        metricNode(String(p.titles), "赛事冠军", "yl"),
        metricNode(String(p.mvp_count), "赛事 MVP", "cy"),
        metricNode(String(p.top20), "入选 Top20", "violet"),
        metricNode(`${p.value} 万`, "身价", "cy"),
    );
    over.append(stats);
    body.append(over);

    const timeCard = el("div", "ev-card");
    timeCard.append(el("h3", "", "生涯时间线"));
    const table = el("table", "timeline");
    const head = el("tr");
    for (const label of ["年份", "年龄", "队伍", "档位", "名次", "出战", "冠军", "Rating"]) {
        head.append(el("th", "", label));
    }
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const tbody = el("tbody");
    for (const row of p.timeline) {
        const tr = el("tr", row.honor ? "hot" : "");
        tr.append(
            el("td", "", String(row.year)),
            el("td", "", `${row.age} 岁`),
            el("td", "team", row.team),
            el("td", "", row.tier),
            el("td", "", `#${row.rank}`),
            el("td", "", `${row.events} 站`),
            el("td", "", `${row.titles} 冠`),
            el("td", "", row.rating.toFixed(2)),
        );
        tbody.append(tr);
    }
    table.append(tbody);
    timeCard.append(table);
    body.append(timeCard);

    const honorCard = el("div", "ev-card");
    honorCard.append(el("h3", "", "荣誉室"));
    const honors = el("div", "honors");
    if (p.honors.length) {
        for (const honor of p.honors) {
            const mvp = honor.kind === "mvp";
            const row = el("div", "honor" + (mvp ? " mvp" : ""));
            row.append(el("span", mvp ? "mvp-mark" : "star", mvp ? "◆" : "★"));
            if (mvp) row.append(el("span", "kind", "MVP"));
            row.append(document.createTextNode(honor.text));
            honors.append(row);
        }
    } else {
        honors.append(el("div", "honor empty", "（空空如也）"));
    }
    honorCard.append(honors);
    body.append(honorCard);

    const note = el("div", "retire-note");
    note.append(document.createTextNode("退役原因："), el("b", "", p.retire_reason));
    body.append(note);
    return body;
}

// 打开年度总结：resolve("next") 进入下一年，resolve("retire") 退役（含二次确认）。
function show_season_summary(p) {
    return new Promise(resolve => {
        season_tier.textContent = `${p.year} 赛季`;
        season_sub.replaceChildren(
            document.createTextNode(`${p.id} · ${p.role} · ${p.age} 岁　|　${p.team.name} `),
            el("b", "", `${p.team.league} ${p.team.tier}`),
        );
        season_body.replaceChildren(renderSeasonBody(p));
        season_body.scrollTop = 0;
        season_confirm.hidden = true;
        // 本年结束后必然退役时只留一个出口，避免出现按了也没用的按钮。
        season_next.textContent = p.must_retire ? "查看生涯战报" : "进入下一年";
        season_retire.hidden = p.must_retire;

        const close = action => {
            season_body.replaceChildren();
            season_confirm.hidden = true;
            season_modal.hidden = true;
            document.removeEventListener("keydown", on_key);
            resolve(action);
        };
        const on_key = event => {
            if (event.key !== "Escape") return;
            if (!season_confirm.hidden) season_confirm.hidden = true;
            else close("next");
        };
        season_next.onclick = () => close("next");
        season_retire.onclick = () => { season_confirm.hidden = false; };
        confirm_no.onclick = () => { season_confirm.hidden = true; };
        confirm_yes.onclick = () => close("retire");
        document.addEventListener("keydown", on_key);

        season_modal.hidden = false;
        season_panel.focus();
    });
}

// 打开生涯战报：点「再来一局」后清空内容并重开（刷新页面）。
function show_career_report(p) {
    return new Promise(resolve => {
        career_tier.textContent = `最终评级 ${p.grade}`;
        career_sub.replaceChildren(
            document.createTextNode(`${p.id} · ${p.role} · `),
            el("b", "", p.title),
        );
        career_body.replaceChildren(renderCareerBody(p));
        career_body.scrollTop = 0;
        career_again.onclick = () => {
            career_body.replaceChildren();
            career_modal.hidden = true;
            resolve("again");
            location.reload();
        };
        career_modal.hidden = false;
    });
}

// 左栏「退役」按钮：点击时让当前等待中的 io.choose 立即以 RETIRE 结束（随时可主动退役）。
let retire_resolver = null;
retire_btn.addEventListener("click", () => {
    if (retire_resolver) retire_resolver();
});

// 一次只展示当前问题的选项，点击后立即禁用并隐藏，保证同一选项不会重复结算。
// Promise 只在点击（或点「退役」）时完成；游戏逻辑通过 await 暂停，避免循环轮询。
const io = {
    write: write_line,
    status: renderStatus,
    summary: show_event_summary,
    season: show_season_summary,
    career: show_career_report,
    log: write_entry,
    clear_log,

    // 逐日模拟的进度提示：显示「当前日期 YYYY/M/D，模拟中...」，省略号数量循环，
    // 日期随动画推进，约 2~3 秒后返回，起到加载条的作用。progress 用于刷新赛季进度条。
    simulate(dates = [], progress_info = null) {
        if (progress_info) updateProgress(progress_info.day, progress_info.total);
        if (!dates.length) return Promise.resolve();
        return new Promise(resolve => {
            sim_status.hidden = false;
            const start = performance.now();
            const duration = 2000 + Math.random() * 1000;
            const tick = () => {
                const elapsed = performance.now() - start;
                const index = Math.min(dates.length - 1, Math.floor(elapsed / duration * dates.length));
                const dots = ".".repeat(3 + Math.floor(elapsed / 220) % 3);
                sim_status.textContent = `当前日期 ${dates[index]}，模拟中${dots}`;
                if (elapsed < duration) requestAnimationFrame(tick);
                else {
                    sim_status.hidden = true;
                    sim_status.textContent = "";
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });
    },

    // meta.kind 决定卡片外观（event 为橙色事件卡，其余为中性选择卡）；
    // meta.allow_retire 为真时左栏「退役」按钮可点，点了就让本次选择返回 RETIRE。
    choose(prompt, options, meta = {}) {
        question.textContent = prompt;
        choice_desc.textContent = meta.desc || "";
        choices.replaceChildren();
        panel.hidden = false;
        panel.classList.toggle("kind-event", meta.kind === "event");
        panel.classList.toggle("plain", meta.kind !== "event");
        return new Promise(resolve => {
            let done = false;
            const finish = value => {
                if (done) return;
                done = true;
                retire_resolver = null;
                retire_btn.disabled = true;
                panel.hidden = true;
                output.style.paddingBottom = "";
                resolve(value);
            };
            retire_btn.disabled = !meta.allow_retire;
            retire_resolver = () => finish(RETIRE);
            options.forEach((label, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.append(
                    el("span", "idx", String(index + 1)),
                    el("span", "txt", label),
                    el("span", "ch", "›"),
                );
                button.addEventListener("click", () => {
                    for (const option of choices.children) option.disabled = true;
                    finish(index);
                }, {once: true});
                choices.append(button);
            });
            // 事件卡浮在日志底部：给日志留出等高的内边距，滚到底时最后几行不会被遮住。
            output.style.paddingBottom = ((panel.offsetHeight || 0) + 28) + "px";
            output.scrollTop = output.scrollHeight;
        });
    },
};

// 提交 ID 后选择位置，再生成世界。每段生涯使用独立的随机种子。
// in-game 在正式进入模拟时才加上：开局的选择界面用普通流式布局，不套右栏高度约束。
async function main(name) {
    const seed = Math.floor(Math.random() * 2 ** 30);
    const role = await pick_role(new Random(seed), false, io);
    document.body.classList.add("in-game");
    game_panel.hidden = false;
    await run_game(name, role, seed, false, io);
    io.write("\n游戏结束。刷新页面可开始新生涯。");
    panel.hidden = true;
    retire_btn.disabled = true;
    output.scrollIntoView({block: "end"});
}

// 表单提交同时支持点击和回车；启动后隐藏表单，防止重复开启两个并行生涯。
start_form.addEventListener("submit", event => {
    event.preventDefault();
    start_form.hidden = true;
    main(player_id.value.trim() || "无名之辈").catch(error => {
        panel.hidden = true;
        io.write(c("\n运行失败：" + error.message, RED));
        console.error(error);
    });
}, {once: true});
