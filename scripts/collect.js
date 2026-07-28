/**
 * 顺德上市公司公告采集脚本
 * 调用 westock-data 拉取28家顺德公司公告，过滤四类关键词，去重存储
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============ 配置 ============

// 获取 WorkBuddy 根目录（跨用户可移植）
function detectWorkbuddyHome() {
    if (process.env.WORKBUDDY_ROOT && fs.existsSync(process.env.WORKBUDDY_ROOT)) {
        return process.env.WORKBUDDY_ROOT;
    }
    if (process.env.WORKBUDDY_HOME && fs.existsSync(process.env.WORKBUDDY_HOME)) {
        return process.env.WORKBUDDY_HOME;
    }
    // 自动推断：Windows → ~/.workbuddy，macOS/Linux → ~/.workbuddy
    return path.join(os.homedir(), '.workbuddy');
}
const WB_ROOT = detectWorkbuddyHome();

// 2. 从 config.json 读取用户自定义路径
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'config.json');

// 自动检测可用的 Node.js 版本（不再硬编码版本号）
function detectNodePath(wbRoot) {
    const versionsDir = path.join(wbRoot, 'binaries', 'node', 'versions');
    if (!fs.existsSync(versionsDir)) return 'node'; // 回退到系统 PATH
    const versions = fs.readdirSync(versionsDir)
        .filter(d => fs.statSync(path.join(versionsDir, d)).isDirectory())
        .filter(d => /^\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => {
            const [am, an, ap] = a.split('.').map(Number);
            const [bm, bn, bp] = b.split('.').map(Number);
            return (bm - am) || (bn - an) || (bp - ap);
        });
    if (versions.length > 0) {
        return path.join(versionsDir, versions[0], 'node.exe');
    }
    return 'node';
}

// 自动检测 Python 环境（优先 managed venv，不存在则自动创建）
function detectPythonPath(wbRoot) {
    const envsDir = path.join(wbRoot, 'binaries', 'python', 'envs', 'default');
    const venvPython = path.join(envsDir, 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) return venvPython;
    // 查找 managed Python
    const pyVersionsDir = path.join(wbRoot, 'binaries', 'python', 'versions');
    let pythonExe = null;
    if (fs.existsSync(pyVersionsDir)) {
        const versions = fs.readdirSync(pyVersionsDir)
            .filter(d => fs.statSync(path.join(pyVersionsDir, d)).isDirectory())
            .filter(d => /^\d+\.\d+\.\d+$/.test(d))
            .sort().reverse();
        for (const v of versions) {
            const exe = path.join(pyVersionsDir, v, 'python.exe');
            if (fs.existsSync(exe)) { pythonExe = exe; break; }
        }
    }
    if (!pythonExe) return 'python';
    // 自动创建 venv + 安装 PyMuPDF
    try {
        console.log('[首次运行] 正在创建 Python 虚拟环境...');
        execSync(`"${pythonExe}" -m venv "${envsDir}"`, { stdio: 'pipe', timeout: 60000 });
        console.log('[虚拟环境] 创建成功');
        const pip = path.join(envsDir, 'Scripts', 'pip.exe');
        if (fs.existsSync(pip)) {
            console.log('[首次运行] 正在安装 PyMuPDF（可能需要1-2分钟）...');
            execSync(`"${pip}" install "PyMuPDF>=1.23.0"`, { stdio: 'pipe', timeout: 120000 });
            console.log('[PyMuPDF] 安装成功');
        }
        if (fs.existsSync(venvPython)) return venvPython;
    } catch (e) {
        console.error(`[警告] Python 环境初始化失败，将使用系统 Python: ${e.message}`);
    }
    return pythonExe;
}

function loadConfig() {
    const defaultConfig = {
        westockScript: path.join(WB_ROOT, 'resources', 'app.asar.unpacked', 'resources', 'builtin-skills', 'westock-data', 'scripts', 'index.js'),
        nodePath: detectNodePath(WB_ROOT),
        pythonPath: detectPythonPath(WB_ROOT),
        dataDir: path.join(WB_ROOT, 'skills', 'shunde-monitor', 'data'),
        skillDir: path.join(WB_ROOT, 'skills', 'shunde-monitor'),
        noticeLimit: 50,
        monthsBack: 3,
        lowContentThreshold: 300
    };
    
    if (fs.existsSync(CONFIG_FILE)) {
        const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        const merged = { ...defaultConfig, ...userConfig };
        // 处理 "auto" 模式：当 config 中路径为 auto 或路径实际不存在时，回退到默认值
        if (merged.westockScript === 'auto' || !fs.existsSync(merged.westockScript)) {
            merged.westockScript = defaultConfig.westockScript;
        }
        if (merged.nodePath === 'auto' || !fs.existsSync(merged.nodePath)) {
            merged.nodePath = defaultConfig.nodePath;
        }
        if (merged.pythonPath === 'auto' || !fs.existsSync(merged.pythonPath)) {
            merged.pythonPath = defaultConfig.pythonPath;
        }
        if (merged.dataDir === 'auto' || !fs.existsSync(merged.dataDir)) {
            merged.dataDir = defaultConfig.dataDir;
        }
        if (merged.skillDir === 'auto' || !fs.existsSync(merged.skillDir)) {
            merged.skillDir = defaultConfig.skillDir;
        }
        return merged;
    }
    
    // 首次运行：自动生成配置文件
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(`[首次运行] 已自动生成配置文件: ${CONFIG_FILE}`);
    return defaultConfig;
}

const CONFIG = loadConfig();

// 3. 派生路径变量
const WESTOCK_SCRIPT = CONFIG.westockScript;
const NODE_PATH = CONFIG.nodePath;
const PYTHON_PATH = CONFIG.pythonPath;
const PDF_EXTRACT_SCRIPT = path.join(__dirname, 'pdf_extract.py');
const SKILL_DIR = CONFIG.skillDir;
const DATA_DIR = CONFIG.dataDir;
const OUTPUT_DIR = path.join(SKILL_DIR, 'outputs');
const DATA_FILE = path.join(DATA_DIR, 'shunde_monitor.json');
const COMPANIES_FILE = path.join(SKILL_DIR, 'config', 'companies.json');
const ERROR_LOG_FILE = path.join(DATA_DIR, 'error_log.json');
const NOTICE_LIMIT = CONFIG.noticeLimit;
const MONTHS_BACK = CONFIG.monthsBack;

// 关键词过滤规则
const KEYWORD_RULES = [
  { type: '股权激励', keywords: ['股权激励', '限制性股票', '股票期权', '激励计划'], exclude: [] },
  { type: '员工持股', keywords: ['员工持股'], exclude: [] },
  { type: '股份回购', keywords: ['回购'], exclude: ['逆回购', '国债回购', '证券回购', '央行票据'] },
  { type: '委托理财', keywords: ['委托理财', '闲置资金', '闲置自有资金', '理财产品', '进行委托'], exclude: [] }
];

// 附属文件标题模式（程序性/附件类公告，信息已被主公告覆盖）
const COMPANION_PATTERNS = [
  { pattern: /法律意见/, type: 'lawFirmOpinion', reason: '律师事务所法律意见书' },
  { pattern: /律师事务所关于/, type: 'lawFirmOpinion', reason: '律师事务所法律意见书' },
  { pattern: /薪酬与考核委员会.*核查意见/, type: 'committeeReview', reason: '薪酬与考核委员会核查意见' },
  { pattern: /薪酬与考核委员会.*意见/, type: 'committeeReview', reason: '薪酬与考核委员会意见' },
  { pattern: /前十名股东|前十名无限售/, type: 'top10Shareholders', reason: '前十名股东持股情况（例行披露）' },
  { pattern: /减资通知.*债权人|债权人.*减资/, type: 'creditorNotice', reason: '减资债权人通知（法定程序）' },
  { pattern: /（草案）摘要/, type: 'draftSummary', reason: '草案摘要（与草案正文重复）' },
];

// 低内容阈值（字符数）
const LOW_CONTENT_THRESHOLD = 300;

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseMarkdownTable(output) {
  const lines = output.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return [];

  const header = lines[0].trim().slice(1, -1).trim().split(' | ').map(c => c.trim());
  const dataRows = lines.slice(2);

  return dataRows.map(row => {
    const cells = row.trim().slice(1, -1).trim().split(' | ').map(c => c.trim());
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = cells[i] !== undefined ? cells[i] : '';
    });
    return obj;
  }).filter(r => r.id && r.id !== '---');
}

function classifyAnnouncement(title) {
  const t = title.toLowerCase();
  // 优先级：股权激励 > 员工持股 > 股份回购 > 委托理财
  if (t.includes('股权激励') || t.includes('限制性股票') || t.includes('股票期权') || t.includes('激励计划')) {
    return '股权激励';
  }
  if (t.includes('员工持股')) {
    return '员工持股';
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.type === '股份回购') {
      if (t.includes('回购')) {
        const hasExclude = rule.exclude.some(e => t.includes(e));
        if (!hasExclude) return '股份回购';
      }
    }
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.type === '委托理财') {
      const hasKeyword = rule.keywords.some(k => t.includes(k));
      if (hasKeyword) return '委托理财';
    }
  }
  return null;
}

/**
 * 运行 westock 命令，带3次自动重试+递增延迟，失败写入 error_log.json
 */
