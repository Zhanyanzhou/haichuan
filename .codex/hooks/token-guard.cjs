#!/usr/bin/env node
// Token 成本护栏：PostToolUse 浏览器快照高消耗提醒 + Stop 水位提醒。
// 设计约束：任何异常静默退出、永不阻塞工具执行；状态存 %TEMP%，48 小时自动清理。
// 阈值只用于提醒，不是任务终止或新开会话的条件（见 CLAUDE.md Token 成本纪律）。
// 与 .claude/hooks/token-guard.cjs 同口径，两处需同步修改。
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.tmpdir(), 'claude-token-guard');
const WARN_TOKENS = 140000;
const BUDGET_TOKENS = 180000;
const FALLBACK_BYTES = 1.2 * 1024 * 1024;
const now = Date.now();

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, '').trim()); } catch { return null; }
}
function emit(obj) {
  try { fs.writeSync(1, JSON.stringify(obj)); } catch {} // 同步写，避免 process.exit 截断管道缓冲
}
function stateFile(sid) { return path.join(DIR, sid + '.json'); }
function loadState(sid) {
  const empty = {
    snap: 0,
    snapshotReminders: 0,
    warnReminders: 0,
    stopReminders: 0,
    ts: now
  };
  try { return { ...empty, ...JSON.parse(fs.readFileSync(stateFile(sid), 'utf8')) }; }
  catch { return empty; }
}
function saveState(sid, s) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    s.ts = now;
    fs.writeFileSync(stateFile(sid), JSON.stringify(s));
  } catch {}
}
function cleanup() {
  try {
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f);
      if (now - fs.statSync(p).mtimeMs > 48 * 3600e3) { try { fs.unlinkSync(p); } catch {} }
    }
  } catch {}
}

const input = readStdin();
if (!input || !input.session_id) process.exit(0);
const sid = String(input.session_id).replace(/[^a-zA-Z0-9_-]/g, '');
const st = loadState(sid);
cleanup();

if (input.hook_event_name === 'PostToolUse') {
  const t = input.tool_name || '';
  const isSnap = /take_snapshot|take_screenshot/.test(t);
  if (isSnap) st.snap++;

  if (isSnap && st.snap % 3 === 0 && st.snapshotReminders < 3) {
    st.snapshotReminders++;
    saveState(sid, st);
    emit({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `【token 纪律】本会话已 ${st.snap} 次浏览器快照/截图，每次 5-20K token 常驻上下文。继续前评估：evaluate_script 精准取值（CLAUDE.md Token 成本纪律）。若用户已知晓并接受成本，不再重复提醒。`
      }
    });
  } else {
    saveState(sid, st);
  }
  process.exit(0);
}

// 从转录尾部解析最近一次 usage，得当前上下文 token 水位（input+cache_creation+cache_read）
// 口径与 statusline 一致：对 BUDGET_TOKENS 提醒预算取百分比；取不到时回退到转录体积启发
// 注意 usage 含嵌套对象（如 server_tool_use），须花括号配对截取，不能用无嵌套正则
function lastUsageTokens(p) {
  try {
    const fd = fs.openSync(p, 'r');
    const len = fs.statSync(p).size;
    const buf = Buffer.alloc(Math.min(len, 524288));
    fs.readSync(fd, buf, 0, buf.length, Math.max(0, len - buf.length));
    fs.closeSync(fd);
    const s = buf.toString('utf8');
    let idx = s.lastIndexOf('"usage"');
    while (idx !== -1) {
      const open = s.indexOf('{', idx);
      if (open === -1) break;
      let depth = 0, end = -1;
      for (let i = open; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) break;
      try {
        const u = JSON.parse(s.slice(open, end + 1));
        const t = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        if (t > 0) return t;
      } catch {}
      idx = s.lastIndexOf('"usage"', idx - 1);
    }
  } catch {}
  return 0;
}

if (input.hook_event_name === 'Stop') {
  if (input.stop_hook_active) process.exit(0); // 防循环
  let size = 0;
  try { size = fs.statSync(input.transcript_path).size; } catch {}
  const ctxTok = lastUsageTokens(input.transcript_path);
  const pct = Math.floor((ctxTok / BUDGET_TOKENS) * 100);
  const warnHit = ctxTok >= WARN_TOKENS;
  const redlineHit = ctxTok >= BUDGET_TOKENS;
  const fallbackHit = ctxTok === 0 && size > FALLBACK_BYTES;

  if ((redlineHit || fallbackHit) && st.stopReminders < 3) {
    st.stopReminders++;
    saveState(sid, st);
    const gauge = ctxTok > 0
      ? `水位 ~${Math.floor(ctxTok / 1000)}K/${Math.floor(BUDGET_TOKENS / 1000)}K（${pct}%），‼红线`
      : `转录 ${(size / 1048576).toFixed(1)}MB（未取到 usage）`;
    emit({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: `【token 纪律】${gauge}，达到设定提醒预算。按当前实际 usage 与任务状态处理：保留目标、已验证结论和下一动作，避免无关大读取；是否新开会话由用户决定，水位本身不是终止任务或缩减已授权范围的条件。`
      }
    });
  } else if (warnHit && st.warnReminders < 1) {
    st.warnReminders++;
    saveState(sid, st);
    emit({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: `【token 纪律】水位 ~${Math.floor(ctxTok / 1000)}K/${Math.floor(BUDGET_TOKENS / 1000)}K（${pct}%），达到提醒阈值。继续保持按阅读包取证、只留目标片段；不因此停止扩展已授权范围内的工作，也不以此为由提前收尾。`
      }
    });
  }
  process.exit(0);
}

process.exit(0);
