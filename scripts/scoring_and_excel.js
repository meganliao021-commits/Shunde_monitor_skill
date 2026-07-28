/**
 * 评分引擎 + Excel输出 —— 40个合并事件的五维度评分和Excel报告生成
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'reports', 'deep_analysis_results.json'), 'utf8'));
const brokerBaseline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'broker_baseline.json'), 'utf8'));

// ============================================================
// 评分引擎
// ============================================================

/** 维度1：业务规模（权重30%）*/
function scoreBizScale(event) {
  const aw = event.amountWan || 0;
  if (aw > 10000) return 5;
  if (aw > 5000) return 4;
  if (aw > 1000) return 3;
  if (aw > 500) return 2;
  return 1;
}

/** 维度2：阶段价值（权重25%）*/
function scoreStage(stage) {
  const map = {
    '首次草案': 5,
    '授予实施': 4,
    '解锁/行权/归属': 3,
    '修订/调整': 3,
    '完成/续作': 2,
    '持续认购': 3,  // 委托理财持续认购 → 中等价值
    '例行披露': 1,
  };
  return map[stage] || 2;
}

/** 维度3：券商替代空间（权重20%）*/
function scoreBroker(event) {
  const info = getBaseline(event.companyName);
  const broker = info.broker || '';
  const bizDone = info.bizDone || '';
  
  // 华泰保荐
  if (broker.includes('华泰')) return 5;
  // 华泰已有落地业务
  if (bizDone && bizDone.length > 3 && bizDone !== '无') return 4;
  // 中小券商保荐
  const smallBrokers = ['国元', '世纪', '华西', '恒泰', '东莞', '国金', '长江',
    '东海', '西部', '东北', '西南', '中泰', '东吴', '国联', '国信', '光大', '安信',
    '申万宏源', '民生', '兴业', '平安', '广发', '招商', '海通'];
  for (const sb of smallBrokers) {
    if (broker.includes(sb)) return 3;
  }
  // 大所保荐
  const bigBrokers = ['中信', '中金', '国泰海通', '国泰君安'];
  for (const bb of bigBrokers) {
    if (broker.includes(bb)) {
      if (bizDone && bizDone.length > 3) return 3; // 有落地业务则中等
      return 2;
    }
  }
  // 无券商信息
  if (!broker || broker.length < 2) return 3;
  // 默认中等
  return 3;
}

/** 维度4：时效紧迫性（权重15%）*/
function scoreUrgency(latestDate) {
  if (!latestDate) return 3;
  const d = new Date(latestDate);
  const now = new Date();
  const daysAgo = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  
  if (daysAgo <= 7) return 5;
  if (daysAgo <= 30) return 4;
  if (daysAgo <= 90) return 3;
  if (daysAgo <= 180) return 2;
  return 1;
}

/** 维度5：公司整体价值（权重10%）*/
function scoreCompany(event) {
  const info = getBaseline(event.companyName);
  const marketCap = info.marketCap || 0;
  
  let score = 1;
  if (marketCap > 500) score = 5;
  else if (marketCap > 100) score = 4;
  else if (marketCap > 50) score = 3;
  else if (marketCap > 30) score = 2;
  
  // 频次加分（简化：每多一条公告 +0.1，封顶 +1）
  const annCount = event.annCount || 1;
  const freqBonus = Math.min((annCount - 1) * 0.2, 1);
  
  return Math.min(score + freqBonus, 5);
}

function getBaseline(companyName) {
  return brokerBaseline[companyName] || {};
}

function getStars(totalScore) {
  if (totalScore >= 4.5) return '★★★★★';
  if (totalScore >= 3.5) return '★★★★';
  if (totalScore >= 2.5) return '★★★';
  if (totalScore >= 1.5) return '★★';
  return '★';
}

// ============================================================
// 主流程
// ============================================================

console.log(`开始评分 ${results.length} 个事件...\n`);

