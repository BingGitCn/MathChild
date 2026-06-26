/* ============================================================ * 算术练习本 · app.js * 题目生成 + 渲染 + 响应式缩放 + 抽屉交互 * ============================================================ */ (function () { "use strict";

// ---------- 数字范围上限 N（用户输入，默认 10） ----------
// 语义：所有数字和结果都不超过 N
//   10 → 10以内口算；20 → 20以内；100 → 100以内

// 横式列数：按 N 自适应（数字越长列越少，避免溢出）
function hColsByMax(maxN) {
  if (maxN <= 20) return 5;
  if (maxN <= 100) return 4;
  if (maxN <= 1000) return 4;
  return 3;
}

// 竖式固定 4列×4行=16题（宽松，留足列式书写空间）
const VERTICAL_PER_PAGE = 16;
const OPS = { add: "+", sub: "−", mul: "×", div: "÷" };

// ---------- 工具 ----------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---------- 生成单题（基于上限 maxN，结果不超过 maxN） ----------
function makeQuestion(type, maxN, opts) {
    let a, b, answer, remainder = 0;
    if (type === "add") {
        // a + b ≤ maxN
        a = rand(1, maxN - 1);
        b = rand(1, maxN - a);
        answer = a + b;
    } else if (type === "sub") {
        // a ≥ b，结果 ≥ 0
        a = rand(1, maxN);
        b = rand(1, a);
        if (a === b) a = Math.min(maxN, a + 1); // 尽量避免结果为 0
        answer = a - b;
    } else if (type === "mul") {
        // a × b ≤ maxN
        a = rand(1, maxN);
        b = a > 0 ? rand(1, Math.floor(maxN / a)) : 1;
        if (b < 1) b = 1;
        answer = a * b;
    } else {
        // 除法：结果（商）≤ maxN，被除数 ≤ maxN，保证 b≥2
        // 先定除数 b（≥2），商上限 = floor(maxN/b)
        b = rand(2, maxN);
        const qMax = Math.max(1, Math.floor(maxN / b));
        const q = rand(1, qMax);
        if (opts.allowRemainder) {
            const room = maxN - q * b;
            remainder = room > 0 ? rand(0, Math.min(room, b - 1)) : 0;
        }
        a = q * b + remainder;
        answer = q;
    }
    return { type, a, b, answer, remainder };
}

// 题目的唯一标识（用于去重）：同类型 + 同操作数 = 同一道题
function qKey(q) {
    return q.type + ":" + q.a + "," + q.b;
}

function generateAll(types, maxN, perPage, pages, opts) {
    const list = [];
    if (types.length === 0) return list;
    const total = perPage * pages;
    const seen = new Set();   // 已生成题目，避免重复
    let fail = 0;             // 连续去重失败计数，防止 maxN 太小时死循环
    while (list.length < total && fail < 200) {
        const q = makeQuestion(types[rand(0, types.length - 1)], maxN, opts);
        const k = qKey(q);
        if (seen.has(k)) { fail++; continue; }
        seen.add(k);
        list.push(q);
        fail = 0;
    }
    // 打乱
    for (let i = list.length - 1; i > 0; i--) {
        const j = rand(0, i);
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// 操作数对齐改用 CSS 固定宽度盒子（见 renderHorizontal 的 .opd），不再用空格补齐

// ---------- 渲染单题 ----------
// 答案始终渲染进 DOM，由 body.show-ans 控制显隐（避免打印时重渲染导致竞态）
function renderHorizontal(q, idx) {
    const sign = OPS[q.type];
    const ans = (q.type === "div" && q.remainder > 0) ? `${q.answer}…${q.remainder}` : `${q.answer}`;
    const delay = Math.min(idx * 0.006, 0.4);
    return `<div class="q-h" style="animation-delay:${delay}s"><span class="num">${idx}.</span><span class="opd">${q.a}</span><span class="sign">${sign}</span><span class="opd">${q.b}</span><span class="eq">=</span><span class="blank"><span class="ans-wrap">${ans}</span></span></div>`;
}

function renderVertical(q, idx) {
    const sign = OPS[q.type];
    const ans = (q.type === "div" && q.remainder > 0) ? `${q.answer} 余 ${q.remainder}` : `${q.answer}`;
    const delay = Math.min(idx * 0.02, 0.4);
    return `<div class="q-v" style="animation-delay:${delay}s"> <span class="num">${idx}.</span> <span class="op-col"><span class="op-sign">${sign}</span></span> <span class="digits"> <span class="row-r">${q.a}</span> <span class="row-r">${q.b}</span> <span class="line"></span><span class="ans-wrap">${ans}</span> </span> </div>`; 
} 

function renderPaper(questions, start, perPage, form, cols, showMeta, pageNo, totalPages) { 
    const slice = questions.slice(start, start + perPage); 
    const isVertical = form === "vertical"; 
    let items = ""; 
    slice.forEach((q, i) => { 
        items += isVertical ? renderVertical(q, start + i + 1) : renderHorizontal(q, start + i + 1);
    }); 
    const gridClass = isVertical ? "grid-vertical" : "grid-horizontal"; 
    const gridStyle = isVertical ? "" : ` style="grid-template-columns: repeat(${cols}, 1fr)"`; 
    let meta = ""; 
    if (showMeta) { 
        meta = `<div class="paper-header"> <span>姓名：<span class="underline-field">&nbsp;</span></span> <span>日期：<span class="underline-field">&nbsp;</span></span> <span>得分：<span class="underline-field">&nbsp;</span></span> </div>`; 
    }
    // 页脚批改栏：统计题数 + 三档建议用时（从容/标准/挑战）
    // 按小学生真实节奏：含读题+思考+手写数字
    //   横式口算：加减 12 秒/题，乘除 18 秒/题
    //   竖式手写：在横式基础上 ×2.5（要列竖式、算进退位，更慢）
    //   位数为 3 位以上再加成（多位数书写更费时）
    const qCount = slice.length;
    const digitsOf = (n) => String(n).length;
    const formFactor = isVertical ? 2.5 : 1;
    const baseSecs = slice.reduce((s, q) => {
        const base = (q.type === "mul" || q.type === "div") ? 18 : 12;
        const maxD = Math.max(digitsOf(q.a), digitsOf(q.b), digitsOf(q.answer));
        const digitExtra = maxD >= 3 ? (maxD - 2) * 4 : 0; // 3位以上每多1位+4秒
        return s + (base + digitExtra) * formFactor;
    }, 0);
    const toMin = (k) => Math.max(1, Math.round(baseSecs * k / 60));
    const footer = `<div class="paper-footer">本页 ${qCount} 题 · 用时参考：从容 ${toMin(1.6)} 分 / 标准 ${toMin(1.0)} 分 / 挑战 ${toMin(0.7)} 分</div>`;
    const title = isVertical ? "竖式计算练习" : "四则运算口算练习"; 
    return `<section class="paper"> ${meta} <div class="paper-title">${title}<br><span class="page-no">第 ${pageNo} / ${totalPages} 页</span></div> <div class="${gridClass}"${gridStyle}>${items}</div> ${footer} </section>`; 
} 

// ============================================================ // 状态 // ============================================================ 
const state = { questions: [], showAnswer: false, form: "horizontal", perPage: 80, cols: 5, pages: 1, showMeta: true }; 

// ============================================================ // 读取配置 // ============================================================ 
function readConfig() { 
    const types = Array.from(document.querySelectorAll(".op-chip.active")).map(el => el.dataset.op); 
    let maxN = parseInt(document.getElementById("maxNum").value, 10); 
    if (!maxN || maxN < 2) maxN = 10;   // 容错：无效值回退默认 10
    if (maxN > 99999) maxN = 99999;
    const form = document.querySelector("#formSeg .active").dataset.form; 
    const pages = parseInt(document.querySelector("#pagesSeg .active").dataset.pages, 10); 
    const rows = parseInt(document.getElementById("perPage").value, 10); 
    const opts = { noNegative: document.getElementById("noNegative").checked, allowRemainder: document.getElementById("allowRemainder").checked, }; 
    const showMeta = document.getElementById("showName").checked; 
    if (form === "vertical") { return { types, maxN, form, perPage: VERTICAL_PER_PAGE, cols: 4, pages, opts, showMeta }; } 
    const cols = hColsByMax(maxN); 
    return { types, maxN, form, perPage: cols * rows, cols, pages, opts, showMeta }; 
} 

// ============================================================ // 渲染 // ============================================================ 
function regenerate() { 
    const cfg = readConfig(); 
    if (cfg.types.length === 0) { flashTip("请至少选择一种运算类型"); return; } 
    state.questions = generateAll(cfg.types, cfg.maxN, cfg.perPage, cfg.pages, cfg.opts);
    state.form = cfg.form; state.perPage = cfg.perPage; state.cols = cfg.cols; state.pages = cfg.pages; state.showMeta = cfg.showMeta; 
    render(); 
    // 关闭抽屉（移动端） 
    closePanel(); 
    // 滚动到顶部 
    document.querySelector(".main").scrollIntoView({ behavior: "smooth", block: "start" }); 
} 

function render() { 
    const output = document.getElementById("output"); 
    enableActions(state.questions.length > 0); 
    if (state.questions.length === 0) { output.innerHTML = ""; return; }
    // 所有设备：A4 纸张整体缩放预览（手机缩小看大概，打印保持 A4 完整单页）
    const isMobile = window.matchMedia("(max-width: 1024px)").matches;
    let html = "";
    for (let p = 0; p < state.pages; p++) {
        const start = p * state.perPage;
        html += renderPaper(state.questions, start, state.perPage, state.form, state.cols, state.showMeta, p + 1, state.pages);
    }
    if (isMobile) {
        output.innerHTML = `<div class="paper-stage"><div class="paper-scaler">${html}</div></div>`;
    } else {
        output.innerHTML = html;
    }
    updateScale();
    applyAnswerClass();
}

// 答案显隐：只切换 body class，绝不重渲染（打印安全）
function applyAnswerClass() {
    document.body.classList.toggle("show-ans", state.showAnswer);
    updateAnswerBtn();
}

function enableActions(on) {
    document.getElementById("btnPrint").disabled = !on;
    document.getElementById("btnAnswer").disabled = !on;
} 

function updateAnswerBtn() { 
    const btn = document.getElementById("btnAnswer"); 
    const label = btn.querySelector(".label"); 
    if (label) label.textContent = state.showAnswer ? "隐藏" : "答案"; 
}

// ---------- A4 整体缩放预览（窄屏：缩小看大概；打印保持 A4 完整） ----------
// 结构：.paper-stage (定尺寸，参与文档流) > .paper-scaler (transform scale) > .paper
function updateScale() {
    const stage = document.querySelector(".paper-stage");
    if (!stage) return;
    const scaler = stage.querySelector(".paper-scaler");
    const papers = stage.querySelectorAll(".paper");
    if (!scaler || papers.length === 0) return;

    const PAPER_W = 794; // 210mm @96dpi
    const avail = window.innerWidth - 24;
    const scale = Math.min(1, avail / PAPER_W);

    scaler.style.transform = `scale(${scale})`;
    scaler.style.transformOrigin = "top center";
    scaler.style.width = PAPER_W + "px";

    // 多张纸：累加高度，外层 stage 占用缩放后的总高度
    let totalH = 0;
    papers.forEach(p => totalH += p.offsetHeight + 28); // 28 = margin-bottom
    stage.style.width = "100%";
    stage.style.height = (totalH * scale) + "px";
    stage.style.overflow = "hidden";
}

// ============================================================ // 抽屉（移动端设置面板） // ============================================================
function openPanel() { 
    const panel = document.getElementById("panel"); 
    const overlay = document.getElementById("overlay"); 
    panel.classList.add("open"); 
    panel.setAttribute("aria-hidden", "false"); 
    overlay.hidden = false; 
} 

function closePanel() { 
    const panel = document.getElementById("panel"); 
    const overlay = document.getElementById("overlay"); 
    panel.classList.remove("open"); 
    panel.setAttribute("aria-hidden", "true"); 
    overlay.hidden = true; 
} 

// ---------- 轻提示 ---------- 
let tipTimer; 
function flashTip(msg) { 
    let tip = document.getElementById("flashTip"); 
    if (!tip) { 
        tip = document.createElement("div"); 
        tip.id = "flashTip"; 
        tip.style.cssText = "position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#c8324c;color:#fff;padding:10px 20px;border-radius:10px;z-index:200;font-size:14px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.3)"; 
        document.body.appendChild(tip); 
    } 
    tip.textContent = msg; tip.style.opacity = "1"; 
    clearTimeout(tipTimer); 
    tipTimer = setTimeout(() => { tip.style.opacity = "0"; }, 2000); 
} 

// ============================================================ // 交互绑定 // ============================================================ 
function bindUI() { 
    // 运算 chips 
    document.getElementById("opChips").addEventListener("click", e => { 
        const chip = e.target.closest(".op-chip"); 
        if (!chip) return; 
        chip.classList.toggle("active"); 
    }); 

    // 数字范围快捷按钮 + 输入联动
    const maxInput = document.getElementById("maxNum");
    document.querySelector(".quick-btns").addEventListener("click", e => {
        const btn = e.target.closest(".quick-btn");
        if (!btn) return;
        maxInput.value = btn.dataset.val;
        updateRowsMeta();
    });
    maxInput.addEventListener("input", updateRowsMeta);

    // 分段控件通用
    document.querySelectorAll(".seg").forEach(seg => { 
        seg.addEventListener("click", e => { 
            const btn = e.target.closest(".seg-btn"); 
            if (!btn) return; 
            seg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active")); 
            btn.classList.add("active"); 
        }); 
    }); 
    // 行数 slider 联动 meta 
    const slider = document.getElementById("perPage"); 
    slider.addEventListener("input", updateRowsMeta); 
    // 生成 
    document.getElementById("generate").addEventListener("click", regenerate); 
    // 答案切换：只切 class，不重渲染（手机端打印安全）
    document.getElementById("btnAnswer").addEventListener("click", () => {
        if (!state.questions.length) return;
        state.showAnswer = !state.showAnswer;
        applyAnswerClass();
    });
    // 打印（想打印答案版，先点"显示答案"再点打印即可）
    document.getElementById("btnPrint").addEventListener("click", () => {
        if (!state.questions.length) { flashTip("请先生成题目"); return; }
        window.print();
    });
    // 抽屉
    document.getElementById("btnMenu").addEventListener("click", openPanel);
    document.getElementById("panelClose").addEventListener("click", closePanel);
    document.getElementById("overlay").addEventListener("click", closePanel);
    // 窗口尺寸变化 → 重新渲染（切换 paper-stage 包裹）+ 重算缩放 
    let resizeTimer; 
    window.addEventListener("resize", () => { 
        clearTimeout(resizeTimer); 
        resizeTimer = setTimeout(() => { 
            if (state.questions.length) render(); 
            else updateScale(); 
        }, 150); 
    }); 
} 

function updateRowsMeta() { 
    const maxN = parseInt(document.getElementById("maxNum").value, 10) || 10; 
    const form = document.querySelector("#formSeg .active").dataset.form; 
    const rows = parseInt(document.getElementById("perPage").value, 10); 
    const meta = document.getElementById("rowsMeta"); 
    if (form === "vertical") { meta.textContent = "＝ 竖式固定"; } 
    else { meta.textContent = `＝ ${hColsByMax(maxN) * rows} 题`; } 
} 

// 初始化：直接生成一卷，无需空状态 
bindUI(); updateRowsMeta(); 
// 支持 ?preview=vertical 直接出竖式（便于测试/截图） 
const pv = new URLSearchParams(location.search).get("preview"); 
if (pv === "vertical") { 
    document.querySelector('#formSeg [data-form="vertical"]').classList.add("active"); 
    document.querySelector('#formSeg [data-form="horizontal"]').classList.remove("active"); 
} 
regenerate(); 
})();
