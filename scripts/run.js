#!/usr/bin/env node
/**
 * 顺德上市公司公告监测 — 统一入口脚本
 *
 * 用法:
 *   node run.js           → 按顺序执行全部 5 步
 *   node run.js collect   → 只执行数据采集
 *   node run.js --force   → 强制全量重新分析（跳过去重检查）
 *
 * 步骤依赖链:
 *   collect → merge → analyze → score → report
 *   前一步的输出文件 = 后一步的输入文件
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(SKILL_DIR, 'data');

// 步骤定义: file + 前置条件（输入文件）+ 输出文件（用于校验）
const STEPS = [
  {
    name: 'collect',
    file: 'collect.js',
    label: '数据采集',
    inputs: ['config/companies.json'],
    outputs: ['data/shunde_monitor.json'],
    desc: '从腾讯自选股拉取28家顺德公司公告，按四类关键词过滤并去重存储',
  },
  {
    name: 'merge',
    file: 'merge_events.js',
    label: '公告合并',
    inputs: ['data/shunde_monitor.json', 'data/broker_baseline.json'],
    outputs: ['data/merged_events.json'],
    desc: '按"公司+类型+计划名称"将公告合并为结构化事件',
  },
  {
    name: 'analyze',
    file: 'deep_analysis.js',
    label: '六维度分析',
    inputs: ['data/merged_events.json', 'data/broker_baseline.json'],
    outputs: ['data/reports/deep_analysis_results.json'],
    desc: '对每个事件进行背景/动作/对象/金额/时间/合作方六维度深度分析',
  },
  {
    name: 'score',
    file: 'scoring_and_excel.js',
    label: '评分与Excel',
    inputs: ['data/reports/deep_analysis_results.json', 'data/broker_baseline.json'],
    outputs: ['data/reports/shunde_deep_analysis.xlsx'],
    desc: '五维度加权评分并生成 Excel 报告',
  },
  {
    name: 'report',
    file: 'generate_html_report.js',
    label: 'HTML看板',
    inputs: ['data/reports/scored_events.json', 'data/broker_baseline.json'],
    outputs: ['outputs/shunde_top5_report.html'],
    desc: '生成 TOP5 静态 HTML 看板',
  },
];

const target = process.argv[2] || 'all';
const isForce = process.argv.includes('--force');

// ============ 前置检查 ============

function checkPrerequisites(targetStep) {
  const errors = [];

  for (const step of STEPS) {
    if (targetStep !== 'all' && step.name !== targetStep) continue;

    // 检查前置输入文件
    for (const input of step.inputs) {
      const inputPath = path.join(SKILL_DIR, input);
      if (!fs.existsSync(inputPath)) {
        if (step.name === 'collect') {
          // collect 的输入是 config/companies.json，这是必选项
          errors.push(`[${step.label}] 缺少输入文件: ${input} (${inputPath})`);
        } else {
          // 后续步骤的输入是上一步输出，给出明确提示
          errors.push(`[${step.label}] 缺少输入文件: ${input} → 请先运行上一步 "npm run ${getPrevStep(step.name)}"`);
        }
      }
    }

    if (targetStep !== 'all') break;
  }

  if (errors.length > 0) {
    console.log('');
    console.log('=== 前置检查失败 ===');
    errors.forEach(e => console.log(e));
    return false;
  }
  return true;
}

function getPrevStep(name) {
  const idx = STEPS.findIndex(s => s.name === name);
  return idx > 0 ? STEPS[idx - 1].name : null;
}

// ============ 主流程 ============

function run() {
  const startTime = Date.now();

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  顺德上市公司公告智能监测 v2.0         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  if (isForce) {
    console.log('[强制模式] 将跳过增量检查，全量重新分析');
  }

  // 确保数据目录存在
  for (const dir of ['data', 'data/reports', 'outputs']) {
    const fullPath = path.join(SKILL_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`[初始化] 创建目录: ${dir}`);
    }
  }

  // 前置检查
  console.log('');
  console.log('=== 前置检查 ===');
  if (!checkPrerequisites(target)) {
    process.exit(1);
  }
  console.log('✅ 前置检查通过');

  // 选择要执行的步骤
  let stepsToRun;
  if (target === 'all') {
    stepsToRun = STEPS;
  } else {
    const step = STEPS.find(s => s.name === target);
    if (!step) {
      console.error(`未知步骤: ${target}`);
      console.error(`可用步骤: ${STEPS.map(s => s.name).join(' | ')} | all`);
      process.exit(1);
    }
    stepsToRun = [step];
  }

  console.log(`\n=== 执行: ${target === 'all' ? '全量流程' : target} ===`);
  console.log(`共 ${stepsToRun.length} 步\n`);

  let failed = false;

  for (let i = 0; i < stepsToRun.length; i++) {
    const step = stepsToRun[i];
    const stepNum = i + 1;

    console.log(`┌─────────────────────────────────────────┐`);
    console.log(`│ [${stepNum}/${stepsToRun.length}] ${step.label}: ${step.desc}`);
    console.log(`└─────────────────────────────────────────┘`);

    const scriptPath = path.join(__dirname, step.file);

    try {
      // 构建环境变量（传递 force 标志）
      const env = { ...process.env, SHUNDE_FORCE: isForce ? '1' : '0' };

      execSync(`"${process.execPath}" "${scriptPath}"`, {
        stdio: 'inherit',
        env,
        timeout: 600000, // 10 分钟超时
        cwd: SKILL_DIR,
      });

      // 验证输出文件
      for (const output of step.outputs) {
        const outputPath = path.join(SKILL_DIR, output);
        if (!fs.existsSync(outputPath)) {
          console.error(`  ⚠ 输出文件未生成: ${output}`);
        }
      }

      console.log(`✅ ${step.label} 完成\n`);

      // estimated time
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ⏱ 已用时: ${elapsed}s\n`);
    } catch (e) {
      console.error(`❌ ${step.label} 失败`);
      console.error(`   ${e.message}`);

      if (target === 'all') {
        console.error('全量流程中断。请修复问题后重新运行，或从失败步骤继续：');
        console.error(`  npm run ${step.name}`);
      }

      failed = true;
      break;
    }
  }

  // 结果汇总
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('╔══════════════════════════════════════════╗');

  if (failed) {
    console.log('║  执行中断 — 请修复后重试               ║');
  } else {
    console.log('║  全部完成！                             ║');
    // 列出产出物
    console.log('║                                         ║');
    console.log('║  输出文件:                              ║');

    const deliverables = [
      { path: 'data/shunde_monitor.json', label: '原始公告数据' },
      { path: 'data/merged_events.json', label: '合并事件' },
      { path: 'data/reports/deep_analysis_results.json', label: '六维度分析结果' },
      { path: 'data/reports/shunde_deep_analysis.xlsx', label: 'Excel 报告' },
      { path: 'outputs/shunde_top5_report.html', label: 'HTML 看板' },
    ];

    for (const d of deliverables) {
      const fullPath = path.join(SKILL_DIR, d.path);
      const status = fs.existsSync(fullPath) ? '✅' : '  ';
      console.log(`║  ${status} ${d.path} (${d.label})`);
    }
  }

  console.log(`║  ⏱ 总耗时: ${totalTime}s`);
  console.log('╚══════════════════════════════════════════╝');
}

run();
