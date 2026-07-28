/**
 * 公告合并引擎
 * 规则：公司 + 类型 + 计划名称 → 合并为一个"事件"
 * - 股权激励/员工持股：按计划名称精确分组
 * - 股份回购/委托理财：同公司同类型全部合并
 * - 跨计划公告（如"2022年和2023年"）：同时出现在两组的源列表中
 */

const fs = require('fs');
const path = require('path');

const data = require('../data/shunde_monitor.json');
const baseline = require('../data/broker_baseline.json');

// 有效公告
const valid = Object.values(data.announcements).filter(
  a => !a.isCompanion && !a.lowContent
);

/**
 * 从标题中提取计划名称
 */
function extractPlanNames(title) {
  const t = title.replace('[临时公告]', '').trim();
  const plans = [];

  // 匹配年份 + 激励计划类型
  const eqPatterns = [
    /(\d{4})\s*年\s*(?:A股\s*)?限制性股票激励计划/g,
    /(\d{4})\s*年\s*(?:A股\s*)?股票期权与限制性股票激励计划/g,
    /(\d{4})\s*年\s*(?:A股\s*)?股票期权激励计划/g,
    /第\s*([一二三四五六七八九十]+)\s*期\s*(?:A股\s*)?股票期权激励计划/g,
    /第\s*([一二三四五六七八九十]+)\s*期\s*(?:A股\s*)?限制性股票激励计划/g,
    /(\d{4})\s*年\s*(?:A股\s*)?员工持股计划/g,
    /第\s*([一二三四五六七八九十]+)\s*期\s*员工持股计划/g,
  ];

  const foundSet = new Set();

  for (const pat of eqPatterns) {
    let m;
    while ((m = pat.exec(t)) !== null) {
      const planName = m[0].trim();
      foundSet.add(planName);
    }
  }

  // 如果没匹配到计划名，但有年份和类型
  if (foundSet.size === 0) {
    const yearMatch = t.match(/(\d{4})\s*年/);
    if (yearMatch) {
      const year = yearMatch[1];
      if (t.includes('限制性股票') && t.includes('股票期权')) {
        foundSet.add(year + '年股票期权与限制性股票激励计划');
      } else if (t.includes('限制性股票')) {
        foundSet.add(year + '年限制性股票激励计划');
      } else if (t.includes('股票期权')) {
        foundSet.add(year + '年股票期权激励计划');
      } else if (t.includes('员工持股')) {
        foundSet.add(year + '年员工持股计划');
      }
    } else if (t.includes('员工持股')) {
      // 尝试从内容中提取
      const phaseMatch = t.match(/第\s*([一二三四五六七八九十]+)\s*期/);
      if (phaseMatch) {
        foundSet.add('第' + phaseMatch[1] + '期员工持股计划');
      }
    }
  }

  // 如果都没有，用类型本身
  if (foundSet.size === 0) {
    if (t.includes('员工持股')) foundSet.add('员工持股计划');
    else if (t.includes('限制性股票')) foundSet.add('限制性股票激励计划');
    else if (t.includes('股票期权')) foundSet.add('股票期权激励计划');
    else foundSet.add('股权激励计划');
  }

  return Array.from(foundSet);
}

/**
 * 公司简称
 */
function shortName(fullName) {
  const map = {
    '美的集团': '美的',
    '海信家电': '海信',
    '科达制造': '科达',
    '悍高集团': '悍高',
    '申菱环境': '申菱',
    '新宝股份': '新宝',
    '伊之密': '伊之密',
    '万和电气': '万和',
    '箭牌家居': '箭牌',
    '顺控发展': '顺控',
    '小熊电器': '小熊',
    '顺威股份': '顺威',
    '伊戈尔': '伊戈尔',
    '科顺股份': '科顺',
    '顺钠股份': '顺钠',
    '德尔玛': '德尔玛',
    '海川智能': '海川',
    '东箭科技': '东箭',
    '莱尔科技': '莱尔',
    '富信科技': '富信',
    '奔朗新材': '奔朗',
    '德美化工': '德美',
    '德冠新材': '德冠',
    '瑞德智能': '瑞德',
    '胜业电气': '胜业',
    '精艺股份': '精艺',
    '星徽股份': '星徽',
    '联合精密': '联合',
  };
  return map[fullName] || fullName.replace('股份有限公司', '').replace('有限公司', '');
}

