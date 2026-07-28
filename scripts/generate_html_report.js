/**
 * 生成TOP5顺德公告分析HTML报告 V2
 * - 白色底 + 深蓝/靛蓝专业配色（无灰色）
 * - TOP5事件
 * - 时间线
 * - 仅显示四分类+子阶段标签
 */
const fs = require('fs');
const path = require('path');

const scoredPath = path.join(__dirname, '..', 'data', 'reports', 'scored_events.json');
const baselinePath = path.join(__dirname, '..', 'data', 'broker_baseline.json');
const events = JSON.parse(fs.readFileSync(scoredPath, 'utf-8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

// TOP5 公司去重
const usedCompanies = new Set();
const top5 = [];
for (const ev of events) {
  if (top5.length >= 5) break;
  if (usedCompanies.has(ev.companyName)) continue;
  usedCompanies.add(ev.companyName);
  top5.push(ev);
}

function fmtWan(val) {
  if (!val || val === 0) return '\u2014';
  if (val >= 10000) return (val / 10000).toFixed(2) + ' \u4ebf\u5143';
  return val.toFixed(0) + ' \u4e07\u5143';
}

function typeTagClass(type) {
  return { '\u80a1\u6743\u6fc0\u52b1': 'tag-blue',
    '\u5458\u5de5\u6301\u80a1': 'tag-amber',
    '\u80a1\u4efd\u56de\u8d2d': 'tag-emerald',
    '\u59d4\u6258\u7406\u8d22': 'tag-rose' }[type] || 'tag-slate';
}

function typeIcon(type) {
  return { '\u80a1\u6743\u6fc0\u52b1': '\ud83d\udcc8',
    '\u5458\u5de5\u6301\u80a1': '\ud83d\udc65',
    '\u80a1\u4efd\u56de\u8d2d': '\ud83d\udd04',
    '\u59d4\u6258\u7406\u8d22': '\ud83d\udcb0' }[type] || '\ud83d\udccb';
}

function stageProgress(stage) {
  const stages = ['\u9996\u6b21\u8349\u6848', '\u6388\u4e88\u5b9e\u65bd', '\u4fee\u8ba2/\u8c03\u6574', '\u89e3\u9501/\u884c\u6743/\u5f52\u5c5e'];
  const idx = stages.indexOf(stage);
  if (idx >= 0) return Math.min((idx + 1) / stages.length * 100, 100);
  const subMap = { '\u65b9\u6848\u53d1\u5e03': 25, '\u9996\u6b21\u8349\u6848': 25, '\u5b9e\u65bd\u9636\u6bb5': 40, '\u8fdb\u5c55': 50, '\u8fdb\u884c\u4e2d': 50, '\u5b8c\u6210': 100 };
  return subMap[stage] || 50;
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtML(s) { if(!s)return''; return esc(s).replace(/\n/g,'<br>').replace(/  \u00b7 /g,'&nbsp;&nbsp;\u00b7 '); }

// Timeline
const timelineEv = [...top5].sort((a,b) => a.latestDate.localeCompare(b.latestDate));

function renderCard(ev, rank) {
  const rankLabel = ['\ud83e\udd47','\ud83e\udd48','\ud83e\udd49','4\ufe0f\u20e3','5\ufe0f\u20e3'][rank];
  return `
    <div class="card card-rank-${rank+1}">
      <div class="card-hdr">
        <div class="card-icon">${rankLabel}</div>
        <div class="card-co">
          <h2>${esc(ev.companyName)} <span class="co-code">${esc(ev.companyCode||'')}</span></h2>
          <div class="card-tags">
            <span class="ttag ${typeTagClass(ev.type)}">${typeIcon(ev.type)} ${esc(ev.type)}</span>
            <span class="stag">${esc(ev.stage)}</span>
          </div>
        </div>
        <div class="card-sc">
          <div class="sc-num">${ev.totalScore.toFixed(2)}</div>
        </div>
      </div>
      <div class="card-bd">
        <div class="igrid">
          <div class="ii"><span class="il">\u8ba1\u5212\u540d\u79f0</span><span class="iv">${esc(ev.planName)}</span></div>
          <div class="ii"><span class="il">\u516c\u544a\u6570\u91cf</span><span class="iv">${ev.annCount} \u4efd</span></div>
          <div class="ii"><span class="il">\u91d1\u989d\u89c4\u6a21</span><span class="iv amt">${fmtWan(ev.amountWan)}</span></div>
          <div class="ii"><span class="il">\u516c\u53f8\u5e02\u503c</span><span class="iv">${ev.marketCap?ev.marketCap.toFixed(1)+' \u4ebf\u5143':'\u2014'}</span></div>
          <div class="ii"><span class="il">\u4fdd\u8350\u5238\u5546</span><span class="iv">${esc(ev.broker||'\u2014')}</span></div>
          <div class="ii"><span class="il">\u534e\u6cf0\u5df2\u6709\u4e1a\u52a1</span><span class="iv">${esc(ev.bizDone||'\u6682\u65e0')}</span></div>
          <div class="ii full"><span class="il">\u516c\u544a\u65f6\u95f4\u533a\u95f4</span><span class="iv">${ev.earliestDate} \u2192 ${ev.latestDate}</span></div>
        </div>
        <div class="prog-bar"><div class="prog-fill" style="width:${stageProgress(ev.stage)}%"></div></div>
        <div class="prog-lbl">\u4e8b\u4ef6\u8fdb\u7a0b\uff1a${esc(ev.stage)}</div>
        <div class="sec"><h3>\ud83d\udccb \u4e8b\u4ef6\u80cc\u666f</h3><p>${fmtML(ev.background)}</p></div>
        <div class="sec"><h3>\u26a1 \u5173\u952e\u52a8\u4f5c</h3><p>${fmtML(ev.action)}</p></div>
        <div class="ag">
          <div class="sec"><h3>\ud83c\udfaf \u6d89\u53ca\u5bf9\u8c61</h3><p>${fmtML(ev.objects)}</p></div>
          <div class="sec"><h3>\ud83d\udcb5 \u91d1\u989d\u89c4\u6a21</h3><p>${fmtML(ev.amount)}</p></div>
        </div>
        <div class="sec"><h3>\ud83d\udcc5 \u65f6\u95f4\u8282\u70b9</h3><p>${fmtML(ev.timeline)}</p></div>
        <div class="sec"><h3>\ud83e\udd1d \u5408\u4f5c\u65b9\u4fe1\u606f</h3><p>${fmtML(ev.partners)}</p></div>
        <div class="sec rec-box"><h3>\ud83d\udca1 \u534e\u6cf0\u8bc1\u5238\u5408\u4f5c\u673a\u4f1a\u63a8\u8350</h3><p>${fmtML(ev.recommendation)}</p></div>
      </div>
    </div>`;
}

function renderTimeline() {
  if (timelineEv.length === 0) return '';
  const items = timelineEv.map((ev,i) => {
    const left = i%2===0;
    return `<div class="tl-it ${left?'tl-l':'tl-r'}"><div class="tl-ct">
      <div class="tl-dt">${ev.latestDate}</div>
      <div class="tl-co">${esc(ev.companyName)}</div>
      <div class="tl-pl">${esc(ev.planName)}</div>
      <div class="tl-tg"><span class="ttag ${typeTagClass(ev.type)}">${esc(ev.type)}</span><span class="stag">${esc(ev.stage)}</span></div>
    </div></div>`;
  }).join('');
  return `
    <div class="sttl"><h2>\ud83d\udcc5 \u4e8b\u4ef6\u65f6\u95f4\u7ebf</h2><p class="subt">TOP5 \u5408\u4f5c\u673a\u4f1a\u4e8b\u4ef6\u4e00\u89c8 \u00b7 \u6309\u6700\u65b0\u516c\u544a\u65e5\u671f\u6392\u5e8f</p></div>
    <div class="tl">${items}</div>`;
}

function renderSummary() {
  const tc = {}; for(const ev of top5) tc[ev.type]=(tc[ev.type]||0)+1;
  const total = top5.reduce((s,ev)=>s+(ev.amountWan||0),0);
  const avg = top5.reduce((s,ev)=>s+ev.totalScore,0)/top5.length;
  return `
    <div class="sttl"><h2>\ud83d\udcca TOP5 \u6982\u89c8</h2><p class="subt">\u6309\u7efc\u5408\u8bc4\u5206\u6392\u5e8f\u7684\u4e94\u5927\u5408\u4f5c\u673a\u4f1a \u00b7 \u8986\u76d6 ${Object.keys(tc).length} \u7c7b\u516c\u544a\u7c7b\u578b</p></div>
    <div class="sg">
      <div class="si"><div class="sn">${top5.length}</div><div class="sl">TOP\u4e8b\u4ef6</div></div>
      <div class="si"><div class="sn">${fmtWan(total)}</div><div class="sl">\u6d89\u53ca\u603b\u91d1\u989d</div></div>
      <div class="si"><div class="sn">${avg.toFixed(2)}</div><div class="sl">\u5e73\u5747\u8bc4\u5206</div></div>
      <div class="si"><div class="sn">${Object.keys(tc).length}</div><div class="sl">\u516c\u544a\u7c7b\u578b</div></div>
    </div>`;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u987a\u5fb7\u4e0a\u5e02\u516c\u53f8\u516c\u544a\u667a\u80fd\u76d1\u6d4b \u2014 TOP5\u5408\u4f5c\u673a\u4f1a\u5206\u6790\u62a5\u544a</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#1e293b;line-height:1.7;-webkit-font-smoothing:antialiased}
.c{max-width:1100px;margin:0 auto;padding:0 24px}

/* Header */
.rh{padding:52px 0 36px;background:#fff;border-bottom:2px solid #1e3a5f}
.rh .c{text-align:center}
.rh .badge{display:inline-block;background:#1e3a5f;color:#fff;font-size:12px;font-weight:600;letter-spacing:1px;padding:6px 16px;border-radius:4px;margin-bottom:18px}
.rh h1{font-size:30px;font-weight:700;color:#0f172a;margin-bottom:8px}
.rh .subt{font-size:15px;color:#64748b;font-weight:400}
.rh .mr{margin-top:20px;display:flex;justify-content:center;gap:32px;font-size:13px;color:#94a3b8}

/* Section titles */
.sttl{padding:44px 0 20px;text-align:center}
.sttl h2{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:6px}
.sttl .subt{font-size:14px;color:#94a3b8}

/* Summary */
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:48px}
.si{background:#f0f4ff;border:1px solid #cbd5e1;border-radius:10px;padding:24px 16px;text-align:center}
.sn{font-size:28px;font-weight:700;color:#1e3a5f;margin-bottom:4px}
.sl{font-size:13px;color:#475569;font-weight:500}

/* Cards */
.card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;margin-bottom:32px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);transition:box-shadow .2s}
.card:hover{box-shadow:0 6px 24px rgba(30,58,95,0.1)}
.card-rank-1{border-left:5px solid #2563eb}
.card-rank-2{border-left:5px solid #6366f1}
.card-rank-3{border-left:5px solid #8b5cf6}
.card-rank-4{border-left:5px solid #0891b2}
.card-rank-5{border-left:5px solid #0d9488}
.card-hdr{display:flex;align-items:center;padding:24px 28px;background:#f8fafc;border-bottom:1px solid #e2e8f0;gap:16px}
.card-icon{font-size:32px;flex-shrink:0}
.card-co{flex:1}
.card-co h2{font-size:19px;font-weight:700;color:#0f172a;margin-bottom:8px}
.co-code{font-size:13px;color:#64748b;font-weight:500}
.card-tags{display:flex;gap:8px;flex-wrap:wrap}
.ttag,.stag{display:inline-block;font-size:12px;font-weight:600;padding:4px 12px;border-radius:4px;letter-spacing:.3px}
.tag-blue{background:#eff6ff;color:#2563eb}
.tag-amber{background:#fffbeb;color:#b45309}
.tag-emerald{background:#ecfdf5;color:#059669}
.tag-rose{background:#fff1f2;color:#e11d48}
.tag-slate{background:#f1f5f9;color:#475569}
.stag{background:#eef2ff;color:#4338ca}
.card-sc{text-align:right;flex-shrink:0}
.sc-num{font-size:30px;font-weight:800;color:#1e3a5f;line-height:1}
.card-bd{padding:28px}

.igrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px 24px;margin-bottom:20px}
.ii{display:flex;flex-direction:column;gap:2px}
.ii.full{grid-column:1/-1}
.il{font-size:11px;color:#94a3b8;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.iv{font-size:14px;color:#1e293b;font-weight:500}
.iv.amt{font-weight:700;color:#0f172a}

.prog-bar{height:5px;background:#e2e8f0;border-radius:3px;margin-bottom:6px;overflow:hidden}
.prog-fill{height:100%;background:linear-gradient(90deg,#2563eb,#6366f1);border-radius:3px;transition:width .6s ease}
.prog-lbl{font-size:12px;color:#64748b;margin-bottom:20px;font-weight:500}

.sec{margin-bottom:18px}
.sec h3{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px}
.sec p{font-size:14px;color:#334155;line-height:1.8;text-align:justify}
.ag{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.rec-box{background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:18px 22px;margin-top:8px}
.rec-box h3{color:#854d0e}
.rec-box p{color:#713f12}

/* Timeline */
.tl{position:relative;max-width:1000px;margin:0 auto 60px;padding:24px 0}
.tl::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:2px;background:#cbd5e1;transform:translateX(-50%)}
.tl-it{position:relative;width:50%;padding:0 36px 32px}
.tl-l{left:0;text-align:right}
.tl-r{left:50%;text-align:left}
.tl-it::before{content:'';position:absolute;top:10px;width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px #2563eb;z-index:1}
.tl-l::before{right:-8px}
.tl-r::before{left:-8px}
.tl-ct{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;transition:box-shadow .2s}
.tl-ct:hover{box-shadow:0 4px 16px rgba(30,58,95,0.08)}
.tl-dt{font-size:12px;color:#64748b;font-weight:600;margin-bottom:4px}
.tl-co{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:2px}
.tl-pl{font-size:13px;color:#475569;margin-bottom:8px}
.tl-tg{display:flex;gap:6px;flex-wrap:wrap}
.tl-l .tl-tg{justify-content:flex-end}
.tl-r .tl-tg{justify-content:flex-start}

/* Footer */
.rf{background:#f8fafc;border-top:2px solid #e2e8f0;padding:32px 0;text-align:center;font-size:13px;color:#94a3b8;margin-top:20px}
.rf .disc{max-width:700px;margin:8px auto 0;font-size:12px;color:#cbd5e1;line-height:1.6}

@media (max-width:768px){
  .sg{grid-template-columns:repeat(2,1fr)}
  .igrid{grid-template-columns:1fr 1fr}
  .ag{grid-template-columns:1fr}
  .card-hdr{flex-direction:column;text-align:center}
  .card-sc{text-align:center}
  .tl::before{left:20px}
  .tl-it{width:100%;padding-left:56px;padding-right:16px}
  .tl-l,.tl-r{left:0;text-align:left}
  .tl-l::before,.tl-r::before{left:12px}
  .tl-l .tl-tg,.tl-r .tl-tg{justify-content:flex-start}
}
</style></head>
<body>
<header class="rh"><div class="c">
  <div class="badge">Shunde Monitor \u00b7 \u667a\u80fd\u76d1\u6d4b\u62a5\u544a</div>
  <h1>\u987a\u5fb7\u4e0a\u5e02\u516c\u53f8\u516c\u544a\u5206\u6790</h1>
  <p class="subt">TOP5 \u5408\u4f5c\u673a\u4f1a\u6df1\u5ea6\u5256\u6790 \u00b7 \u534e\u6cf0\u8bc1\u5238\u8425\u4e1a\u90e8\u4e1a\u52a1\u6307\u5f15</p>
  <div class="mr"><span>\u76d1\u6d4b\u8303\u56f4\uff1a2026-04-15 \u81f3 2026-07-14</span><span>\u8986\u76d6\u516c\u53f8\uff1a28 \u5bb6\u987a\u5fb7A\u80a1\u4e0a\u5e02\u4f01\u4e1a</span><span>\u5206\u6790\u4e8b\u4ef6\uff1a${events.length} \u4e2a\u5408\u5e76\u4e8b\u4ef6</span></div>
</div></header>

<div class="c">
  ${renderSummary()}
  ${renderTimeline()}
  <div class="sttl"><h2>\ud83c\udfc6 TOP5 \u4e8b\u4ef6\u8be6\u60c5</h2><p class="subt">\u6309\u7efc\u5408\u8bc4\u5206\u6392\u5e8f\uff0c\u4ece\u4e8b\u4ef6\u80cc\u666f\u5230\u5408\u4f5c\u673a\u4f1a\u7684\u5b8c\u6574\u5206\u6790\u94fe\u6761</p></div>
  ${top5.map((ev,i)=>renderCard(ev,i)).join('')}
</div>

<footer class="rf"><div class="c">
  <p>\u987a\u5fb7\u4e0a\u5e02\u516c\u53f8\u516c\u544a\u667a\u80fd\u76d1\u6d4b\u7cfb\u7edf (Shunde Monitor)</p>
  <p class="disc">\u672c\u62a5\u544a\u7531AI\u81ea\u52a8\u751f\u6210\uff0c\u6570\u636e\u6765\u6e90\u4e8e\u4e0a\u5e02\u516c\u53f8\u516c\u5f00\u516c\u544a\uff0c\u4ec5\u4f9b\u53c2\u8003\uff0c\u4e0d\u6784\u6210\u6295\u8d44\u5efa\u8bae\u6216\u4e1a\u52a1\u627f\u8bfa\u3002<br>\u5206\u6790\u7ed3\u679c\u57fa\u4e8e\u516c\u544a\u6587\u672c\u7684\u7ed3\u6784\u5316\u62bd\u53d6\u4e0e\u89c4\u5219\u5f15\u64ce\uff0c\u5b9e\u9645\u4e1a\u52a1\u51b3\u7b56\u8bf7\u7ed3\u5408\u4eba\u5de5\u5224\u65ad\u3002</p>
  <p style="margin-top:8px;font-size:11px;color:#cbd5e1">\u751f\u6210\u65f6\u95f4\uff1a${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>
</div></footer>
</body></html>`;

const outDir = path.join(__dirname, '..', 'outputs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'shunde_top5_report.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`\u2705 HTML report: ${outPath}`);
console.log(`   TOP5: ${top5.map(e=>`${e.companyName}(${e.totalScore.toFixed(2)})`).join(', ')}`);
