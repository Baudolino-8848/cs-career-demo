"use strict";

// PLAYER_DB：100 支战队共 500 名选手的固定开局档案（2026 赛季快照）。
// 每支队伍一组，键为队名（与 vrs.js 的 name 完全一致），数组顺序与 vrs.js 的 roster 一一对应。
// 每条含位置 role、年龄 age 与十四维属性 attrs（键顺序同 data.js 的 ATTR_KEYS）。
// 前 50 队（真实 VRS 选手）的位置、年龄、属性与身价均按现实设定（年龄为 2026 年实际年龄），还带
// 人设身价 value（万）：属性以「现实水平基准 + 位置画像 + 个体特长/短板」展开，身价按现实名气与
// 年龄潜力给定；后 50 队为虚构名单，无 value。
// 这份数据是开局时装载的唯一来源，不再随机生成；赛季推进后成长、衰退、转会（以及身价随总评与
// 年龄的变化）照旧。退役或转会后补位的新人由 game.js 按队伍档位随机生成，不写入本文件。
// bobeksde 在 Alliance 与 EYEBALLERS 各有一条独立档案，与 vrs.js 的两个席位对应。
const PLAYER_DB = {
    "Spirit": [
        {"id":"donk","role":"步枪手","age":19,"attrs":{"reaction":94,"preaim":98,"spray":97,"positioning":94,"utility":85,"movement":96,"entry":99,"clutch":92,"info":89,"trade":95,"comms":90,"composure":92,"stability":92,"focus":92},"value":500},
        {"id":"magixx","role":"辅助","age":24,"attrs":{"reaction":79,"preaim":79,"spray":78,"positioning":80,"utility":89,"movement":78,"entry":76,"clutch":79,"info":86,"trade":84,"comms":87,"composure":82,"stability":81,"focus":81},"value":280},
        {"id":"sh1ro","role":"狙击手","age":25,"attrs":{"reaction":93,"preaim":97,"spray":86,"positioning":91,"utility":82,"movement":86,"entry":85,"clutch":93,"info":88,"trade":83,"comms":82,"composure":89,"stability":94,"focus":92},"value":460},
        {"id":"tN1R","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":250},
        {"id":"zont1x","role":"自由人","age":22,"attrs":{"reaction":84,"preaim":86,"spray":83,"positioning":88,"utility":83,"movement":85,"entry":82,"clutch":90,"info":86,"trade":82,"comms":81,"composure":84,"stability":83,"focus":82},"value":300}
    ],
    "Falcons": [
        {"id":"karrigan","role":"指挥","age":36,"attrs":{"reaction":77,"preaim":68,"spray":70,"positioning":79,"utility":83,"movement":75,"entry":70,"clutch":80,"info":93,"trade":77,"comms":91,"composure":83,"stability":80,"focus":81},"value":260},
        {"id":"kyousuke","role":"步枪手","age":20,"attrs":{"reaction":81,"preaim":85,"spray":84,"positioning":81,"utility":78,"movement":79,"entry":82,"clutch":79,"info":79,"trade":82,"comms":77,"composure":79,"stability":79,"focus":79},"value":280},
        {"id":"m0NESY","role":"狙击手","age":21,"attrs":{"reaction":97,"preaim":99,"spray":87,"positioning":94,"utility":83,"movement":87,"entry":86,"clutch":90,"info":89,"trade":84,"comms":83,"composure":90,"stability":92,"focus":93},"value":490},
        {"id":"NiKo","role":"步枪手","age":29,"attrs":{"reaction":90,"preaim":98,"spray":97,"positioning":90,"utility":87,"movement":88,"entry":94,"clutch":91,"info":88,"trade":91,"comms":86,"composure":88,"stability":88,"focus":88},"value":450},
        {"id":"TeSeS","role":"辅助","age":27,"attrs":{"reaction":79,"preaim":79,"spray":78,"positioning":80,"utility":89,"movement":78,"entry":76,"clutch":79,"info":86,"trade":84,"comms":87,"composure":82,"stability":81,"focus":81},"value":260}
    ],
    "Vitality": [
        {"id":"apEX","role":"指挥","age":33,"attrs":{"reaction":77,"preaim":76,"spray":76,"positioning":79,"utility":83,"movement":75,"entry":74,"clutch":80,"info":91,"trade":77,"comms":91,"composure":79,"stability":80,"focus":81},"value":280},
        {"id":"flameZ","role":"突破手","age":23,"attrs":{"reaction":91,"preaim":89,"spray":88,"positioning":85,"utility":81,"movement":92,"entry":99,"clutch":82,"info":83,"trade":87,"comms":82,"composure":86,"stability":85,"focus":86},"value":420},
        {"id":"mezii","role":"辅助","age":27,"attrs":{"reaction":80,"preaim":80,"spray":79,"positioning":81,"utility":90,"movement":79,"entry":77,"clutch":80,"info":87,"trade":85,"comms":88,"composure":83,"stability":82,"focus":82},"value":300},
        {"id":"ropz","role":"自由人","age":27,"attrs":{"reaction":89,"preaim":91,"spray":88,"positioning":97,"utility":88,"movement":90,"entry":87,"clutch":98,"info":95,"trade":87,"comms":86,"composure":89,"stability":88,"focus":87},"value":450},
        {"id":"ZywOo","role":"狙击手","age":25,"attrs":{"reaction":96,"preaim":99,"spray":92,"positioning":94,"utility":85,"movement":87,"entry":88,"clutch":96,"info":91,"trade":86,"comms":85,"composure":92,"stability":94,"focus":95},"value":500}
    ],
    "Natus Vincere": [
        {"id":"Aleksib","role":"指挥","age":28,"attrs":{"reaction":76,"preaim":70,"spray":75,"positioning":78,"utility":82,"movement":74,"entry":73,"clutch":79,"info":92,"trade":76,"comms":90,"composure":82,"stability":79,"focus":80},"value":290},
        {"id":"b1t","role":"步枪手","age":23,"attrs":{"reaction":85,"preaim":89,"spray":88,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":330},
        {"id":"iM","role":"步枪手","age":24,"attrs":{"reaction":85,"preaim":89,"spray":88,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":330},
        {"id":"makazze","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":250},
        {"id":"w0nderful","role":"狙击手","age":21,"attrs":{"reaction":92,"preaim":93,"spray":85,"positioning":90,"utility":81,"movement":85,"entry":84,"clutch":88,"info":87,"trade":82,"comms":81,"composure":88,"stability":90,"focus":91},"value":410}
    ],
    "FURIA": [
        {"id":"FalleN","role":"指挥","age":35,"attrs":{"reaction":77,"preaim":73,"spray":76,"positioning":79,"utility":83,"movement":75,"entry":74,"clutch":80,"info":92,"trade":77,"comms":91,"composure":83,"stability":80,"focus":81},"value":250},
        {"id":"KSCERATO","role":"步枪手","age":26,"attrs":{"reaction":88,"preaim":92,"spray":94,"positioning":92,"utility":85,"movement":86,"entry":89,"clutch":90,"info":86,"trade":89,"comms":84,"composure":86,"stability":86,"focus":86},"value":420},
        {"id":"molodoy","role":"狙击手","age":20,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":300},
        {"id":"YEKINDAR","role":"突破手","age":27,"attrs":{"reaction":86,"preaim":84,"spray":83,"positioning":77,"utility":76,"movement":87,"entry":94,"clutch":77,"info":78,"trade":82,"comms":77,"composure":78,"stability":80,"focus":81},"value":320},
        {"id":"yuurih","role":"步枪手","age":26,"attrs":{"reaction":85,"preaim":89,"spray":88,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":320}
    ],
    "MOUZ": [
        {"id":"jL","role":"步枪手","age":25,"attrs":{"reaction":84,"preaim":88,"spray":87,"positioning":84,"utility":81,"movement":82,"entry":85,"clutch":82,"info":82,"trade":85,"comms":80,"composure":82,"stability":82,"focus":82},"value":340},
        {"id":"Spinx","role":"步枪手","age":24,"attrs":{"reaction":85,"preaim":89,"spray":88,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":360},
        {"id":"torzsi","role":"狙击手","age":24,"attrs":{"reaction":89,"preaim":94,"spray":82,"positioning":87,"utility":78,"movement":82,"entry":81,"clutch":85,"info":84,"trade":79,"comms":78,"composure":85,"stability":90,"focus":88},"value":370},
        {"id":"xelex","role":"步枪手","age":20,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"xertioN","role":"突破手","age":22,"attrs":{"reaction":88,"preaim":86,"spray":85,"positioning":82,"utility":78,"movement":89,"entry":95,"clutch":79,"info":80,"trade":84,"comms":79,"composure":83,"stability":82,"focus":83},"value":370}
    ],
    "Legacy": [
        {"id":"arT","role":"指挥","age":31,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":74,"movement":73,"entry":73,"clutch":75,"info":86,"trade":72,"comms":82,"composure":78,"stability":75,"focus":76},"value":250},
        {"id":"dumau","role":"步枪手","age":28,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"latto","role":"步枪手","age":26,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"n1ssim","role":"步枪手","age":22,"attrs":{"reaction":76,"preaim":80,"spray":79,"positioning":76,"utility":73,"movement":74,"entry":77,"clutch":74,"info":74,"trade":77,"comms":72,"composure":74,"stability":74,"focus":74},"value":236},
        {"id":"saadzin","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211}
    ],
    "Aurora": [
        {"id":"MAJ3R","role":"指挥","age":35,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":250},
        {"id":"soulfly","role":"步枪手","age":25,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":232},
        {"id":"Wicadia","role":"步枪手","age":22,"attrs":{"reaction":83,"preaim":87,"spray":86,"positioning":83,"utility":80,"movement":81,"entry":84,"clutch":81,"info":81,"trade":84,"comms":79,"composure":81,"stability":81,"focus":81},"value":300},
        {"id":"woxic","role":"狙击手","age":27,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":280},
        {"id":"XANTARES","role":"步枪手","age":31,"attrs":{"reaction":87,"preaim":95,"spray":94,"positioning":87,"utility":84,"movement":85,"entry":92,"clutch":85,"info":85,"trade":88,"comms":83,"composure":85,"stability":85,"focus":85},"value":400}
    ],
    "G2": [
        {"id":"HeavyGod","role":"步枪手","age":23,"attrs":{"reaction":83,"preaim":87,"spray":86,"positioning":83,"utility":80,"movement":81,"entry":84,"clutch":81,"info":81,"trade":84,"comms":79,"composure":81,"stability":81,"focus":81},"value":320},
        {"id":"huNter-","role":"指挥","age":30,"attrs":{"reaction":78,"preaim":77,"spray":77,"positioning":80,"utility":84,"movement":76,"entry":75,"clutch":81,"info":89,"trade":78,"comms":88,"composure":84,"stability":81,"focus":82},"value":320},
        {"id":"MATYS","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"NertZ","role":"步枪手","age":26,"attrs":{"reaction":85,"preaim":89,"spray":88,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":340},
        {"id":"SunPayus","role":"狙击手","age":26,"attrs":{"reaction":88,"preaim":89,"spray":81,"positioning":86,"utility":77,"movement":81,"entry":80,"clutch":84,"info":83,"trade":78,"comms":77,"composure":84,"stability":86,"focus":87},"value":350}
    ],
    "BetBoom": [
        {"id":"Boombl4","role":"指挥","age":27,"attrs":{"reaction":76,"preaim":75,"spray":75,"positioning":78,"utility":82,"movement":74,"entry":73,"clutch":79,"info":87,"trade":76,"comms":86,"composure":82,"stability":79,"focus":80},"value":280},
        {"id":"d1Ledez","role":"步枪手","age":23,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"FL4MUS","role":"步枪手","age":22,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"Magnojez","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"zorte","role":"狙击手","age":28,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":300}
    ],
    "FUT": [
        {"id":"cmtry","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"dem0n","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"dziugss","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"Krabeni","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"lauNX","role":"步枪手","age":24,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248}
    ],
    "9z": [
        {"id":"dgt","role":"步枪手","age":24,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"HUASOPEEK","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"luchov","role":"步枪手","age":23,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"max","role":"指挥","age":24,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":240},
        {"id":"meyern","role":"狙击手","age":27,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":240}
    ],
    "The MongolZ": [
        {"id":"910","role":"狙击手","age":22,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":320},
        {"id":"bLitz","role":"指挥","age":25,"attrs":{"reaction":76,"preaim":75,"spray":75,"positioning":78,"utility":82,"movement":74,"entry":73,"clutch":79,"info":91,"trade":76,"comms":89,"composure":82,"stability":79,"focus":80},"value":280},
        {"id":"cobrazera","role":"步枪手","age":23,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"mzinho","role":"突破手","age":20,"attrs":{"reaction":88,"preaim":86,"spray":85,"positioning":82,"utility":78,"movement":89,"entry":95,"clutch":79,"info":80,"trade":84,"comms":79,"composure":83,"stability":82,"focus":83},"value":320},
        {"id":"Techno","role":"步枪手","age":22,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273}
    ],
    "B8": [
        {"id":"alex666","role":"狙击手","age":22,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":232},
        {"id":"esenthial","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"kensizor","role":"步枪手","age":20,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"npl","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":191},
        {"id":"s1zzi","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "Astralis": [
        {"id":"HooXi","role":"指挥","age":31,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":280},
        {"id":"jabbi","role":"突破手","age":24,"attrs":{"reaction":86,"preaim":84,"spray":83,"positioning":80,"utility":76,"movement":84,"entry":89,"clutch":77,"info":78,"trade":82,"comms":77,"composure":81,"stability":80,"focus":81},"value":320},
        {"id":"phzy","role":"狙击手","age":23,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":330},
        {"id":"ryu","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"Staehr","role":"步枪手","age":23,"attrs":{"reaction":81,"preaim":85,"spray":84,"positioning":81,"utility":78,"movement":79,"entry":82,"clutch":79,"info":79,"trade":82,"comms":77,"composure":79,"stability":79,"focus":79},"value":320}
    ],
    "GamerLegion": [
        {"id":"hypex","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"PR","role":"步枪手","age":23,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"REZ","role":"步枪手","age":27,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":300},
        {"id":"Snax","role":"指挥","age":33,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":81,"movement":70,"entry":69,"clutch":75,"info":87,"trade":72,"comms":85,"composure":78,"stability":75,"focus":76},"value":250},
        {"id":"Tauson","role":"狙击手","age":22,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":232}
    ],
    "Monte": [
        {"id":"afro","role":"狙击手","age":22,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":250},
        {"id":"AZUWU","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"Bymas","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"Gizmy","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"Rainwaker","role":"步枪手","age":25,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273}
    ],
    "MIBR": [
        {"id":"brnz4n","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":232},
        {"id":"insani","role":"步枪手","age":25,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":191},
        {"id":"kl1m","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"LNZ","role":"狙击手","age":22,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":260},
        {"id":"venomzera","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248}
    ],
    "PARIVISION": [
        {"id":"BELCHONOKK","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"Jame","role":"指挥","age":27,"attrs":{"reaction":78,"preaim":77,"spray":77,"positioning":84,"utility":84,"movement":76,"entry":75,"clutch":84,"info":93,"trade":78,"comms":88,"composure":84,"stability":81,"focus":82},"value":300},
        {"id":"nota","role":"步枪手","age":20,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"xiELO","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"zweih","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273}
    ],
    "magic": [
        {"id":"AW","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"MaSvAl","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"mo0N","role":"狙击手","age":23,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":232},
        {"id":"sFade8","role":"指挥","age":21,"attrs":{"reaction":70,"preaim":69,"spray":69,"positioning":72,"utility":76,"movement":68,"entry":67,"clutch":73,"info":81,"trade":70,"comms":80,"composure":76,"stability":73,"focus":74},"value":224},
        {"id":"tenzy","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "paiN": [
        {"id":"biguzera","role":"指挥","age":27,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":273},
        {"id":"piriajr","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"saffee","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":240},
        {"id":"snow","role":"狙击手","age":21,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":260},
        {"id":"vsm","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191}
    ],
    "TYLOO": [
        {"id":"JamYoung","role":"步枪手","age":24,"attrs":{"reaction":81,"preaim":89,"spray":84,"positioning":81,"utility":78,"movement":79,"entry":85,"clutch":79,"info":79,"trade":82,"comms":77,"composure":79,"stability":79,"focus":79},"value":260},
        {"id":"Jee","role":"狙击手","age":21,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":260},
        {"id":"Mercury","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":150},
        {"id":"Moseyuh","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"Zero","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211}
    ],
    "FaZe": [
        {"id":"broky","role":"狙击手","age":25,"attrs":{"reaction":88,"preaim":89,"spray":81,"positioning":89,"utility":77,"movement":81,"entry":80,"clutch":87,"info":83,"trade":78,"comms":77,"composure":84,"stability":86,"focus":87},"value":380},
        {"id":"frozen","role":"步枪手","age":24,"attrs":{"reaction":85,"preaim":89,"spray":91,"positioning":88,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":90,"comms":81,"composure":83,"stability":83,"focus":83},"value":400},
        {"id":"jcobbb","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":240},
        {"id":"Neityu","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":240},
        {"id":"Twistzz","role":"步枪手","age":27,"attrs":{"reaction":85,"preaim":93,"spray":91,"positioning":85,"utility":82,"movement":83,"entry":86,"clutch":83,"info":83,"trade":89,"comms":81,"composure":83,"stability":83,"focus":83},"value":410}
    ],
    "M80": [
        {"id":"JBa","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":240},
        {"id":"Lake","role":"步枪手","age":20,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"s1n","role":"指挥","age":23,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":78,"movement":70,"entry":69,"clutch":75,"info":87,"trade":72,"comms":85,"composure":78,"stability":75,"focus":76},"value":240},
        {"id":"slaxz-","role":"步枪手","age":27,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"Swisher","role":"狙击手","age":22,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":250}
    ],
    "Inner Circle": [
        {"id":"cptkurtka023","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"Dawy","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"headtr1ck","role":"狙击手","age":23,"attrs":{"reaction":87,"preaim":89,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":300},
        {"id":"onic","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"zeRRoFIX","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "BIG": [
        {"id":"blameF","role":"指挥","age":30,"attrs":{"reaction":76,"preaim":72,"spray":75,"positioning":78,"utility":82,"movement":74,"entry":73,"clutch":79,"info":91,"trade":76,"comms":86,"composure":86,"stability":79,"focus":80},"value":250},
        {"id":"faveN","role":"步枪手","age":27,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":232},
        {"id":"gr1ks","role":"狙击手","age":25,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":232},
        {"id":"JDC","role":"步枪手","age":23,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"tabseN","role":"步枪手","age":31,"attrs":{"reaction":81,"preaim":85,"spray":84,"positioning":81,"utility":81,"movement":79,"entry":82,"clutch":79,"info":79,"trade":82,"comms":80,"composure":79,"stability":82,"focus":79},"value":250}
    ],
    "Alliance": [
        {"id":"avid","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"bobeksde","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"eraa","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"twist","role":"指挥","age":27,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":232},
        {"id":"upE","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191}
    ],
    "Ninjas in Pyjamas": [
        {"id":"cairne","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"sjuush","role":"步枪手","age":27,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"Snappi","role":"指挥","age":33,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":232},
        {"id":"stavn","role":"步枪手","age":24,"attrs":{"reaction":83,"preaim":87,"spray":86,"positioning":86,"utility":80,"movement":81,"entry":84,"clutch":84,"info":81,"trade":87,"comms":79,"composure":81,"stability":81,"focus":81},"value":350},
        {"id":"xKacpersky","role":"步枪手","age":20,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "Lynn Vision": [
        {"id":"C4LLM3SU3","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"EmiliaQAQ","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":111},
        {"id":"Starry","role":"狙击手","age":23,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":240},
        {"id":"Westmelon","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"z4KR","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "Wildcard": [
        {"id":"Cxzi","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"HexT","role":"步枪手","age":23,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273},
        {"id":"mhL","role":"步枪手","age":24,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"nEMANHA","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"reck","role":"指挥","age":24,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":78,"movement":70,"entry":69,"clutch":75,"info":83,"trade":72,"comms":82,"composure":78,"stability":75,"focus":76},"value":248}
    ],
    "Sharks": [
        {"id":"doc","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"gafolo","role":"步枪手","age":22,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"koala","role":"指挥","age":24,"attrs":{"reaction":70,"preaim":69,"spray":69,"positioning":72,"utility":76,"movement":68,"entry":67,"clutch":73,"info":81,"trade":70,"comms":80,"composure":76,"stability":73,"focus":74},"value":191},
        {"id":"maxxkor","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"rdnzao","role":"狙击手","age":22,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":248}
    ],
    "Nuclear TigeRES": [
        {"id":"ayuki","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"flouzer","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"m1QUSE","role":"步枪手","age":20,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"senka","role":"步枪手","age":22,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"z1k4","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191}
    ],
    "3DMAX": [
        {"id":"Ex3rcice","role":"步枪手","age":24,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"Graviti","role":"步枪手","age":29,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"Lucky","role":"指挥","age":27,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":78,"movement":70,"entry":69,"clutch":75,"info":83,"trade":72,"comms":82,"composure":78,"stability":75,"focus":76},"value":248},
        {"id":"Maka","role":"狙击手","age":24,"attrs":{"reaction":84,"preaim":89,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":85,"focus":83},"value":290},
        {"id":"misutaaa","role":"步枪手","age":27,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":273}
    ],
    "HOTU": [
        {"id":"dwushka","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":141},
        {"id":"frontales","role":"狙击手","age":23,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":211},
        {"id":"kade0","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"mizu","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"n0rb3r7","role":"步枪手","age":27,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211}
    ],
    "INFINITE": [
        {"id":"Blytz","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"Dytor","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"kreaz","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"mhN1","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"sl3nd","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172}
    ],
    "Nemesis": [
        {"id":"mag1k3Y","role":"指挥","age":22,"attrs":{"reaction":70,"preaim":69,"spray":69,"positioning":72,"utility":76,"movement":68,"entry":67,"clutch":73,"info":81,"trade":70,"comms":80,"composure":76,"stability":73,"focus":74},"value":123},
        {"id":"r3salt","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":87,"spray":85,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":250},
        {"id":"Sdaim","role":"步枪手","age":20,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"SELLTER","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"tex1y","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202}
    ],
    "TDK": [
        {"id":"ArtFr0st","role":"步枪手","age":23,"attrs":{"reaction":81,"preaim":85,"spray":84,"positioning":81,"utility":78,"movement":79,"entry":82,"clutch":79,"info":79,"trade":82,"comms":77,"composure":79,"stability":79,"focus":79},"value":254},
        {"id":"Ax1Le","role":"步枪手","age":26,"attrs":{"reaction":85,"preaim":93,"spray":92,"positioning":85,"utility":82,"movement":83,"entry":89,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":330},
        {"id":"nafany","role":"指挥","age":26,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":78,"movement":70,"entry":69,"clutch":75,"info":83,"trade":72,"comms":82,"composure":78,"stability":75,"focus":76},"value":248},
        {"id":"sugaR","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211},
        {"id":"Xant3r","role":"狙击手","age":22,"attrs":{"reaction":78,"preaim":79,"spray":71,"positioning":76,"utility":67,"movement":71,"entry":70,"clutch":74,"info":73,"trade":68,"comms":67,"composure":74,"stability":76,"focus":77},"value":123}
    ],
    "HEROIC": [
        {"id":"Chr1zN","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"nilo","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"susp","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"xfl0ud","role":"狙击手","age":23,"attrs":{"reaction":82,"preaim":83,"spray":75,"positioning":80,"utility":71,"movement":75,"entry":74,"clutch":78,"info":77,"trade":72,"comms":71,"composure":78,"stability":80,"focus":81},"value":232},
        {"id":"yxngstxr","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202}
    ],
    "Gentle Mates": [
        {"id":"alex","role":"指挥","age":30,"attrs":{"reaction":74,"preaim":73,"spray":73,"positioning":76,"utility":80,"movement":72,"entry":71,"clutch":77,"info":85,"trade":74,"comms":84,"composure":80,"stability":77,"focus":78},"value":273},
        {"id":"dav1g","role":"步枪手","age":26,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"MartinezSa","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"mopoz","role":"步枪手","age":23,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"sausol","role":"步枪手","age":21,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248}
    ],
    "Echo": [
        {"id":"Boye","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"IceBerg","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"leakz","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"NickyB","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"salazar","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":111}
    ],
    "EYEBALLERS": [
        {"id":"bobeksde","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"dex","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"JW","role":"狙击手","age":31,"attrs":{"reaction":84,"preaim":85,"spray":77,"positioning":82,"utility":73,"movement":77,"entry":76,"clutch":80,"info":79,"trade":74,"comms":73,"composure":80,"stability":82,"focus":83},"value":164},
        {"id":"maxster","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"Ro1f","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202}
    ],
    "100 Thieves": [
        {"id":"Ag1l","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"device","role":"狙击手","age":30,"attrs":{"reaction":90,"preaim":91,"spray":83,"positioning":92,"utility":79,"movement":83,"entry":82,"clutch":90,"info":85,"trade":80,"comms":79,"composure":86,"stability":91,"focus":89},"value":440},
        {"id":"poiii","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"rain","role":"步枪手","age":31,"attrs":{"reaction":83,"preaim":87,"spray":86,"positioning":83,"utility":80,"movement":84,"entry":88,"clutch":81,"info":81,"trade":84,"comms":79,"composure":84,"stability":81,"focus":81},"value":380},
        {"id":"sirah","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "Walczaki": [
        {"id":"bajmi","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"moonwalk","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"olimp","role":"狙击手","age":22,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":248},
        {"id":"SaMey","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":123},
        {"id":"sk1tt","role":"指挥","age":22,"attrs":{"reaction":70,"preaim":69,"spray":69,"positioning":72,"utility":76,"movement":68,"entry":67,"clutch":73,"info":81,"trade":70,"comms":80,"composure":76,"stability":73,"focus":74},"value":240}
    ],
    "Liquid": [
        {"id":"EliGE","role":"步枪手","age":28,"attrs":{"reaction":85,"preaim":92,"spray":92,"positioning":85,"utility":82,"movement":83,"entry":89,"clutch":83,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":400},
        {"id":"malbsMd","role":"突破手","age":24,"attrs":{"reaction":88,"preaim":86,"spray":85,"positioning":82,"utility":78,"movement":89,"entry":95,"clutch":79,"info":80,"trade":84,"comms":79,"composure":83,"stability":82,"focus":83},"value":400},
        {"id":"NAF","role":"步枪手","age":28,"attrs":{"reaction":85,"preaim":89,"spray":91,"positioning":89,"utility":82,"movement":83,"entry":86,"clutch":86,"info":83,"trade":86,"comms":81,"composure":83,"stability":83,"focus":83},"value":390},
        {"id":"siuhy","role":"指挥","age":24,"attrs":{"reaction":78,"preaim":77,"spray":77,"positioning":80,"utility":84,"movement":76,"entry":75,"clutch":81,"info":93,"trade":78,"comms":91,"composure":84,"stability":81,"focus":82},"value":380},
        {"id":"ultimate","role":"狙击手","age":22,"attrs":{"reaction":86,"preaim":87,"spray":79,"positioning":84,"utility":75,"movement":79,"entry":78,"clutch":82,"info":81,"trade":76,"comms":75,"composure":82,"stability":84,"focus":85},"value":370}
    ],
    "FOKUS": [
        {"id":"Banjo","role":"指挥","age":22,"attrs":{"reaction":70,"preaim":69,"spray":69,"positioning":72,"utility":76,"movement":68,"entry":67,"clutch":73,"info":81,"trade":70,"comms":80,"composure":76,"stability":73,"focus":74},"value":224},
        {"id":"Jorko","role":"狙击手","age":21,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":211},
        {"id":"Matheos","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"volt","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"ztr","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202}
    ],
    "Acend": [
        {"id":"h4rn","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"KalubeR","role":"步枪手","age":23,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"REDSTAR","role":"突破手","age":22,"attrs":{"reaction":78,"preaim":76,"spray":75,"positioning":72,"utility":68,"movement":76,"entry":81,"clutch":69,"info":70,"trade":74,"comms":69,"composure":73,"stability":72,"focus":73},"value":224},
        {"id":"Skrimo","role":"狙击手","age":22,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":248},
        {"id":"SPELLAN","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "K27": [
        {"id":"fame","role":"步枪手","age":24,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":250},
        {"id":"kashl1d","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"qw1nk1","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"X5G7V","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"xeedo","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202}
    ],
    "Virtus.pro": [
        {"id":"AquaRS","role":"步枪手","age":21,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":232},
        {"id":"b1st","role":"步枪手","age":23,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":248},
        {"id":"F0R3VER","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":157},
        {"id":"mir","role":"步枪手","age":27,"attrs":{"reaction":79,"preaim":83,"spray":82,"positioning":79,"utility":76,"movement":77,"entry":80,"clutch":77,"info":77,"trade":80,"comms":75,"composure":77,"stability":77,"focus":77},"value":250},
        {"id":"tO0RO","role":"步枪手","age":22,"attrs":{"reaction":77,"preaim":81,"spray":80,"positioning":77,"utility":74,"movement":75,"entry":78,"clutch":75,"info":75,"trade":78,"comms":73,"composure":75,"stability":75,"focus":75},"value":211}
    ],
    "JiJieHao": [
        {"id":"0SAMAS","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"Bibu","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":202},
        {"id":"CacaNito","role":"狙击手","age":24,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":240},
        {"id":"m1N1","role":"步枪手","age":21,"attrs":{"reaction":73,"preaim":77,"spray":76,"positioning":73,"utility":70,"movement":71,"entry":74,"clutch":71,"info":71,"trade":74,"comms":69,"composure":71,"stability":71,"focus":71},"value":172},
        {"id":"sinnopsyy","role":"步枪手","age":22,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191}
    ],
    "SINNERS": [
        {"id":"beastik","role":"步枪手","age":24,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224},
        {"id":"kisserek","role":"指挥","age":28,"attrs":{"reaction":72,"preaim":71,"spray":71,"positioning":74,"utility":78,"movement":70,"entry":69,"clutch":75,"info":83,"trade":72,"comms":82,"composure":78,"stability":75,"focus":76},"value":211},
        {"id":"MoDo","role":"步枪手","age":24,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":191},
        {"id":"SHOCK","role":"狙击手","age":24,"attrs":{"reaction":80,"preaim":81,"spray":73,"positioning":78,"utility":69,"movement":73,"entry":72,"clutch":76,"info":75,"trade":70,"comms":69,"composure":76,"stability":78,"focus":79},"value":240},
        {"id":"stressarN","role":"步枪手","age":21,"attrs":{"reaction":75,"preaim":79,"spray":78,"positioning":75,"utility":72,"movement":73,"entry":76,"clutch":73,"info":73,"trade":76,"comms":71,"composure":73,"stability":73,"focus":73},"value":224}
    ],
    "Quartz Union": [
        {"id":"Nyxen","role":"辅助","age":22,"attrs":{"reaction":51,"preaim":44,"spray":43,"positioning":47,"utility":50,"movement":41,"entry":48,"clutch":47,"info":51,"trade":49,"comms":51,"composure":40,"stability":46,"focus":45}},
        {"id":"kolt","role":"突破手","age":24,"attrs":{"reaction":46,"preaim":51,"spray":50,"positioning":58,"utility":49,"movement":50,"entry":49,"clutch":52,"info":51,"trade":48,"comms":51,"composure":40,"stability":58,"focus":54}},
        {"id":"VEXX","role":"指挥","age":19,"attrs":{"reaction":34,"preaim":31,"spray":42,"positioning":35,"utility":36,"movement":28,"entry":38,"clutch":34,"info":39,"trade":36,"comms":26,"composure":30,"stability":27,"focus":33}},
        {"id":"sable","role":"辅助","age":18,"attrs":{"reaction":35,"preaim":30,"spray":33,"positioning":45,"utility":32,"movement":34,"entry":35,"clutch":31,"info":37,"trade":35,"comms":32,"composure":30,"stability":34,"focus":30}},
        {"id":"qdru","role":"辅助","age":23,"attrs":{"reaction":70,"preaim":71,"spray":70,"positioning":68,"utility":66,"movement":67,"entry":75,"clutch":72,"info":60,"trade":76,"comms":59,"composure":72,"stability":58,"focus":62}}
    ],
    "Cobalt Peak": [
        {"id":"toro","role":"自由人","age":20,"attrs":{"reaction":44,"preaim":34,"spray":24,"positioning":33,"utility":28,"movement":29,"entry":30,"clutch":39,"info":33,"trade":30,"comms":30,"composure":37,"stability":25,"focus":41}},
        {"id":"Kavi","role":"狙击手","age":26,"attrs":{"reaction":56,"preaim":51,"spray":50,"positioning":51,"utility":48,"movement":46,"entry":54,"clutch":47,"info":40,"trade":56,"comms":49,"composure":42,"stability":46,"focus":44}},
        {"id":"plint","role":"自由人","age":21,"attrs":{"reaction":38,"preaim":44,"spray":37,"positioning":42,"utility":45,"movement":43,"entry":41,"clutch":42,"info":46,"trade":32,"comms":42,"composure":44,"stability":49,"focus":46}},
        {"id":"RUSTY","role":"辅助","age":25,"attrs":{"reaction":47,"preaim":56,"spray":45,"positioning":50,"utility":50,"movement":56,"entry":51,"clutch":55,"info":54,"trade":50,"comms":56,"composure":57,"stability":55,"focus":50}},
        {"id":"novex","role":"指挥","age":28,"attrs":{"reaction":54,"preaim":58,"spray":52,"positioning":63,"utility":58,"movement":55,"entry":59,"clutch":58,"info":63,"trade":52,"comms":54,"composure":55,"stability":63,"focus":50}}
    ],
    "Nova eSports": [
        {"id":"Kalypso","role":"步枪手","age":29,"attrs":{"reaction":68,"preaim":68,"spray":68,"positioning":77,"utility":71,"movement":65,"entry":73,"clutch":66,"info":68,"trade":68,"comms":66,"composure":63,"stability":76,"focus":65}},
        {"id":"zento","role":"指挥","age":18,"attrs":{"reaction":18,"preaim":31,"spray":30,"positioning":28,"utility":26,"movement":17,"entry":21,"clutch":26,"info":27,"trade":36,"comms":24,"composure":23,"stability":11,"focus":18}},
        {"id":"briv","role":"步枪手","age":23,"attrs":{"reaction":44,"preaim":48,"spray":51,"positioning":50,"utility":49,"movement":41,"entry":47,"clutch":47,"info":54,"trade":42,"comms":48,"composure":48,"stability":38,"focus":43}},
        {"id":"Ovis","role":"突破手","age":25,"attrs":{"reaction":55,"preaim":52,"spray":42,"positioning":56,"utility":48,"movement":58,"entry":52,"clutch":57,"info":49,"trade":45,"comms":39,"composure":57,"stability":62,"focus":55}},
        {"id":"maru","role":"突破手","age":17,"attrs":{"reaction":21,"preaim":21,"spray":25,"positioning":21,"utility":21,"movement":23,"entry":16,"clutch":19,"info":25,"trade":16,"comms":23,"composure":23,"stability":18,"focus":18}}
    ],
    "Vortex eSports": [
        {"id":"skaldi","role":"自由人","age":19,"attrs":{"reaction":27,"preaim":26,"spray":28,"positioning":29,"utility":36,"movement":28,"entry":19,"clutch":29,"info":33,"trade":31,"comms":25,"composure":37,"stability":27,"focus":31}},
        {"id":"Vyn","role":"指挥","age":20,"attrs":{"reaction":35,"preaim":35,"spray":34,"positioning":34,"utility":40,"movement":32,"entry":36,"clutch":33,"info":36,"trade":31,"comms":40,"composure":41,"stability":31,"focus":31}},
        {"id":"halfz","role":"自由人","age":23,"attrs":{"reaction":47,"preaim":49,"spray":53,"positioning":52,"utility":50,"movement":50,"entry":52,"clutch":52,"info":55,"trade":52,"comms":52,"composure":55,"stability":55,"focus":53}},
        {"id":"TROL","role":"狙击手","age":20,"attrs":{"reaction":42,"preaim":42,"spray":40,"positioning":49,"utility":48,"movement":51,"entry":40,"clutch":39,"info":53,"trade":41,"comms":49,"composure":46,"stability":39,"focus":50}},
        {"id":"pint0","role":"突破手","age":24,"attrs":{"reaction":49,"preaim":52,"spray":43,"positioning":47,"utility":41,"movement":44,"entry":43,"clutch":44,"info":40,"trade":43,"comms":47,"composure":45,"stability":45,"focus":48}}
    ],
    "Onyx Current": [
        {"id":"Ostra","role":"步枪手","age":23,"attrs":{"reaction":41,"preaim":46,"spray":47,"positioning":49,"utility":35,"movement":36,"entry":46,"clutch":36,"info":40,"trade":39,"comms":40,"composure":39,"stability":44,"focus":41}},
        {"id":"gvnn","role":"指挥","age":22,"attrs":{"reaction":47,"preaim":50,"spray":49,"positioning":54,"utility":46,"movement":48,"entry":50,"clutch":46,"info":38,"trade":45,"comms":46,"composure":49,"stability":48,"focus":37}},
        {"id":"kelv","role":"突破手","age":24,"attrs":{"reaction":51,"preaim":53,"spray":50,"positioning":55,"utility":48,"movement":47,"entry":46,"clutch":43,"info":53,"trade":56,"comms":52,"composure":64,"stability":50,"focus":45}},
        {"id":"Wisp","role":"步枪手","age":23,"attrs":{"reaction":33,"preaim":35,"spray":38,"positioning":49,"utility":45,"movement":42,"entry":37,"clutch":40,"info":41,"trade":38,"comms":42,"composure":32,"stability":38,"focus":36}},
        {"id":"drav","role":"辅助","age":28,"attrs":{"reaction":64,"preaim":61,"spray":58,"positioning":64,"utility":70,"movement":61,"entry":58,"clutch":64,"info":59,"trade":61,"comms":70,"composure":72,"stability":64,"focus":57}}
    ],
    "Forge Hawks": [
        {"id":"Soryn","role":"狙击手","age":22,"attrs":{"reaction":49,"preaim":55,"spray":50,"positioning":49,"utility":44,"movement":41,"entry":51,"clutch":55,"info":49,"trade":41,"comms":48,"composure":54,"stability":50,"focus":46}},
        {"id":"blek","role":"步枪手","age":17,"attrs":{"reaction":20,"preaim":20,"spray":23,"positioning":20,"utility":24,"movement":20,"entry":15,"clutch":25,"info":16,"trade":20,"comms":30,"composure":14,"stability":21,"focus":21}},
        {"id":"fenn","role":"突破手","age":22,"attrs":{"reaction":43,"preaim":50,"spray":46,"positioning":47,"utility":44,"movement":43,"entry":47,"clutch":46,"info":44,"trade":41,"comms":50,"composure":41,"stability":53,"focus":45}},
        {"id":"ULV","role":"自由人","age":24,"attrs":{"reaction":56,"preaim":59,"spray":53,"positioning":53,"utility":56,"movement":51,"entry":61,"clutch":54,"info":51,"trade":57,"comms":62,"composure":57,"stability":52,"focus":54}},
        {"id":"kyzo","role":"指挥","age":19,"attrs":{"reaction":29,"preaim":26,"spray":30,"positioning":35,"utility":34,"movement":20,"entry":30,"clutch":16,"info":39,"trade":29,"comms":35,"composure":32,"stability":23,"focus":29}}
    ],
    "Legion Foxes": [
        {"id":"Hesper","role":"辅助","age":23,"attrs":{"reaction":55,"preaim":62,"spray":50,"positioning":56,"utility":61,"movement":55,"entry":60,"clutch":62,"info":57,"trade":56,"comms":59,"composure":48,"stability":57,"focus":57}},
        {"id":"noki","role":"辅助","age":20,"attrs":{"reaction":38,"preaim":26,"spray":26,"positioning":25,"utility":27,"movement":21,"entry":19,"clutch":19,"info":23,"trade":21,"comms":23,"composure":26,"stability":25,"focus":22}},
        {"id":"vael","role":"突破手","age":27,"attrs":{"reaction":58,"preaim":65,"spray":64,"positioning":65,"utility":54,"movement":69,"entry":54,"clutch":63,"info":58,"trade":70,"comms":57,"composure":60,"stability":65,"focus":64}},
        {"id":"Ryn","role":"狙击手","age":26,"attrs":{"reaction":67,"preaim":67,"spray":64,"positioning":69,"utility":66,"movement":61,"entry":71,"clutch":66,"info":66,"trade":70,"comms":60,"composure":68,"stability":58,"focus":63}},
        {"id":"dolph","role":"辅助","age":20,"attrs":{"reaction":48,"preaim":38,"spray":32,"positioning":40,"utility":41,"movement":35,"entry":42,"clutch":43,"info":39,"trade":37,"comms":34,"composure":38,"stability":33,"focus":45}}
    ],
    "Lumen Current": [
        {"id":"Ardent","role":"突破手","age":17,"attrs":{"reaction":39,"preaim":43,"spray":41,"positioning":44,"utility":38,"movement":31,"entry":41,"clutch":45,"info":40,"trade":42,"comms":41,"composure":46,"stability":38,"focus":40}},
        {"id":"scept","role":"指挥","age":21,"attrs":{"reaction":31,"preaim":34,"spray":35,"positioning":31,"utility":37,"movement":42,"entry":36,"clutch":33,"info":28,"trade":32,"comms":43,"composure":36,"stability":28,"focus":31}},
        {"id":"lumi","role":"辅助","age":22,"attrs":{"reaction":31,"preaim":36,"spray":41,"positioning":43,"utility":29,"movement":43,"entry":33,"clutch":30,"info":26,"trade":34,"comms":35,"composure":34,"stability":35,"focus":34}},
        {"id":"Yara","role":"狙击手","age":18,"attrs":{"reaction":11,"preaim":10,"spray":7,"positioning":12,"utility":21,"movement":15,"entry":5,"clutch":12,"info":9,"trade":13,"comms":13,"composure":10,"stability":5,"focus":9}},
        {"id":"quill","role":"步枪手","age":24,"attrs":{"reaction":56,"preaim":55,"spray":53,"positioning":56,"utility":55,"movement":51,"entry":52,"clutch":60,"info":60,"trade":53,"comms":60,"composure":51,"stability":59,"focus":55}}
    ],
    "Saber Comets": [
        {"id":"Bevan","role":"步枪手","age":26,"attrs":{"reaction":59,"preaim":62,"spray":57,"positioning":55,"utility":63,"movement":53,"entry":60,"clutch":56,"info":51,"trade":51,"comms":49,"composure":62,"stability":53,"focus":55}},
        {"id":"torv","role":"辅助","age":20,"attrs":{"reaction":37,"preaim":50,"spray":35,"positioning":43,"utility":42,"movement":32,"entry":36,"clutch":39,"info":47,"trade":29,"comms":36,"composure":44,"stability":44,"focus":38}},
        {"id":"Niska","role":"指挥","age":17,"attrs":{"reaction":17,"preaim":17,"spray":14,"positioning":27,"utility":19,"movement":25,"entry":8,"clutch":21,"info":19,"trade":18,"comms":17,"composure":23,"stability":10,"focus":25}},
        {"id":"obel","role":"辅助","age":22,"attrs":{"reaction":49,"preaim":42,"spray":41,"positioning":47,"utility":48,"movement":36,"entry":46,"clutch":37,"info":41,"trade":46,"comms":52,"composure":46,"stability":35,"focus":43}},
        {"id":"vypr","role":"突破手","age":29,"attrs":{"reaction":59,"preaim":69,"spray":55,"positioning":56,"utility":62,"movement":67,"entry":64,"clutch":56,"info":58,"trade":47,"comms":68,"composure":61,"stability":54,"focus":55}}
    ],
    "Granite Lions": [
        {"id":"Kalder","role":"步枪手","age":29,"attrs":{"reaction":55,"preaim":52,"spray":58,"positioning":54,"utility":53,"movement":56,"entry":60,"clutch":47,"info":58,"trade":47,"comms":51,"composure":49,"stability":46,"focus":47}},
        {"id":"mensk","role":"指挥","age":20,"attrs":{"reaction":26,"preaim":26,"spray":32,"positioning":35,"utility":36,"movement":35,"entry":25,"clutch":31,"info":39,"trade":31,"comms":26,"composure":38,"stability":32,"focus":13}},
        {"id":"Roule","role":"步枪手","age":25,"attrs":{"reaction":45,"preaim":54,"spray":50,"positioning":48,"utility":57,"movement":44,"entry":50,"clutch":52,"info":52,"trade":46,"comms":48,"composure":50,"stability":50,"focus":42}},
        {"id":"ibex","role":"自由人","age":28,"attrs":{"reaction":52,"preaim":56,"spray":60,"positioning":60,"utility":57,"movement":57,"entry":53,"clutch":56,"info":62,"trade":58,"comms":59,"composure":52,"stability":59,"focus":49}},
        {"id":"zeph","role":"辅助","age":26,"attrs":{"reaction":60,"preaim":63,"spray":58,"positioning":62,"utility":59,"movement":66,"entry":50,"clutch":68,"info":60,"trade":55,"comms":63,"composure":64,"stability":54,"focus":47}}
    ],
    "Harbor Comets": [
        {"id":"Samko","role":"辅助","age":22,"attrs":{"reaction":50,"preaim":51,"spray":47,"positioning":46,"utility":45,"movement":48,"entry":40,"clutch":47,"info":50,"trade":41,"comms":44,"composure":48,"stability":52,"focus":49}},
        {"id":"Welkin","role":"狙击手","age":29,"attrs":{"reaction":54,"preaim":50,"spray":51,"positioning":50,"utility":50,"movement":50,"entry":58,"clutch":49,"info":50,"trade":50,"comms":56,"composure":45,"stability":44,"focus":47}},
        {"id":"dov","role":"步枪手","age":18,"attrs":{"reaction":44,"preaim":42,"spray":39,"positioning":43,"utility":40,"movement":53,"entry":49,"clutch":41,"info":40,"trade":45,"comms":40,"composure":42,"stability":51,"focus":34}},
        {"id":"pixl","role":"步枪手","age":22,"attrs":{"reaction":32,"preaim":42,"spray":47,"positioning":47,"utility":41,"movement":45,"entry":33,"clutch":32,"info":46,"trade":31,"comms":42,"composure":41,"stability":36,"focus":35}},
        {"id":"Rhaen","role":"突破手","age":18,"attrs":{"reaction":31,"preaim":32,"spray":31,"positioning":33,"utility":27,"movement":27,"entry":32,"clutch":36,"info":30,"trade":37,"comms":32,"composure":37,"stability":28,"focus":33}}
    ],
    "Surge Sharks": [
        {"id":"kast","role":"突破手","age":25,"attrs":{"reaction":59,"preaim":63,"spray":68,"positioning":68,"utility":65,"movement":60,"entry":63,"clutch":62,"info":67,"trade":68,"comms":63,"composure":62,"stability":65,"focus":57}},
        {"id":"Novi","role":"狙击手","age":29,"attrs":{"reaction":63,"preaim":61,"spray":57,"positioning":72,"utility":63,"movement":67,"entry":63,"clutch":53,"info":61,"trade":63,"comms":65,"composure":56,"stability":67,"focus":66}},
        {"id":"altz","role":"狙击手","age":24,"attrs":{"reaction":52,"preaim":53,"spray":55,"positioning":55,"utility":55,"movement":45,"entry":48,"clutch":51,"info":43,"trade":53,"comms":46,"composure":63,"stability":48,"focus":60}},
        {"id":"Bryn","role":"步枪手","age":20,"attrs":{"reaction":45,"preaim":47,"spray":44,"positioning":48,"utility":46,"movement":45,"entry":50,"clutch":45,"info":46,"trade":38,"comms":42,"composure":44,"stability":42,"focus":45}},
        {"id":"solen","role":"突破手","age":19,"attrs":{"reaction":41,"preaim":47,"spray":45,"positioning":45,"utility":51,"movement":53,"entry":41,"clutch":43,"info":42,"trade":51,"comms":43,"composure":37,"stability":51,"focus":40}}
    ],
    "Quasar Signal": [
        {"id":"Vireo","role":"辅助","age":25,"attrs":{"reaction":44,"preaim":41,"spray":40,"positioning":46,"utility":45,"movement":44,"entry":49,"clutch":46,"info":46,"trade":45,"comms":40,"composure":37,"stability":46,"focus":42}},
        {"id":"dumk","role":"突破手","age":18,"attrs":{"reaction":20,"preaim":25,"spray":26,"positioning":22,"utility":25,"movement":26,"entry":20,"clutch":19,"info":26,"trade":29,"comms":13,"composure":29,"stability":26,"focus":14}},
        {"id":"senta","role":"狙击手","age":20,"attrs":{"reaction":45,"preaim":44,"spray":44,"positioning":45,"utility":44,"movement":48,"entry":37,"clutch":43,"info":49,"trade":49,"comms":43,"composure":38,"stability":44,"focus":46}},
        {"id":"Lorne","role":"突破手","age":27,"attrs":{"reaction":53,"preaim":54,"spray":51,"positioning":52,"utility":53,"movement":40,"entry":48,"clutch":58,"info":56,"trade":49,"comms":51,"composure":48,"stability":54,"focus":51}},
        {"id":"pyx","role":"突破手","age":21,"attrs":{"reaction":51,"preaim":50,"spray":48,"positioning":46,"utility":47,"movement":44,"entry":54,"clutch":48,"info":39,"trade":40,"comms":53,"composure":50,"stability":45,"focus":50}}
    ],
    "Halcyon Bears": [
        {"id":"Amaru","role":"辅助","age":22,"attrs":{"reaction":47,"preaim":47,"spray":37,"positioning":42,"utility":49,"movement":38,"entry":48,"clutch":32,"info":46,"trade":36,"comms":35,"composure":38,"stability":44,"focus":47}},
        {"id":"skell","role":"辅助","age":21,"attrs":{"reaction":53,"preaim":43,"spray":42,"positioning":45,"utility":41,"movement":36,"entry":39,"clutch":34,"info":44,"trade":48,"comms":45,"composure":41,"stability":30,"focus":38}},
        {"id":"Tov","role":"突破手","age":18,"attrs":{"reaction":21,"preaim":23,"spray":23,"positioning":20,"utility":28,"movement":11,"entry":14,"clutch":25,"info":13,"trade":28,"comms":16,"composure":11,"stability":19,"focus":23}},
        {"id":"nemi","role":"狙击手","age":25,"attrs":{"reaction":59,"preaim":62,"spray":65,"positioning":61,"utility":60,"movement":56,"entry":59,"clutch":53,"info":65,"trade":48,"comms":66,"composure":63,"stability":60,"focus":61}},
        {"id":"gWen","role":"辅助","age":21,"attrs":{"reaction":44,"preaim":35,"spray":25,"positioning":41,"utility":34,"movement":41,"entry":33,"clutch":40,"info":33,"trade":31,"comms":40,"composure":29,"stability":38,"focus":27}}
    ],
    "Obsidian Comets": [
        {"id":"Corvin","role":"自由人","age":29,"attrs":{"reaction":58,"preaim":52,"spray":54,"positioning":49,"utility":51,"movement":48,"entry":44,"clutch":55,"info":49,"trade":40,"comms":53,"composure":54,"stability":54,"focus":47}},
        {"id":"blaz","role":"指挥","age":18,"attrs":{"reaction":9,"preaim":9,"spray":13,"positioning":18,"utility":27,"movement":18,"entry":13,"clutch":11,"info":20,"trade":14,"comms":33,"composure":22,"stability":19,"focus":14}},
        {"id":"Iskra","role":"辅助","age":23,"attrs":{"reaction":34,"preaim":27,"spray":34,"positioning":31,"utility":27,"movement":28,"entry":29,"clutch":32,"info":28,"trade":23,"comms":33,"composure":36,"stability":33,"focus":34}},
        {"id":"mont","role":"辅助","age":26,"attrs":{"reaction":59,"preaim":59,"spray":58,"positioning":55,"utility":60,"movement":60,"entry":56,"clutch":58,"info":58,"trade":54,"comms":66,"composure":43,"stability":59,"focus":67}},
        {"id":"ryx","role":"步枪手","age":22,"attrs":{"reaction":53,"preaim":59,"spray":53,"positioning":60,"utility":59,"movement":61,"entry":52,"clutch":51,"info":64,"trade":47,"comms":59,"composure":58,"stability":53,"focus":54}}
    ],
    "Nova Tigers": [
        {"id":"Fennir","role":"辅助","age":18,"attrs":{"reaction":13,"preaim":19,"spray":18,"positioning":16,"utility":25,"movement":25,"entry":14,"clutch":17,"info":18,"trade":24,"comms":21,"composure":17,"stability":15,"focus":21}},
        {"id":"klar","role":"自由人","age":21,"attrs":{"reaction":37,"preaim":38,"spray":38,"positioning":37,"utility":31,"movement":32,"entry":39,"clutch":27,"info":30,"trade":36,"comms":30,"composure":32,"stability":33,"focus":23}},
        {"id":"Ovid","role":"自由人","age":22,"attrs":{"reaction":51,"preaim":53,"spray":53,"positioning":48,"utility":49,"movement":53,"entry":56,"clutch":46,"info":43,"trade":48,"comms":55,"composure":56,"stability":42,"focus":44}},
        {"id":"sena","role":"自由人","age":22,"attrs":{"reaction":26,"preaim":27,"spray":27,"positioning":30,"utility":28,"movement":28,"entry":25,"clutch":28,"info":33,"trade":25,"comms":27,"composure":29,"stability":26,"focus":34}},
        {"id":"twix","role":"狙击手","age":22,"attrs":{"reaction":42,"preaim":45,"spray":45,"positioning":44,"utility":41,"movement":38,"entry":43,"clutch":50,"info":45,"trade":50,"comms":47,"composure":36,"stability":49,"focus":40}}
    ],
    "Arc eSports": [
        {"id":"Draven","role":"突破手","age":20,"attrs":{"reaction":33,"preaim":34,"spray":32,"positioning":33,"utility":35,"movement":27,"entry":32,"clutch":39,"info":31,"trade":38,"comms":32,"composure":30,"stability":31,"focus":29}},
        {"id":"kelp","role":"自由人","age":22,"attrs":{"reaction":42,"preaim":38,"spray":41,"positioning":44,"utility":43,"movement":43,"entry":32,"clutch":40,"info":38,"trade":35,"comms":49,"composure":40,"stability":27,"focus":42}},
        {"id":"moro","role":"指挥","age":22,"attrs":{"reaction":32,"preaim":35,"spray":36,"positioning":34,"utility":34,"movement":45,"entry":34,"clutch":40,"info":33,"trade":27,"comms":34,"composure":38,"stability":31,"focus":31}},
        {"id":"Ulla","role":"指挥","age":19,"attrs":{"reaction":35,"preaim":32,"spray":36,"positioning":36,"utility":35,"movement":43,"entry":40,"clutch":30,"info":40,"trade":36,"comms":35,"composure":33,"stability":38,"focus":31}},
        {"id":"zynt","role":"狙击手","age":26,"attrs":{"reaction":58,"preaim":61,"spray":58,"positioning":60,"utility":61,"movement":63,"entry":63,"clutch":66,"info":57,"trade":54,"comms":60,"composure":54,"stability":50,"focus":45}}
    ],
    "Summit Vipers": [
        {"id":"Renko","role":"狙击手","age":25,"attrs":{"reaction":56,"preaim":61,"spray":51,"positioning":58,"utility":57,"movement":52,"entry":55,"clutch":60,"info":62,"trade":57,"comms":55,"composure":54,"stability":58,"focus":57}},
        {"id":"pask","role":"步枪手","age":22,"attrs":{"reaction":50,"preaim":47,"spray":52,"positioning":50,"utility":49,"movement":58,"entry":42,"clutch":40,"info":54,"trade":51,"comms":49,"composure":49,"stability":41,"focus":40}},
        {"id":"Ilva","role":"自由人","age":24,"attrs":{"reaction":37,"preaim":40,"spray":45,"positioning":45,"utility":40,"movement":36,"entry":30,"clutch":36,"info":45,"trade":40,"comms":41,"composure":39,"stability":48,"focus":34}},
        {"id":"quob","role":"狙击手","age":24,"attrs":{"reaction":44,"preaim":47,"spray":39,"positioning":44,"utility":47,"movement":41,"entry":49,"clutch":38,"info":41,"trade":45,"comms":48,"composure":48,"stability":35,"focus":39}},
        {"id":"vyce","role":"辅助","age":19,"attrs":{"reaction":33,"preaim":27,"spray":36,"positioning":31,"utility":32,"movement":23,"entry":29,"clutch":31,"info":35,"trade":23,"comms":35,"composure":32,"stability":33,"focus":21}}
    ],
    "Pinnacle Lions": [
        {"id":"Sandro","role":"突破手","age":22,"attrs":{"reaction":43,"preaim":55,"spray":46,"positioning":48,"utility":47,"movement":36,"entry":45,"clutch":46,"info":49,"trade":50,"comms":48,"composure":44,"stability":56,"focus":48}},
        {"id":"mekt","role":"辅助","age":17,"attrs":{"reaction":23,"preaim":22,"spray":24,"positioning":17,"utility":16,"movement":26,"entry":24,"clutch":18,"info":15,"trade":12,"comms":17,"composure":14,"stability":14,"focus":15}},
        {"id":"Norr","role":"辅助","age":19,"attrs":{"reaction":20,"preaim":17,"spray":18,"positioning":28,"utility":27,"movement":22,"entry":21,"clutch":20,"info":32,"trade":21,"comms":29,"composure":28,"stability":25,"focus":23}},
        {"id":"yuko","role":"突破手","age":17,"attrs":{"reaction":17,"preaim":24,"spray":20,"positioning":26,"utility":12,"movement":23,"entry":19,"clutch":23,"info":16,"trade":25,"comms":17,"composure":17,"stability":16,"focus":24}},
        {"id":"blip","role":"指挥","age":20,"attrs":{"reaction":34,"preaim":28,"spray":39,"positioning":31,"utility":39,"movement":27,"entry":35,"clutch":33,"info":34,"trade":33,"comms":27,"composure":24,"stability":23,"focus":29}}
    ],
    "Jade Foxes": [
        {"id":"Weiming","role":"指挥","age":22,"attrs":{"reaction":38,"preaim":44,"spray":40,"positioning":40,"utility":34,"movement":40,"entry":37,"clutch":43,"info":39,"trade":38,"comms":36,"composure":45,"stability":40,"focus":35}},
        {"id":"Xiaohan","role":"辅助","age":26,"attrs":{"reaction":51,"preaim":54,"spray":55,"positioning":50,"utility":49,"movement":52,"entry":54,"clutch":55,"info":47,"trade":50,"comms":55,"composure":49,"stability":54,"focus":59}},
        {"id":"Zhikai","role":"自由人","age":18,"attrs":{"reaction":37,"preaim":31,"spray":31,"positioning":39,"utility":38,"movement":38,"entry":35,"clutch":36,"info":43,"trade":33,"comms":31,"composure":41,"stability":34,"focus":33}},
        {"id":"Ruoxi","role":"辅助","age":26,"attrs":{"reaction":43,"preaim":54,"spray":47,"positioning":54,"utility":49,"movement":49,"entry":44,"clutch":48,"info":48,"trade":53,"comms":50,"composure":49,"stability":51,"focus":51}},
        {"id":"Jiajun","role":"步枪手","age":17,"attrs":{"reaction":25,"preaim":27,"spray":35,"positioning":27,"utility":24,"movement":31,"entry":30,"clutch":25,"info":21,"trade":26,"comms":30,"composure":27,"stability":22,"focus":24}}
    ],
    "Summit Esports": [
        {"id":"Tanvir","role":"指挥","age":25,"attrs":{"reaction":54,"preaim":61,"spray":52,"positioning":57,"utility":59,"movement":47,"entry":49,"clutch":56,"info":55,"trade":51,"comms":58,"composure":59,"stability":56,"focus":58}},
        {"id":"ossa","role":"狙击手","age":28,"attrs":{"reaction":56,"preaim":57,"spray":58,"positioning":55,"utility":57,"movement":56,"entry":52,"clutch":50,"info":57,"trade":57,"comms":63,"composure":55,"stability":55,"focus":61}},
        {"id":"Lenz","role":"自由人","age":24,"attrs":{"reaction":57,"preaim":52,"spray":49,"positioning":60,"utility":54,"movement":46,"entry":46,"clutch":49,"info":59,"trade":54,"comms":46,"composure":51,"stability":45,"focus":49}},
        {"id":"piko","role":"突破手","age":22,"attrs":{"reaction":48,"preaim":45,"spray":44,"positioning":54,"utility":47,"movement":51,"entry":45,"clutch":44,"info":52,"trade":44,"comms":39,"composure":43,"stability":37,"focus":47}},
        {"id":"vayn","role":"步枪手","age":18,"attrs":{"reaction":48,"preaim":35,"spray":45,"positioning":40,"utility":40,"movement":40,"entry":39,"clutch":36,"info":40,"trade":31,"comms":46,"composure":44,"stability":42,"focus":34}}
    ],
    "Xenon Reborn": [
        {"id":"Radomir","role":"突破手","age":28,"attrs":{"reaction":63,"preaim":62,"spray":66,"positioning":58,"utility":61,"movement":59,"entry":60,"clutch":59,"info":62,"trade":59,"comms":64,"composure":58,"stability":55,"focus":64}},
        {"id":"kest","role":"狙击手","age":24,"attrs":{"reaction":43,"preaim":41,"spray":43,"positioning":37,"utility":37,"movement":36,"entry":37,"clutch":38,"info":32,"trade":38,"comms":41,"composure":43,"stability":39,"focus":35}},
        {"id":"uno","role":"自由人","age":29,"attrs":{"reaction":59,"preaim":57,"spray":59,"positioning":66,"utility":65,"movement":56,"entry":57,"clutch":59,"info":70,"trade":58,"comms":56,"composure":52,"stability":56,"focus":53}},
        {"id":"Fyra","role":"步枪手","age":22,"attrs":{"reaction":44,"preaim":51,"spray":50,"positioning":48,"utility":49,"movement":43,"entry":47,"clutch":50,"info":52,"trade":49,"comms":55,"composure":50,"stability":48,"focus":47}},
        {"id":"zolk","role":"步枪手","age":27,"attrs":{"reaction":59,"preaim":61,"spray":59,"positioning":67,"utility":70,"movement":56,"entry":64,"clutch":66,"info":71,"trade":65,"comms":61,"composure":71,"stability":61,"focus":62}}
    ],
    "Cobalt Esports": [
        {"id":"Miro","role":"狙击手","age":26,"attrs":{"reaction":42,"preaim":44,"spray":39,"positioning":43,"utility":37,"movement":36,"entry":46,"clutch":49,"info":40,"trade":40,"comms":41,"composure":40,"stability":40,"focus":41}},
        {"id":"tesl","role":"步枪手","age":28,"attrs":{"reaction":61,"preaim":56,"spray":59,"positioning":54,"utility":58,"movement":50,"entry":51,"clutch":50,"info":56,"trade":57,"comms":63,"composure":56,"stability":50,"focus":61}},
        {"id":"Havik","role":"狙击手","age":20,"attrs":{"reaction":34,"preaim":31,"spray":42,"positioning":31,"utility":38,"movement":38,"entry":29,"clutch":32,"info":35,"trade":35,"comms":29,"composure":29,"stability":28,"focus":31}},
        {"id":"nyra","role":"突破手","age":24,"attrs":{"reaction":38,"preaim":36,"spray":35,"positioning":36,"utility":44,"movement":35,"entry":33,"clutch":41,"info":38,"trade":41,"comms":43,"composure":42,"stability":38,"focus":42}},
        {"id":"dorn","role":"指挥","age":27,"attrs":{"reaction":57,"preaim":59,"spray":53,"positioning":63,"utility":57,"movement":56,"entry":62,"clutch":56,"info":61,"trade":59,"comms":57,"composure":61,"stability":64,"focus":59}}
    ],
    "Jade Tigers": [
        {"id":"Liwei","role":"突破手","age":21,"attrs":{"reaction":35,"preaim":36,"spray":36,"positioning":44,"utility":34,"movement":28,"entry":29,"clutch":41,"info":39,"trade":25,"comms":30,"composure":34,"stability":29,"focus":37}},
        {"id":"Haoran","role":"突破手","age":27,"attrs":{"reaction":49,"preaim":46,"spray":50,"positioning":46,"utility":45,"movement":43,"entry":47,"clutch":42,"info":42,"trade":46,"comms":51,"composure":45,"stability":53,"focus":54}},
        {"id":"Zixuan","role":"狙击手","age":18,"attrs":{"reaction":24,"preaim":30,"spray":27,"positioning":25,"utility":33,"movement":28,"entry":21,"clutch":22,"info":29,"trade":28,"comms":27,"composure":22,"stability":19,"focus":32}},
        {"id":"Yichen","role":"步枪手","age":27,"attrs":{"reaction":67,"preaim":64,"spray":71,"positioning":61,"utility":65,"movement":63,"entry":67,"clutch":65,"info":64,"trade":64,"comms":68,"composure":69,"stability":57,"focus":70}},
        {"id":"Mingze","role":"辅助","age":19,"attrs":{"reaction":37,"preaim":33,"spray":36,"positioning":36,"utility":35,"movement":37,"entry":34,"clutch":37,"info":40,"trade":29,"comms":37,"composure":32,"stability":34,"focus":32}}
    ],
    "Mirage Club": [
        {"id":"Sander","role":"自由人","age":25,"attrs":{"reaction":49,"preaim":52,"spray":49,"positioning":53,"utility":46,"movement":47,"entry":53,"clutch":57,"info":48,"trade":50,"comms":49,"composure":54,"stability":42,"focus":52}},
        {"id":"brod","role":"步枪手","age":28,"attrs":{"reaction":49,"preaim":47,"spray":41,"positioning":46,"utility":44,"movement":49,"entry":44,"clutch":52,"info":43,"trade":40,"comms":42,"composure":48,"stability":43,"focus":41}},
        {"id":"Kito","role":"步枪手","age":28,"attrs":{"reaction":63,"preaim":53,"spray":56,"positioning":57,"utility":58,"movement":60,"entry":56,"clutch":51,"info":58,"trade":58,"comms":64,"composure":48,"stability":58,"focus":53}},
        {"id":"vels","role":"步枪手","age":28,"attrs":{"reaction":65,"preaim":65,"spray":63,"positioning":57,"utility":66,"movement":53,"entry":58,"clutch":49,"info":57,"trade":50,"comms":55,"composure":54,"stability":53,"focus":73}},
        {"id":"Rohn","role":"指挥","age":19,"attrs":{"reaction":38,"preaim":39,"spray":48,"positioning":38,"utility":47,"movement":44,"entry":43,"clutch":34,"info":42,"trade":35,"comms":39,"composure":45,"stability":36,"focus":41}}
    ],
    "Legion Lions": [
        {"id":"Kazu","role":"狙击手","age":26,"attrs":{"reaction":43,"preaim":55,"spray":39,"positioning":49,"utility":53,"movement":52,"entry":48,"clutch":48,"info":47,"trade":43,"comms":52,"composure":57,"stability":57,"focus":50}},
        {"id":"mephi","role":"指挥","age":25,"attrs":{"reaction":37,"preaim":39,"spray":34,"positioning":39,"utility":38,"movement":32,"entry":26,"clutch":37,"info":43,"trade":40,"comms":34,"composure":32,"stability":28,"focus":38}},
        {"id":"lorn","role":"辅助","age":22,"attrs":{"reaction":36,"preaim":34,"spray":39,"positioning":40,"utility":39,"movement":33,"entry":41,"clutch":33,"info":44,"trade":34,"comms":40,"composure":40,"stability":40,"focus":41}},
        {"id":"Tyr","role":"辅助","age":24,"attrs":{"reaction":36,"preaim":42,"spray":47,"positioning":48,"utility":47,"movement":46,"entry":39,"clutch":44,"info":52,"trade":47,"comms":47,"composure":45,"stability":50,"focus":41}},
        {"id":"sellk","role":"突破手","age":18,"attrs":{"reaction":22,"preaim":18,"spray":21,"positioning":22,"utility":20,"movement":19,"entry":12,"clutch":20,"info":18,"trade":23,"comms":16,"composure":22,"stability":27,"focus":15}}
    ],
    "Zephyr Dragons": [
        {"id":"Zhaoyun","role":"自由人","age":28,"attrs":{"reaction":55,"preaim":57,"spray":51,"positioning":58,"utility":49,"movement":49,"entry":49,"clutch":53,"info":53,"trade":56,"comms":46,"composure":54,"stability":54,"focus":55}},
        {"id":"Wenbo","role":"自由人","age":19,"attrs":{"reaction":40,"preaim":38,"spray":37,"positioning":37,"utility":35,"movement":36,"entry":33,"clutch":25,"info":40,"trade":43,"comms":25,"composure":35,"stability":35,"focus":37}},
        {"id":"Kaiyu","role":"指挥","age":25,"attrs":{"reaction":47,"preaim":48,"spray":50,"positioning":50,"utility":49,"movement":45,"entry":45,"clutch":53,"info":54,"trade":44,"comms":43,"composure":53,"stability":49,"focus":42}},
        {"id":"Shun","role":"辅助","age":26,"attrs":{"reaction":47,"preaim":49,"spray":52,"positioning":52,"utility":52,"movement":53,"entry":50,"clutch":52,"info":52,"trade":44,"comms":53,"composure":43,"stability":46,"focus":45}},
        {"id":"Peilin","role":"自由人","age":19,"attrs":{"reaction":20,"preaim":26,"spray":21,"positioning":28,"utility":23,"movement":21,"entry":21,"clutch":16,"info":26,"trade":20,"comms":20,"composure":24,"stability":29,"focus":22}}
    ],
    "Vanguard Wolves": [
        {"id":"Ivar","role":"狙击手","age":28,"attrs":{"reaction":52,"preaim":55,"spray":41,"positioning":55,"utility":51,"movement":59,"entry":46,"clutch":60,"info":53,"trade":41,"comms":50,"composure":44,"stability":50,"focus":54}},
        {"id":"Thome","role":"自由人","age":20,"attrs":{"reaction":35,"preaim":38,"spray":34,"positioning":37,"utility":40,"movement":35,"entry":30,"clutch":43,"info":30,"trade":40,"comms":39,"composure":36,"stability":39,"focus":39}},
        {"id":"kesz","role":"指挥","age":21,"attrs":{"reaction":24,"preaim":36,"spray":31,"positioning":28,"utility":33,"movement":26,"entry":29,"clutch":30,"info":32,"trade":27,"comms":31,"composure":38,"stability":18,"focus":27}},
        {"id":"Ruly","role":"突破手","age":26,"attrs":{"reaction":66,"preaim":66,"spray":73,"positioning":74,"utility":68,"movement":66,"entry":63,"clutch":70,"info":73,"trade":64,"comms":69,"composure":68,"stability":63,"focus":74}},
        {"id":"vonn","role":"步枪手","age":22,"attrs":{"reaction":32,"preaim":40,"spray":37,"positioning":35,"utility":29,"movement":31,"entry":28,"clutch":40,"info":26,"trade":24,"comms":33,"composure":26,"stability":31,"focus":28}}
    ],
    "Warden Arc": [
        {"id":"Lukas","role":"突破手","age":25,"attrs":{"reaction":54,"preaim":54,"spray":43,"positioning":53,"utility":52,"movement":44,"entry":45,"clutch":48,"info":57,"trade":49,"comms":48,"composure":43,"stability":47,"focus":62}},
        {"id":"brik","role":"步枪手","age":24,"attrs":{"reaction":43,"preaim":52,"spray":43,"positioning":46,"utility":47,"movement":45,"entry":44,"clutch":46,"info":50,"trade":31,"comms":48,"composure":39,"stability":38,"focus":39}},
        {"id":"Osen","role":"辅助","age":27,"attrs":{"reaction":55,"preaim":61,"spray":60,"positioning":58,"utility":60,"movement":54,"entry":60,"clutch":61,"info":59,"trade":66,"comms":52,"composure":53,"stability":49,"focus":56}},
        {"id":"vyto","role":"狙击手","age":23,"attrs":{"reaction":47,"preaim":43,"spray":53,"positioning":52,"utility":45,"movement":41,"entry":45,"clutch":46,"info":32,"trade":48,"comms":50,"composure":43,"stability":45,"focus":45}},
        {"id":"Kral","role":"自由人","age":28,"attrs":{"reaction":55,"preaim":52,"spray":47,"positioning":52,"utility":44,"movement":50,"entry":60,"clutch":43,"info":48,"trade":53,"comms":49,"composure":46,"stability":49,"focus":55}}
    ],
    "Radiant Tigers": [
        {"id":"Bruno","role":"指挥","age":17,"attrs":{"reaction":24,"preaim":26,"spray":28,"positioning":25,"utility":29,"movement":23,"entry":29,"clutch":31,"info":22,"trade":21,"comms":25,"composure":27,"stability":18,"focus":26}},
        {"id":"kaio","role":"指挥","age":22,"attrs":{"reaction":38,"preaim":41,"spray":45,"positioning":41,"utility":45,"movement":34,"entry":36,"clutch":46,"info":45,"trade":44,"comms":42,"composure":32,"stability":42,"focus":46}},
        {"id":"Vito","role":"指挥","age":23,"attrs":{"reaction":62,"preaim":52,"spray":52,"positioning":57,"utility":44,"movement":43,"entry":48,"clutch":50,"info":47,"trade":50,"comms":49,"composure":45,"stability":49,"focus":48}},
        {"id":"rens","role":"辅助","age":27,"attrs":{"reaction":59,"preaim":49,"spray":45,"positioning":45,"utility":52,"movement":54,"entry":53,"clutch":47,"info":45,"trade":42,"comms":44,"composure":47,"stability":51,"focus":45}},
        {"id":"Tuca","role":"狙击手","age":25,"attrs":{"reaction":57,"preaim":58,"spray":53,"positioning":54,"utility":55,"movement":52,"entry":62,"clutch":50,"info":39,"trade":55,"comms":56,"composure":54,"stability":55,"focus":58}}
    ],
    "Mirage Summit": [
        {"id":"Dario","role":"辅助","age":17,"attrs":{"reaction":20,"preaim":19,"spray":6,"positioning":17,"utility":18,"movement":22,"entry":25,"clutch":18,"info":11,"trade":5,"comms":10,"composure":15,"stability":9,"focus":16}},
        {"id":"sepp","role":"步枪手","age":26,"attrs":{"reaction":47,"preaim":49,"spray":46,"positioning":48,"utility":42,"movement":49,"entry":52,"clutch":54,"info":47,"trade":41,"comms":44,"composure":45,"stability":50,"focus":48}},
        {"id":"Ilya","role":"辅助","age":24,"attrs":{"reaction":52,"preaim":49,"spray":46,"positioning":53,"utility":42,"movement":48,"entry":39,"clutch":49,"info":47,"trade":52,"comms":47,"composure":43,"stability":49,"focus":53}},
        {"id":"munk","role":"狙击手","age":25,"attrs":{"reaction":55,"preaim":57,"spray":52,"positioning":59,"utility":60,"movement":58,"entry":54,"clutch":62,"info":54,"trade":49,"comms":52,"composure":56,"stability":67,"focus":61}},
        {"id":"Ravi","role":"狙击手","age":17,"attrs":{"reaction":9,"preaim":10,"spray":8,"positioning":9,"utility":8,"movement":13,"entry":12,"clutch":7,"info":13,"trade":14,"comms":5,"composure":5,"stability":10,"focus":13}}
    ],
    "Jade Ravens": [
        {"id":"Junjie","role":"步枪手","age":25,"attrs":{"reaction":46,"preaim":40,"spray":41,"positioning":46,"utility":45,"movement":38,"entry":39,"clutch":38,"info":50,"trade":40,"comms":47,"composure":43,"stability":39,"focus":48}},
        {"id":"Weilin","role":"突破手","age":27,"attrs":{"reaction":59,"preaim":58,"spray":59,"positioning":63,"utility":61,"movement":59,"entry":64,"clutch":59,"info":64,"trade":54,"comms":55,"composure":60,"stability":56,"focus":56}},
        {"id":"Zhen","role":"狙击手","age":24,"attrs":{"reaction":51,"preaim":53,"spray":51,"positioning":53,"utility":56,"movement":54,"entry":41,"clutch":53,"info":43,"trade":50,"comms":39,"composure":51,"stability":52,"focus":39}},
        {"id":"Xiaoyu","role":"辅助","age":25,"attrs":{"reaction":53,"preaim":52,"spray":54,"positioning":51,"utility":56,"movement":50,"entry":48,"clutch":54,"info":53,"trade":48,"comms":42,"composure":51,"stability":52,"focus":46}},
        {"id":"Hao","role":"突破手","age":27,"attrs":{"reaction":57,"preaim":57,"spray":56,"positioning":65,"utility":55,"movement":56,"entry":52,"clutch":61,"info":44,"trade":58,"comms":56,"composure":61,"stability":60,"focus":65}}
    ],
    "Warden Club": [
        {"id":"Erik","role":"狙击手","age":26,"attrs":{"reaction":50,"preaim":46,"spray":53,"positioning":51,"utility":45,"movement":52,"entry":50,"clutch":45,"info":49,"trade":51,"comms":51,"composure":48,"stability":43,"focus":51}},
        {"id":"bons","role":"指挥","age":20,"attrs":{"reaction":32,"preaim":29,"spray":33,"positioning":43,"utility":29,"movement":27,"entry":37,"clutch":30,"info":26,"trade":33,"comms":35,"composure":28,"stability":31,"focus":35}},
        {"id":"Lior","role":"狙击手","age":26,"attrs":{"reaction":50,"preaim":48,"spray":41,"positioning":47,"utility":47,"movement":47,"entry":55,"clutch":42,"info":45,"trade":44,"comms":48,"composure":42,"stability":40,"focus":54}},
        {"id":"pyke","role":"辅助","age":23,"attrs":{"reaction":39,"preaim":37,"spray":32,"positioning":38,"utility":37,"movement":39,"entry":39,"clutch":42,"info":42,"trade":38,"comms":42,"composure":42,"stability":45,"focus":44}},
        {"id":"Vero","role":"步枪手","age":19,"attrs":{"reaction":31,"preaim":35,"spray":28,"positioning":33,"utility":30,"movement":34,"entry":28,"clutch":39,"info":27,"trade":24,"comms":28,"composure":31,"stability":28,"focus":37}}
    ],
    "Nova Crest": [
        {"id":"Adam","role":"指挥","age":21,"attrs":{"reaction":38,"preaim":35,"spray":28,"positioning":35,"utility":32,"movement":38,"entry":43,"clutch":31,"info":36,"trade":32,"comms":31,"composure":35,"stability":30,"focus":42}},
        {"id":"kels","role":"辅助","age":17,"attrs":{"reaction":28,"preaim":30,"spray":24,"positioning":28,"utility":27,"movement":36,"entry":19,"clutch":26,"info":32,"trade":23,"comms":16,"composure":23,"stability":20,"focus":36}},
        {"id":"Oryx","role":"辅助","age":24,"attrs":{"reaction":46,"preaim":46,"spray":47,"positioning":49,"utility":54,"movement":37,"entry":47,"clutch":48,"info":47,"trade":47,"comms":60,"composure":52,"stability":47,"focus":54}},
        {"id":"jyn","role":"自由人","age":20,"attrs":{"reaction":29,"preaim":32,"spray":27,"positioning":31,"utility":29,"movement":27,"entry":30,"clutch":37,"info":29,"trade":27,"comms":32,"composure":35,"stability":31,"focus":26}},
        {"id":"Sela","role":"自由人","age":27,"attrs":{"reaction":64,"preaim":60,"spray":66,"positioning":61,"utility":61,"movement":67,"entry":57,"clutch":55,"info":59,"trade":49,"comms":59,"composure":62,"stability":64,"focus":61}}
    ],
    "Granite Union": [
        {"id":"Marek","role":"突破手","age":25,"attrs":{"reaction":37,"preaim":38,"spray":45,"positioning":42,"utility":52,"movement":35,"entry":35,"clutch":31,"info":46,"trade":36,"comms":35,"composure":37,"stability":45,"focus":38}},
        {"id":"droz","role":"突破手","age":22,"attrs":{"reaction":42,"preaim":48,"spray":41,"positioning":34,"utility":41,"movement":34,"entry":41,"clutch":34,"info":36,"trade":39,"comms":40,"composure":34,"stability":37,"focus":29}},
        {"id":"Kiva","role":"指挥","age":26,"attrs":{"reaction":39,"preaim":45,"spray":53,"positioning":44,"utility":45,"movement":43,"entry":43,"clutch":46,"info":41,"trade":50,"comms":51,"composure":49,"stability":45,"focus":43}},
        {"id":"sunk","role":"突破手","age":23,"attrs":{"reaction":48,"preaim":51,"spray":48,"positioning":46,"utility":52,"movement":49,"entry":39,"clutch":43,"info":48,"trade":54,"comms":51,"composure":52,"stability":49,"focus":41}},
        {"id":"Rulf","role":"辅助","age":19,"attrs":{"reaction":26,"preaim":22,"spray":27,"positioning":18,"utility":17,"movement":19,"entry":18,"clutch":24,"info":15,"trade":9,"comms":22,"composure":22,"stability":19,"focus":21}}
    ],
    "Tempest Collective": [
        {"id":"Pablo","role":"辅助","age":24,"attrs":{"reaction":41,"preaim":45,"spray":44,"positioning":46,"utility":48,"movement":43,"entry":46,"clutch":42,"info":50,"trade":50,"comms":39,"composure":39,"stability":46,"focus":48}},
        {"id":"nito","role":"指挥","age":24,"attrs":{"reaction":48,"preaim":40,"spray":38,"positioning":40,"utility":42,"movement":46,"entry":38,"clutch":45,"info":39,"trade":42,"comms":44,"composure":47,"stability":46,"focus":42}},
        {"id":"Cesar","role":"步枪手","age":27,"attrs":{"reaction":54,"preaim":57,"spray":55,"positioning":52,"utility":52,"movement":59,"entry":59,"clutch":51,"info":56,"trade":56,"comms":56,"composure":59,"stability":48,"focus":57}},
        {"id":"diem","role":"辅助","age":19,"attrs":{"reaction":26,"preaim":22,"spray":21,"positioning":16,"utility":26,"movement":26,"entry":16,"clutch":21,"info":20,"trade":22,"comms":15,"composure":16,"stability":18,"focus":18}},
        {"id":"Vask","role":"辅助","age":25,"attrs":{"reaction":54,"preaim":54,"spray":53,"positioning":61,"utility":60,"movement":53,"entry":50,"clutch":54,"info":65,"trade":59,"comms":51,"composure":58,"stability":53,"focus":46}}
    ],
    "Kraken Summit": [
        {"id":"Osk","role":"步枪手","age":29,"attrs":{"reaction":51,"preaim":53,"spray":54,"positioning":54,"utility":50,"movement":57,"entry":49,"clutch":53,"info":52,"trade":56,"comms":45,"composure":46,"stability":57,"focus":51}},
        {"id":"brell","role":"步枪手","age":24,"attrs":{"reaction":39,"preaim":40,"spray":33,"positioning":41,"utility":39,"movement":34,"entry":41,"clutch":43,"info":41,"trade":38,"comms":31,"composure":36,"stability":38,"focus":38}},
        {"id":"Tane","role":"狙击手","age":23,"attrs":{"reaction":33,"preaim":44,"spray":30,"positioning":30,"utility":30,"movement":32,"entry":38,"clutch":29,"info":33,"trade":31,"comms":36,"composure":38,"stability":39,"focus":35}},
        {"id":"mura","role":"辅助","age":18,"attrs":{"reaction":33,"preaim":28,"spray":26,"positioning":27,"utility":22,"movement":31,"entry":24,"clutch":33,"info":27,"trade":32,"comms":23,"composure":27,"stability":28,"focus":24}},
        {"id":"pyra","role":"步枪手","age":21,"attrs":{"reaction":41,"preaim":37,"spray":36,"positioning":38,"utility":39,"movement":35,"entry":33,"clutch":37,"info":29,"trade":36,"comms":41,"composure":37,"stability":35,"focus":31}}
    ],
    "Obsidian Reborn": [
        {"id":"Denis","role":"突破手","age":18,"attrs":{"reaction":21,"preaim":20,"spray":27,"positioning":25,"utility":24,"movement":12,"entry":20,"clutch":15,"info":29,"trade":16,"comms":15,"composure":22,"stability":18,"focus":25}},
        {"id":"krav","role":"辅助","age":19,"attrs":{"reaction":23,"preaim":24,"spray":23,"positioning":21,"utility":25,"movement":31,"entry":23,"clutch":25,"info":23,"trade":29,"comms":30,"composure":30,"stability":24,"focus":22}},
        {"id":"Ilona","role":"指挥","age":18,"attrs":{"reaction":18,"preaim":21,"spray":17,"positioning":20,"utility":10,"movement":5,"entry":13,"clutch":26,"info":15,"trade":12,"comms":13,"composure":17,"stability":8,"focus":11}},
        {"id":"semp","role":"辅助","age":23,"attrs":{"reaction":59,"preaim":62,"spray":51,"positioning":61,"utility":64,"movement":48,"entry":51,"clutch":67,"info":52,"trade":57,"comms":58,"composure":56,"stability":56,"focus":49}},
        {"id":"Ruta","role":"指挥","age":19,"attrs":{"reaction":24,"preaim":16,"spray":30,"positioning":26,"utility":21,"movement":26,"entry":23,"clutch":17,"info":26,"trade":21,"comms":26,"composure":25,"stability":20,"focus":17}}
    ],
    "Ironclad Hawks": [
        {"id":"Viktor","role":"步枪手","age":18,"attrs":{"reaction":21,"preaim":19,"spray":20,"positioning":31,"utility":26,"movement":17,"entry":23,"clutch":18,"info":20,"trade":24,"comms":17,"composure":19,"stability":16,"focus":19}},
        {"id":"doxa","role":"辅助","age":18,"attrs":{"reaction":20,"preaim":14,"spray":12,"positioning":14,"utility":7,"movement":14,"entry":13,"clutch":8,"info":12,"trade":10,"comms":9,"composure":17,"stability":15,"focus":5}},
        {"id":"Nem","role":"突破手","age":22,"attrs":{"reaction":30,"preaim":31,"spray":30,"positioning":28,"utility":27,"movement":21,"entry":31,"clutch":24,"info":21,"trade":34,"comms":26,"composure":29,"stability":27,"focus":30}},
        {"id":"sura","role":"步枪手","age":19,"attrs":{"reaction":31,"preaim":28,"spray":31,"positioning":31,"utility":30,"movement":26,"entry":36,"clutch":20,"info":35,"trade":28,"comms":36,"composure":24,"stability":26,"focus":29}},
        {"id":"Klym","role":"指挥","age":23,"attrs":{"reaction":38,"preaim":46,"spray":45,"positioning":43,"utility":35,"movement":43,"entry":34,"clutch":37,"info":32,"trade":51,"comms":40,"composure":39,"stability":42,"focus":44}}
    ],
    "Mirage Esports": [
        {"id":"Rafael","role":"自由人","age":24,"attrs":{"reaction":42,"preaim":45,"spray":42,"positioning":44,"utility":39,"movement":50,"entry":45,"clutch":50,"info":40,"trade":41,"comms":36,"composure":46,"stability":49,"focus":41}},
        {"id":"bino","role":"步枪手","age":26,"attrs":{"reaction":59,"preaim":50,"spray":59,"positioning":57,"utility":56,"movement":57,"entry":55,"clutch":43,"info":60,"trade":55,"comms":37,"composure":50,"stability":47,"focus":52}},
        {"id":"Lais","role":"狙击手","age":28,"attrs":{"reaction":52,"preaim":43,"spray":46,"positioning":45,"utility":46,"movement":34,"entry":40,"clutch":46,"info":49,"trade":40,"comms":39,"composure":42,"stability":51,"focus":49}},
        {"id":"memo","role":"自由人","age":29,"attrs":{"reaction":51,"preaim":44,"spray":49,"positioning":54,"utility":54,"movement":54,"entry":51,"clutch":45,"info":58,"trade":49,"comms":45,"composure":48,"stability":51,"focus":47}},
        {"id":"Rui","role":"狙击手","age":25,"attrs":{"reaction":52,"preaim":45,"spray":39,"positioning":48,"utility":48,"movement":41,"entry":39,"clutch":47,"info":35,"trade":45,"comms":45,"composure":46,"stability":50,"focus":47}}
    ],
    "Surge Wolves": [
        {"id":"Nils","role":"狙击手","age":20,"attrs":{"reaction":22,"preaim":25,"spray":23,"positioning":33,"utility":30,"movement":31,"entry":22,"clutch":30,"info":35,"trade":29,"comms":24,"composure":23,"stability":32,"focus":22}},
        {"id":"galt","role":"狙击手","age":29,"attrs":{"reaction":56,"preaim":50,"spray":56,"positioning":49,"utility":55,"movement":48,"entry":44,"clutch":55,"info":45,"trade":44,"comms":49,"composure":47,"stability":48,"focus":46}},
        {"id":"Ovey","role":"指挥","age":18,"attrs":{"reaction":25,"preaim":22,"spray":23,"positioning":22,"utility":25,"movement":20,"entry":30,"clutch":21,"info":14,"trade":19,"comms":14,"composure":24,"stability":20,"focus":12}},
        {"id":"fras","role":"自由人","age":29,"attrs":{"reaction":50,"preaim":48,"spray":47,"positioning":47,"utility":50,"movement":45,"entry":55,"clutch":50,"info":45,"trade":53,"comms":45,"composure":41,"stability":45,"focus":51}},
        {"id":"kiba","role":"步枪手","age":26,"attrs":{"reaction":59,"preaim":65,"spray":52,"positioning":66,"utility":62,"movement":62,"entry":58,"clutch":62,"info":66,"trade":58,"comms":60,"composure":63,"stability":58,"focus":48}}
    ],
    "Halcyon Ravens": [
        {"id":"Mateo","role":"指挥","age":27,"attrs":{"reaction":48,"preaim":42,"spray":41,"positioning":52,"utility":42,"movement":48,"entry":43,"clutch":44,"info":40,"trade":47,"comms":46,"composure":41,"stability":41,"focus":43}},
        {"id":"ciro","role":"步枪手","age":19,"attrs":{"reaction":25,"preaim":32,"spray":29,"positioning":32,"utility":29,"movement":22,"entry":30,"clutch":23,"info":26,"trade":33,"comms":28,"composure":25,"stability":26,"focus":26}},
        {"id":"Vela","role":"自由人","age":23,"attrs":{"reaction":40,"preaim":40,"spray":42,"positioning":54,"utility":52,"movement":63,"entry":42,"clutch":42,"info":33,"trade":45,"comms":50,"composure":45,"stability":34,"focus":44}},
        {"id":"nand","role":"指挥","age":27,"attrs":{"reaction":48,"preaim":49,"spray":56,"positioning":50,"utility":47,"movement":58,"entry":42,"clutch":52,"info":47,"trade":54,"comms":52,"composure":55,"stability":49,"focus":51}},
        {"id":"ryke","role":"突破手","age":19,"attrs":{"reaction":17,"preaim":20,"spray":21,"positioning":19,"utility":15,"movement":23,"entry":11,"clutch":25,"info":14,"trade":24,"comms":15,"composure":22,"stability":14,"focus":11}}
    ],
    "Signal eSports": [
        {"id":"Yuki","role":"指挥","age":29,"attrs":{"reaction":59,"preaim":60,"spray":58,"positioning":63,"utility":55,"movement":50,"entry":56,"clutch":52,"info":60,"trade":50,"comms":60,"composure":57,"stability":54,"focus":51}},
        {"id":"sora","role":"自由人","age":17,"attrs":{"reaction":11,"preaim":15,"spray":22,"positioning":21,"utility":19,"movement":12,"entry":7,"clutch":12,"info":19,"trade":20,"comms":12,"composure":18,"stability":13,"focus":9}},
        {"id":"hach","role":"辅助","age":22,"attrs":{"reaction":36,"preaim":33,"spray":28,"positioning":33,"utility":26,"movement":31,"entry":41,"clutch":36,"info":29,"trade":25,"comms":28,"composure":36,"stability":25,"focus":34}},
        {"id":"Ren","role":"步枪手","age":23,"attrs":{"reaction":43,"preaim":49,"spray":45,"positioning":46,"utility":46,"movement":49,"entry":48,"clutch":44,"info":50,"trade":46,"comms":45,"composure":46,"stability":45,"focus":46}},
        {"id":"kaze","role":"自由人","age":19,"attrs":{"reaction":30,"preaim":27,"spray":32,"positioning":38,"utility":37,"movement":31,"entry":35,"clutch":22,"info":42,"trade":23,"comms":13,"composure":32,"stability":34,"focus":24}}
    ],
    "Tempest Esports": [
        {"id":"Oscar","role":"狙击手","age":26,"attrs":{"reaction":54,"preaim":53,"spray":57,"positioning":54,"utility":51,"movement":49,"entry":52,"clutch":58,"info":49,"trade":55,"comms":50,"composure":39,"stability":52,"focus":51}},
        {"id":"dun","role":"自由人","age":19,"attrs":{"reaction":27,"preaim":24,"spray":38,"positioning":20,"utility":31,"movement":31,"entry":22,"clutch":26,"info":22,"trade":22,"comms":33,"composure":28,"stability":25,"focus":24}},
        {"id":"Lery","role":"指挥","age":28,"attrs":{"reaction":57,"preaim":54,"spray":50,"positioning":54,"utility":49,"movement":52,"entry":62,"clutch":51,"info":54,"trade":49,"comms":47,"composure":46,"stability":50,"focus":55}},
        {"id":"vab","role":"步枪手","age":18,"attrs":{"reaction":28,"preaim":17,"spray":16,"positioning":29,"utility":24,"movement":30,"entry":23,"clutch":22,"info":29,"trade":21,"comms":17,"composure":22,"stability":23,"focus":19}},
        {"id":"silo","role":"狙击手","age":27,"attrs":{"reaction":54,"preaim":57,"spray":58,"positioning":61,"utility":57,"movement":62,"entry":55,"clutch":55,"info":54,"trade":56,"comms":58,"composure":55,"stability":64,"focus":62}}
    ],
    "Drift eSports": [
        {"id":"Petar","role":"辅助","age":24,"attrs":{"reaction":41,"preaim":42,"spray":38,"positioning":41,"utility":40,"movement":39,"entry":26,"clutch":36,"info":45,"trade":36,"comms":46,"composure":38,"stability":46,"focus":43}},
        {"id":"drov","role":"狙击手","age":28,"attrs":{"reaction":37,"preaim":42,"spray":41,"positioning":46,"utility":37,"movement":39,"entry":42,"clutch":42,"info":38,"trade":47,"comms":33,"composure":37,"stability":38,"focus":37}},
        {"id":"Kira","role":"辅助","age":18,"attrs":{"reaction":5,"preaim":13,"spray":7,"positioning":7,"utility":5,"movement":13,"entry":9,"clutch":5,"info":8,"trade":13,"comms":5,"composure":5,"stability":5,"focus":5}},
        {"id":"vyso","role":"指挥","age":20,"attrs":{"reaction":35,"preaim":35,"spray":41,"positioning":39,"utility":38,"movement":33,"entry":39,"clutch":31,"info":43,"trade":37,"comms":30,"composure":34,"stability":43,"focus":40}},
        {"id":"Ralk","role":"步枪手","age":25,"attrs":{"reaction":42,"preaim":45,"spray":45,"positioning":42,"utility":44,"movement":48,"entry":44,"clutch":44,"info":41,"trade":50,"comms":39,"composure":38,"stability":37,"focus":47}}
    ],
    "Tempest Forge": [
        {"id":"Andrei","role":"辅助","age":18,"attrs":{"reaction":8,"preaim":5,"spray":5,"positioning":5,"utility":13,"movement":5,"entry":5,"clutch":10,"info":5,"trade":10,"comms":5,"composure":5,"stability":5,"focus":8}},
        {"id":"burk","role":"指挥","age":27,"attrs":{"reaction":35,"preaim":40,"spray":34,"positioning":40,"utility":42,"movement":39,"entry":33,"clutch":41,"info":37,"trade":32,"comms":31,"composure":44,"stability":35,"focus":33}},
        {"id":"Tolia","role":"突破手","age":28,"attrs":{"reaction":45,"preaim":44,"spray":47,"positioning":41,"utility":46,"movement":50,"entry":43,"clutch":37,"info":44,"trade":49,"comms":51,"composure":42,"stability":30,"focus":40}},
        {"id":"sven","role":"指挥","age":19,"attrs":{"reaction":16,"preaim":24,"spray":23,"positioning":21,"utility":21,"movement":21,"entry":21,"clutch":19,"info":23,"trade":29,"comms":27,"composure":24,"stability":6,"focus":22}},
        {"id":"Ryz","role":"自由人","age":25,"attrs":{"reaction":62,"preaim":59,"spray":59,"positioning":62,"utility":69,"movement":62,"entry":53,"clutch":56,"info":61,"trade":58,"comms":59,"composure":63,"stability":61,"focus":62}}
    ],
    "Reborn Hawks": [
        {"id":"Jorge","role":"突破手","age":29,"attrs":{"reaction":68,"preaim":63,"spray":67,"positioning":66,"utility":65,"movement":56,"entry":57,"clutch":56,"info":70,"trade":61,"comms":61,"composure":56,"stability":59,"focus":58}},
        {"id":"kavo","role":"指挥","age":17,"attrs":{"reaction":20,"preaim":21,"spray":24,"positioning":29,"utility":24,"movement":19,"entry":20,"clutch":26,"info":29,"trade":25,"comms":14,"composure":21,"stability":15,"focus":16}},
        {"id":"Nia","role":"辅助","age":24,"attrs":{"reaction":46,"preaim":40,"spray":37,"positioning":43,"utility":42,"movement":37,"entry":36,"clutch":45,"info":40,"trade":39,"comms":37,"composure":39,"stability":39,"focus":40}},
        {"id":"rezn","role":"步枪手","age":22,"attrs":{"reaction":51,"preaim":52,"spray":46,"positioning":51,"utility":53,"movement":54,"entry":39,"clutch":51,"info":34,"trade":39,"comms":40,"composure":51,"stability":52,"focus":39}},
        {"id":"Toul","role":"辅助","age":28,"attrs":{"reaction":50,"preaim":52,"spray":54,"positioning":54,"utility":51,"movement":54,"entry":51,"clutch":56,"info":56,"trade":51,"comms":56,"composure":55,"stability":49,"focus":58}}
    ],
    "Surge eSports": [
        {"id":"Dev","role":"指挥","age":25,"attrs":{"reaction":36,"preaim":33,"spray":34,"positioning":32,"utility":37,"movement":44,"entry":40,"clutch":34,"info":31,"trade":34,"comms":36,"composure":32,"stability":28,"focus":30}},
        {"id":"krix","role":"辅助","age":29,"attrs":{"reaction":47,"preaim":52,"spray":57,"positioning":49,"utility":58,"movement":52,"entry":39,"clutch":53,"info":48,"trade":41,"comms":47,"composure":44,"stability":52,"focus":54}},
        {"id":"Ovyn","role":"步枪手","age":23,"attrs":{"reaction":26,"preaim":29,"spray":37,"positioning":32,"utility":36,"movement":29,"entry":27,"clutch":29,"info":36,"trade":32,"comms":29,"composure":29,"stability":41,"focus":32}},
        {"id":"hale","role":"步枪手","age":17,"attrs":{"reaction":18,"preaim":21,"spray":19,"positioning":21,"utility":19,"movement":23,"entry":14,"clutch":26,"info":24,"trade":17,"comms":20,"composure":29,"stability":20,"focus":24}},
        {"id":"Zur","role":"狙击手","age":22,"attrs":{"reaction":29,"preaim":34,"spray":36,"positioning":36,"utility":35,"movement":34,"entry":26,"clutch":33,"info":40,"trade":39,"comms":35,"composure":33,"stability":25,"focus":24}}
    ],
    "Yonder eSports": [
        {"id":"Simo","role":"狙击手","age":27,"attrs":{"reaction":35,"preaim":46,"spray":28,"positioning":35,"utility":43,"movement":49,"entry":35,"clutch":40,"info":39,"trade":33,"comms":42,"composure":51,"stability":40,"focus":37}},
        {"id":"brat","role":"步枪手","age":19,"attrs":{"reaction":18,"preaim":21,"spray":20,"positioning":17,"utility":20,"movement":13,"entry":23,"clutch":23,"info":6,"trade":11,"comms":14,"composure":19,"stability":17,"focus":22}},
        {"id":"Kiyo","role":"辅助","age":27,"attrs":{"reaction":50,"preaim":60,"spray":59,"positioning":56,"utility":50,"movement":50,"entry":53,"clutch":58,"info":51,"trade":51,"comms":53,"composure":55,"stability":58,"focus":53}},
        {"id":"vesk","role":"突破手","age":20,"attrs":{"reaction":28,"preaim":28,"spray":22,"positioning":20,"utility":22,"movement":24,"entry":24,"clutch":17,"info":24,"trade":25,"comms":23,"composure":19,"stability":31,"focus":24}},
        {"id":"Nord","role":"狙击手","age":25,"attrs":{"reaction":51,"preaim":56,"spray":51,"positioning":49,"utility":48,"movement":47,"entry":45,"clutch":50,"info":49,"trade":57,"comms":53,"composure":53,"stability":58,"focus":57}}
    ],
    "Pulse Sharks": [
        {"id":"Fer","role":"指挥","age":20,"attrs":{"reaction":26,"preaim":35,"spray":29,"positioning":30,"utility":29,"movement":28,"entry":29,"clutch":26,"info":34,"trade":31,"comms":29,"composure":26,"stability":24,"focus":18}},
        {"id":"dax","role":"辅助","age":22,"attrs":{"reaction":27,"preaim":18,"spray":23,"positioning":18,"utility":17,"movement":17,"entry":20,"clutch":22,"info":22,"trade":12,"comms":14,"composure":7,"stability":13,"focus":26}},
        {"id":"Yumi","role":"突破手","age":26,"attrs":{"reaction":52,"preaim":55,"spray":52,"positioning":57,"utility":53,"movement":56,"entry":48,"clutch":60,"info":55,"trade":53,"comms":54,"composure":65,"stability":52,"focus":59}},
        {"id":"orto","role":"狙击手","age":21,"attrs":{"reaction":25,"preaim":27,"spray":26,"positioning":24,"utility":18,"movement":18,"entry":25,"clutch":21,"info":21,"trade":32,"comms":17,"composure":18,"stability":27,"focus":26}},
        {"id":"Skaw","role":"辅助","age":29,"attrs":{"reaction":39,"preaim":40,"spray":42,"positioning":41,"utility":41,"movement":34,"entry":39,"clutch":44,"info":31,"trade":40,"comms":38,"composure":47,"stability":44,"focus":39}}
    ],
};