// ========== 分组逻辑 ==========
const events = {}; // key: "company|type|planName"

valid.forEach(ann => {
  const company = ann.companyName;
  const type = ann.type;

  // 股份回购和委托理财：全公司合并
  if (type === '股份回购' || type === '委托理财') {
    const key = company + '|' + type + '|_ALL_';
    if (!events[key]) {
      events[key] = {
        eventId: shortName(company) + '_' + type,
        companyName: company,
        code: ann.code,
        type: type,
        planName: type + '（合并）',
        announcements: [],
      };
    }
    events[key].announcements.push(ann);
    return;
  }

  // 股权激励和员工持股：按计划名称分组
  const plans = extractPlanNames(ann.title);
  // 去重后分配
  const uniquePlans = [...new Set(plans)];

  if (uniquePlans.length === 0) {
    // fallback: 按类型分组
    const key = company + '|' + type + '|_UNKNOWN_';
    if (!events[key]) {
      events[key] = {
        eventId: shortName(company) + '_' + type,
        companyName: company,
        code: ann.code,
        type: type,
        planName: type + '（未分类）',
        announcements: [],
      };
    }
    events[key].announcements.push(ann);
    return;
  }

  // 对每个匹配的计划，都加入
  for (const plan of uniquePlans) {
    const key = company + '|' + type + '|' + plan;
    if (!events[key]) {
      events[key] = {
        eventId: shortName(company) + '_' + plan.replace(/\s+/g, ''),
        companyName: company,
        code: ann.code,
        type: type,
        planName: plan,
        announcements: [],
      };
    }
    events[key].announcements.push(ann);
  }
});

// ========== 后处理：合并没有年份的计划到有年份的计划 ==========
// 规则：同公司同类型，如果"通用计划名"和"带年份的计划名"有公告重叠（同日发布），合并
const eventsArr = Object.values(events);
const mergePairs = []; // [{from: key, to: key}]

eventsArr.forEach(ev => {
  if (ev.annCount === 0) return;
  // 只处理股权激励和员工持股
  if (ev.type !== '股权激励' && ev.type !== '员工持股') return;
  // 检查计划名是否包含年份
  const hasYear = /\d{4}年/.test(ev.planName);
  if (hasYear) return; // 有年份，不处理

  // 找同公司同类型中"有年份"的计划
  const candidateKeys = Object.keys(events).filter(k => {
    const other = events[k];
    if (other === ev) return false;
    if (other.companyName !== ev.companyName) return false;
    if (other.type !== ev.type) return false;
    return /\d{4}年/.test(other.planName);
  });

  // 检查日期邻近（30天内）：通用计划的公告日期出现在有年份计划的±30天范围内
  const genericDates = ev.announcements.map(a => a.date);
  for (const ck of candidateKeys) {
    const candidate = events[ck];
    const candidateDates = new Set(candidate.announcements.map(a => a.date));
    
    // 检查30天内邻近
    let isProximate = false;
    for (const gd of genericDates) {
      for (const cd of candidateDates) {
        const dayDiff = Math.abs(new Date(gd) - new Date(cd)) / (1000 * 60 * 60 * 24);
        if (dayDiff <= 30) { isProximate = true; break; }
      }
      if (isProximate) break;
    }
    if (!isProximate) continue;
    
    // 计划类型兼容性检查：限制性股票≠股票期权
    const genIsOption = ev.planName.includes('股票期权') && !ev.planName.includes('限制性股票');
    const genIsRestricted = ev.planName.includes('限制性股票');
    const candIsOption = candidate.planName.includes('股票期权') && !candidate.planName.includes('限制性股票');
    const candIsRestricted = candidate.planName.includes('限制性股票');
    
    // 如果类型不兼容（限制性 vs 期权），跳过
    if (genIsOption && candIsRestricted) continue;
    if (genIsRestricted && candIsOption) continue;
    
    mergePairs.push({ fromKey: Object.keys(events).find(k => events[k] === ev), toKey: ck });
    break;
  }
});