const scored = results.map(event => {
  const info = getBaseline(event.companyName);
  
  const s1 = scoreBizScale(event);
  const s2 = scoreStage(event.stage);
  const s3 = scoreBroker(event);
  const s4 = scoreUrgency(event.latestDate);
  const s5 = scoreCompany(event);
  
  const totalScore = (
    s1 * 0.30 +
    s2 * 0.25 +
    s3 * 0.20 +
    s4 * 0.15 +
    s5 * 0.10
  );
  
  const stars = getStars(totalScore);
  
  return {
    ...event,
    scoreBizScale: s1,
    scoreStage: s2,
    scoreBroker: s3,
    scoreUrgency: s4,
    scoreCompany: s5,
    totalScore: Math.round(totalScore * 100) / 100,
    stars: stars,
    broker: info.broker || '',
    bizDone: info.bizDone || '',
    marketCap: info.marketCap || 0,
    companyCode: event.sourceIds && event.sourceIds.length > 0 ? 
      (info.code || '') : '',
  };
});

// 按综合分排序
scored.sort((a, b) => b.totalScore - a.totalScore);

// 打印TOP10
console.log('=== TOP 10 ===');
scored.slice(0, 10).forEach((r, i) => {
  console.log(`#${i+1} ${r.companyName} | ${r.type} | ${r.stage} | ${r.stars} | 综合分:${r.totalScore} | 金额:${r.amountWan}万 | 规模:${r.scoreBizScale} 阶段:${r.scoreStage} 替代:${r.scoreBroker} 紧迫:${r.scoreUrgency} 公司:${r.scoreCompany}`);
});

console.log('');
console.log('=== 评分分布 ===');
const starDist = {};
scored.forEach(r => { starDist[r.stars] = (starDist[r.stars] || 0) + 1; });
Object.entries(starDist).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}个`));

// ============================================================
// 生成 Excel
// ============================================================

const headers = [
  '事件标识', '公司名称', '公司代码', '市值(亿)', '公告类型', '子阶段', '最新公告日', '源公告数',
  '背景', '动作', '对象', '金额(万元)', '时间节点', '合作方',
  '保荐/督导券商', '华泰已落地业务',
  '业务规模(30%)', '阶段价值(25%)', '替代空间(20%)', '时效紧迫性(15%)', '公司价值(10%)',
  '综合评分', '星级', '推荐服务包'
];

const rows = [headers];

scored.forEach(r => {
  rows.push([
    r.eventId,
    r.companyName,
    r.companyCode || '',
    r.marketCap,
    r.type,
    r.stage,
    r.latestDate || '',
    r.annCount || 1,
    r.background,
    r.action,
    r.objects,
    r.amountWan || 0,
    r.timeline,
    r.partners,
    r.broker,
    r.bizDone,
    r.scoreBizScale,
    r.scoreStage,
    r.scoreBroker,
    r.scoreUrgency,
    r.scoreCompany,
    r.totalScore,
    r.stars,
    r.recommendation,
  ]);
});

// 创建 workbook
const ws = XLSX.utils.aoa_to_sheet(rows);

// 设置列宽
const colWidths = [
  { wch: 35 }, // 事件标识
  { wch: 12 }, // 公司名称
  { wch: 10 }, // 公司代码
  { wch: 10 }, // 市值
  { wch: 10 }, // 公告类型
  { wch: 14 }, // 子阶段
  { wch: 14 }, // 最新公告日
  { wch: 10 }, // 源公告数
  { wch: 60 }, // 背景
  { wch: 60 }, // 动作
  { wch: 50 }, // 对象
  { wch: 12 }, // 金额
  { wch: 60 }, // 时间节点
  { wch: 60 }, // 合作方
  { wch: 20 }, // 保荐券商
  { wch: 30 }, // 华泰落地业务
  { wch: 14 }, // 业务规模
  { wch: 14 }, // 阶段价值
  { wch: 14 }, // 替代空间
  { wch: 14 }, // 时效紧迫性
  { wch: 14 }, // 公司价值
  { wch: 10 }, // 综合评分
  { wch: 12 }, // 星级
  { wch: 60 }, // 推荐服务包
];

ws['!cols'] = colWidths;

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '公告深度分析');

const outPath = path.join(__dirname, '..', 'data', 'reports', 'shunde_deep_analysis.xlsx');
if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);

console.log(`\nExcel 已保存到: ${outPath}`);
console.log(`总行数: ${rows.length - 1}`);

// 保存scored结果用于HTML
fs.writeFileSync(path.join(__dirname, '..', 'data', 'reports', 'scored_events.json'), JSON.stringify(scored, null, 2), 'utf8');
console.log('评分结果已保存到: data/reports/scored_events.json');