function runWestockCommand(args) {
  const cmd = `"${NODE_PATH}" "${WESTOCK_SCRIPT}" ${args}`;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
      return result;
    } catch (e) {
      const errMsg = (e.stderr || e.message || '').substring(0, 500);
      if (attempt < maxRetries) {
        const waitMs = attempt * 2000;
        console.log(`    重试 ${attempt}/${maxRetries}（${waitMs / 1000}s 后）...`);
        // 同步等待（仅在重试时使用，总延迟 2s+4s = 6s）
        const end = Date.now() + waitMs;
        while (Date.now() < end) { /* spin */ }
      } else {
        console.error(`  [错误] 命令失败(已重试${maxRetries}次): ${args}`);
        console.error(`  ${errMsg}`);
        // 写入错误日志
        try {
          fs.mkdirSync(path.dirname(ERROR_LOG_FILE), { recursive: true });
          const errLog = fs.existsSync(ERROR_LOG_FILE) 
            ? JSON.parse(fs.readFileSync(ERROR_LOG_FILE, 'utf-8')) 
            : [];
          errLog.push({ time: new Date().toISOString(), args, error: errMsg });
          fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(errLog, null, 2), 'utf-8');
        } catch (_) { /* 日志写入失败不影响主流程 */ }
      }
    }
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function isPdfUrl(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('http') && trimmed.includes('.PDF') && trimmed.length < 120;
}