// 执行合并
mergePairs.forEach(({ fromKey, toKey }) => {
  const from = events[fromKey];
  const to = events[toKey];
  // 去重合并公告
  const existingIds = new Set(to.announcements.map(a => a.id));
  from.announcements.forEach(a => {
    if (!existingIds.has(a.id)) {
      to.announcements.push(a);
      existingIds.add(a.id);
    }
  });
  // 删除通用计划
  delete events[fromKey];
  console.log('后处理合并: ' + from.eventId + ' → ' + to.eventId + ' (同日重叠)');
});

// ========== 后处理：伊戈尔特殊合并 ==========
// 伊戈尔的 "股票期权激励计划" "限制性股票激励计划" 应该属于 "2023年股票期权与限制性股票激励计划"
const yigeerKeys = Object.keys(events).filter(k => {
  const ev = events[k];
  return ev.companyName === '伊戈尔' && ev.type === '股权激励';
});
if (yigeerKeys.length > 1) {
  const mainKey = yigeerKeys.find(k => events[k].planName.includes('2023'));
  const subKeys = yigeerKeys.filter(k => k !== mainKey);
  if (mainKey && subKeys.length > 0) {
    const main = events[mainKey];
    const existingIds = new Set(main.announcements.map(a => a.id));
    subKeys.forEach(sk => {
      const sub = events[sk];
      sub.announcements.forEach(a => {
        if (!existingIds.has(a.id)) {
          main.announcements.push(a);
          existingIds.add(a.id);
        }
      });
      console.log('后处理合并(伊戈尔): ' + sub.eventId + ' → ' + main.eventId);
      delete events[sk];
    });
    // 更新计划名
    main.planName = '2023年股票期权与限制性股票激励计划';
  }
}

// ========== 排序 ==========
const eventList = Object.values(events);
eventList.forEach(ev => {
  ev.announcements.sort((a, b) => a.date.localeCompare(b.date));
  ev.annCount = ev.announcements.length;
  ev.latestDate = ev.announcements[ev.announcements.length - 1].date;
  ev.earliestDate = ev.announcements[0].date;
  ev.sourceIds = ev.announcements.map(a => a.id).join(';');
});

// 按最新日期排序
eventList.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

// 输出结果
console.log('=== 合并后事件总数: ' + eventList.length + ' ===\n');

const byType = {};
eventList.forEach(ev => {
  byType[ev.type] = (byType[ev.type] || 0) + 1;
});

console.log('按类型分布:');
Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log('  ' + k + ': ' + v + '个事件');
});

console.log('\n=== 事件清单 ===');
eventList.forEach((ev, i) => {
  const marker = ev.annCount >= 2 ? '●' : '○';
  console.log(marker + ' ' + (i + 1) + '. [' + ev.type + '] ' + ev.companyName + ' | ' + ev.planName);
  console.log('   事件ID: ' + ev.eventId + ' | 公告数: ' + ev.annCount + ' | ' + ev.earliestDate + ' ~ ' + ev.latestDate);
  // Show source announcements briefly
  if (ev.annCount <= 5) {
    ev.announcements.forEach(a => {
      console.log('     - [' + a.date + '] ' + a.title.substring(0, 70));
    });
  } else {
    console.log('     - [' + ev.announcements[0].date + '] ' + ev.announcements[0].title.substring(0, 60) + '...');
    console.log('     - ...共' + ev.annCount + '条...');
    console.log('     - [' + ev.announcements[ev.annCount - 1].date + '] ' + ev.announcements[ev.annCount - 1].title.substring(0, 60));
  }
  console.log('');
});

// 统计跨计划公告
const crossPlan = eventList.filter(ev => {
  const allIds = [];
  eventList.forEach(e2 => {
    if (e2 !== ev) e2.announcements.forEach(a => allIds.push(a.id));
  });
  return ev.announcements.some(a => allIds.includes(a.id));
});
console.log('\n跨计划公告事件数: ' + crossPlan.length);
crossPlan.forEach(ev => {
  console.log('  ' + ev.eventId + ' (有公告同时属于其他计划)');
});

// 保存
fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'merged_events.json'),
  JSON.stringify(eventList, null, 2),
  'utf8'
);
console.log('\n结果已保存: data/merged_events.json');
