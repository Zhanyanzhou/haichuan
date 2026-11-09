#!/usr/bin/env node
// 状态栏：模型档位 · 上下文水位 · 成本估算（代理数据仅供相对量级参考）。
// current_usage 在首次 API 调用前与 /compact 后为 null，全部兜底为 0。
try {
  const fs = require('fs');
  const j = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, '').trim());
  const ctx = j.context_window || {};
  const used = ctx.current_usage || {};
  const inTok = (used.input_tokens || 0) + (used.cache_creation_input_tokens || 0) + (used.cache_read_input_tokens || 0);
  const kTok = inTok >= 1000 ? Math.floor(inTok / 1000) + 'K' : String(inTok);
  // 与 token-guard.cjs 同口径：140K 提醒、180K 红线，仅提示水位，不代表压缩阈值或任务终止条件
  const WARN = 140000;
  const BUDGET = 180000;
  const warn = inTok >= BUDGET ? ' ‼' : inTok >= WARN ? ' ⚠' : '';
  const gauge = inTok > 0 ? kTok + '/' + (BUDGET / 1000) + 'K' + warn : '';
  const cost = j.cost && j.cost.total_cost_usd != null ? '$' + j.cost.total_cost_usd.toFixed(2) : '';
  const model = (j.model && j.model.display_name) || '';
  const parts = [model, gauge, cost].filter(Boolean);
  console.log(parts.length ? parts.join(' · ') : '');
} catch { console.log(''); }