function extractPdfText(pdfUrl) {
  const cmd = `"${PYTHON_PATH}" "${PDF_EXTRACT_SCRIPT}" "${pdfUrl}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    if (result && result.length > 50) {
      return result.trim();
    }
    return null;
  } catch (e) {
    console.error(`    [PDF提取失败] ${(e.stderr || e.message || '').substring(0, 200)}`);
    return null;
  }
}

function detectCompanion(title) {
  if (!title) return { isCompanion: false };
  for (const rule of COMPANION_PATTERNS) {
    if (rule.pattern.test(title)) {
      return { isCompanion: true, companionType: rule.type, companionReason: rule.reason };
    }
  }
  return { isCompanion: false };
}

function isLowContent(detailText) {
  return !detailText || detailText.trim().length < LOW_CONTENT_THRESHOLD;
}

// ============ 主流程 ============

async function main() {
  console.log('=== 顺德上市公司公告采集 ===\n');

  // 0. 确保必要目录存在
  const dirsToCreate = [DATA_DIR, path.join(DATA_DIR, 'reports'), OUTPUT_DIR];
  dirsToCreate.forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      console.log(`创建目录: ${d}`);
    }
  });

  // 1. 读取公司清单
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf-8'));
  console.log(`公司数量: ${companies.length} 家\n`);

  // 2. 初始化或加载数据存储
  let store;
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`已加载历史数据: ${Object.keys(store.announcements || {}).length} 条公告\n`);
  } else {
    store = { version: 1, lastUpdated: null, companies: companies, announcements: {} };
    console.log('新建数据存储\n');
  }

  // 3. 计算回溯日期
  const now = new Date();
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, now.getDate());
  console.log(`回溯日期: ${formatDate(cutoffDate)} (最近 ${MONTHS_BACK} 个月)\n`);

  let newCount = 0;
  let skipCount = 0;
  let filteredCount = 0;
  let reprocessedCount = 0;
  const startTime = Date.now();

  // 4. 遍历公司采集
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    // 进度反馈：百分比 + 已用时间 + ETA
    const pct = ((i + 1) / companies.length * 100).toFixed(1);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const etaTotal = i > 0 ? Math.floor(elapsed / i * companies.length) : 0;
    const etaRemaining = Math.max(0, etaTotal - elapsed);
    const etaStr = etaRemaining > 0 ? ` | 预计剩余 ${etaRemaining}s` : '';
    const elapsedStr = elapsed > 0 ? ` | 已用 ${elapsed}s` : '';
    console.log(`[${i + 1}/${companies.length}] ${pct}%${elapsedStr}${etaStr}`);
    console.log(`  ${company.name} (${company.code})`);

    // 拉取公告列表
    const listOutput = runWestockCommand(`notice list ${company.code} --limit ${NOTICE_LIMIT}`);
    if (!listOutput) {
      console.log('  → 拉取失败，跳过\n');
      await sleep(500);
      continue;
    }

    const announcements = parseMarkdownTable(listOutput);
    console.log(`  → 拉取 ${announcements.length} 条公告`);

    for (const ann of announcements) {
      const nosId = ann.id;
      const title = ann.title || '';
      const timeStr = ann.time || ann.update_time || '';
      const annDate = parseDate(timeStr);

      // 日期过滤
      if (!annDate || annDate < cutoffDate) {
        continue;
      }

      // 关键词过滤
      const annType = classifyAnnouncement(title);
      if (!annType) {
        continue;
      }
      filteredCount++;

      // 去重检查（含低内容重新处理逻辑）
      if (store.announcements[nosId]) {
        const old = store.announcements[nosId];
        // 旧公告曾是低内容且从未成功提取 PDF → 重新尝试拉详情
        if (old.lowContent && !old.pdfEnriched) {
          console.log(`    → 旧公告为低内容，重新尝试拉取详情+PDF提取`);
          // 不回退，继续到下面的详情拉取逻辑
        } else {
          skipCount++;
          continue;
        }
      }

      // 拉取详情
      const label = store.announcements[nosId] ? '重新拉取' : '匹配';
      console.log(`  → ${label} [${annType}]: ${title.substring(0, 60)}...`);
      const detailOutput = runWestockCommand(`notice detail ${nosId}`);
      if (!detailOutput) {
        console.log('    详情拉取失败，跳过');
        await sleep(300);
        continue;
      }

      let detailData = null;
      try {
        detailData = JSON.parse(detailOutput);
      } catch (e) {
        console.log('    详情解析失败，跳过');
        await sleep(300);
        continue;
      }

      const detailItem = (detailData.data && detailData.data[0]) ? detailData.data[0] : {};
      let detailText = detailItem.detail || detailItem.content || detailItem.detail_oem || '';
      const pdfUrl = detailItem.pdf || '';

      // === 第1层：PDF 补全 ===
      let pdfEnriched = false;
      if (isPdfUrl(detailText)) {
        console.log(`    → 检测到 PDF 链接，正在下载提取正文...`);
        const extractedText = extractPdfText(detailText);
        if (extractedText) {
          detailText = extractedText;
          pdfEnriched = true;
          console.log(`    → PDF 提取成功: ${extractedText.length} 字`);
        } else {
          console.log(`    → PDF 提取失败，保留原始链接`);
        }
      }

      // === 第2层：附属文件标记 ===
      const companion = detectCompanion(title);

      // === 第3层：低内容标记 ===
      const lowContent = isLowContent(detailText) && !companion.isCompanion;

      // 判断是否为重新处理
      const isReprocessed = !!store.announcements[nosId];

      // 存储
      store.announcements[nosId] = {
        id: nosId,
        companyCode: company.code,
        companyName: company.name,
        title: title,
        date: formatDate(annDate),
        time: timeStr,
        type: annType,
        detail: detailText,
        pdfUrl: pdfUrl,
        pdfEnriched: pdfEnriched,
        isCompanion: companion.isCompanion,
        companionType: companion.companionType || null,
        companionReason: companion.companionReason || null,
        lowContent: lowContent,
        analysis: null,
        createdAt: isReprocessed ? store.announcements[nosId].createdAt : now.toISOString(),
        updatedAt: now.toISOString()
      };

      if (isReprocessed) {
        reprocessedCount++;
      } else {
        newCount++;
      }

      await sleep(300);
    }

    console.log('');
    await sleep(500);
  }

  // 5. 保存数据
  store.lastUpdated = now.toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');

  const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log('=== 采集完成 ===');
  console.log(`新采集: ${newCount} 条`);
  if (reprocessedCount > 0) console.log(`重新处理: ${reprocessedCount} 条（低内容→重新提取）`);
  console.log(`重复跳过: ${skipCount} 条`);
  console.log(`关键词匹配: ${filteredCount} 条（含已存在）`);
  console.log(`总耗时: ${totalElapsed}s`);
  console.log(`数据存储: ${DATA_FILE}`);
}

main().catch(e => {
  console.error('采集失败:', e);
  process.exit(1);
});
