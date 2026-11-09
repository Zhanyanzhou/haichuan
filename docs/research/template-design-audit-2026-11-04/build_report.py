"""从本次只读审查结果生成离线图文报告，不访问网络或业务接口。"""
from pathlib import Path
import base64
import html
import json
from collections import Counter

base = Path(__file__).resolve().parent
root = base.parents[2]
data = json.loads((base / 'findings.json').read_text(encoding='utf-8'))
escape = html.escape
counts = Counter(item['priority'] for item in data['findings'])
total = len(data['findings'])
images = sorted({name for item in data['findings'] for name in item['images']})
for name in images:
    assert (base / name).is_file(), name

def paras(items):
    return '<ul>' + ''.join('<li>' + escape(item) + '</li>' for item in items) + '</ul>'

def source_link(source):
    path, sep, line = source.rpartition(':')
    if not sep or not line.isdigit():
        path, line = source, ''
    target = (root / path).as_posix()
    return f'<li><code>{escape(source)}</code></li>'

def image_html(name, identifier):
    payload = base64.b64encode((base / name).read_bytes()).decode('ascii')
    return f'<figure><a href="data:image/png;base64,{payload}" target="_blank" aria-label="打开{identifier}原始截图"><img loading="lazy" width="1912" height="901" src="data:image/png;base64,{payload}" alt="{identifier}现场截图：{escape(name)}"></a><figcaption>{escape(name)} · 本轮 Edge 原始截图</figcaption></figure>'

findings_html = []
md = [f'# {data["title"]}', '', data['date'], '', f'**结论：{data["verdict"]}**', '',
      f'共{total}项：P1优先修复{counts["P1"]}项、P2影响效率与可靠性{counts["P2"]}项、P3信息组织{counts["P3"]}项。严重级别是本次体验审查的排序，不等同于生产事故等级。', '',
      '## 范围与方法', '', data['scope'], '', data['method'], '', data['limits'], '',
      '## 实际检查路径', '']
for number, step, result in data['steps']:
    md += [f'{number}. **{step}**：{result}', '']
md += ['## 逐项问题', '']
for item in data['findings']:
    identifier = item['id']
    body = ''.join(f'<div class="field"><h3>{label}</h3><p>{escape(item[key])}</p></div>' for key, label in [('observed','现场表现与复现'),('impact','对操作人员的影响'),('recommendation','建议'),('acceptance','修复后的验收')])
    shots = ''.join(image_html(name, identifier) for name in item['images'])
    sources = '<details class="sources"><summary>代码与规则定位</summary><ul>' + ''.join(source_link(source) for source in item['sources']) + '</ul></details>' if item['sources'] else ''
    findings_html.append(f'<article id="{identifier}" data-priority="{item["priority"]}"><div class="eyebrow">{identifier} / {item["priority"]} · {escape(item["kind"])}</div><h2>{escape(item["title"])}</h2>{body}<details class="screens"><summary>查看现场截图（{len(item["images"])}张）</summary>{shots}</details>{sources}</article>')
    md += [f'### {identifier} · {item["priority"]} · {item["title"]}', '', f'证据级别：{item["kind"]}', '']
    for key,label in [('observed','现场表现与复现'),('impact','对操作人员的影响'),('recommendation','建议'),('acceptance','修复后的验收')]:
        md += [f'**{label}：** {item[key]}', '']
    for name in item['images']:
        md += [f'![{identifier}现场截图]({(base / name).as_posix()})', '']
    if item['sources']:
        md += ['代码与规则定位：', '']
        for source in item['sources']:
            path, sep, line = source.rpartition(':')
            if not sep or not line.isdigit():
                path, line = source, ''
            target = (root / path).as_posix() + (':' + line if line else '')
            md += [f'- [{source}]({target})']
        md += ['']

for key,title in [('strengths','保留的有效设计'),('notBugs','未当作确定缺陷的现象'),('order','推荐修复顺序')]:
    md += ['## ' + title, ''] + ['- ' + item for item in data[key]] + ['']
md += ['## 证据与边界', '', f'完整离线图文版：[report.html]({(base / "report.html").as_posix()})。问题结构化数据：[findings.json]({(base / "findings.json").as_posix()})。正文引用{len(images)}张本轮原始截图；目录另保留过程截图。', '',
       '本报告不宣称已穷尽所有输入组合。原有模板、草稿和未提交代码均保留。结束时回到页面首屏桌面1440×810，服务端草稿已保存，保存模板按钮禁用。没有进行任何业务持久化或发布。', '',
       '静态源代码定位按检查时工作区解释；开发服务器存在既有热更新历史，后续修改可能使行号移动。P1条目以本轮实际操作和截图为主要证据。', '']
(base / 'report.md').write_text('\n'.join(md), encoding='utf-8')

style = '''
:root{color-scheme:light;--ink:#1c1e20;--muted:#596167;--line:#dce0e2;--paper:#fff;--soft:#f4f6f6;--accent:#624d29}*{box-sizing:border-box}body{margin:0;font:15px/1.85 system-ui,"Microsoft YaHei",sans-serif;background:var(--paper);color:var(--ink)}a{color:inherit}aside{position:fixed;inset:0 auto 0 0;width:250px;background:var(--soft);padding:32px 24px;overflow:auto;border-right:1px solid var(--line)}aside strong{display:block;margin:0 0 16px}aside a{display:block;text-decoration:none;padding:9px 0;line-height:1.5;font-size:13px;color:var(--muted)}aside a:hover{color:var(--ink);text-decoration:underline}main{margin-left:250px;max-width:1250px;padding:44px 56px 100px}h1{font-size:30px;line-height:1.4;margin:10px 0 20px;font-weight:600}h2{font-size:22px;line-height:1.5;margin:8px 0 24px}h3{font-size:14px;margin:0 0 6px;font-weight:650}p{margin:0 0 18px}.eyebrow{font-size:12px;letter-spacing:.02em;color:var(--muted)}.lead{font-size:19px;line-height:1.8;max-width:850px}.counts{display:flex;gap:28px;padding:22px 0;margin:20px 0;border-block:1px solid var(--line)}.counts strong{font-size:24px;margin-right:8px}.counts span{font-size:13px;color:var(--muted)}section{margin:40px 0}li{margin:8px 0}article{border-top:1px solid var(--line);padding:36px 0;scroll-margin-top:80px}.field{display:grid;grid-template-columns:140px 1fr;gap:18px;margin:18px 0}.field p{margin:0}.field h3{color:var(--muted)}.filters{position:sticky;top:0;background:var(--paper);z-index:2;border-block:1px solid var(--line);padding:12px 0;display:flex;align-items:center;gap:9px;flex-wrap:wrap}button{font:inherit;background:var(--paper);border:1px solid var(--line);padding:6px 16px;cursor:pointer}button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}.filters span{font-size:12px;color:var(--muted);margin-left:auto}details{margin:18px 0}summary{cursor:pointer;font-size:14px;color:var(--accent);padding:9px 0}figure{margin:20px 0}img{display:block;width:100%;height:auto;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted);margin-top:7px}code{font-size:12px;overflow-wrap:anywhere}.foot{font-size:13px;color:var(--muted);padding-top:24px;border-top:1px solid var(--line)}[hidden]{display:none!important}@media(max-width:950px){aside{display:none}main{margin:0;padding:26px 22px}.field{grid-template-columns:1fr;gap:4px}h1{font-size:25px}.counts{gap:15px}}@media print{aside,.filters{display:none}main{margin:0;padding:0}article{break-inside:avoid}.screens{break-inside:auto}}
'''
steps_html = '<ol>' + ''.join(f'<li><b>{escape(step)}</b> — {escape(result)}</li>' for _,step,result in data['steps']) + '</ol>'
nav = '<strong>模板设计体验审查</strong><a href="#scope">范围与证据边界</a><a href="#steps">实际检查路径</a>' + ''.join(f'<a href="#{item["id"]}">{item["id"]} · {escape(item["title"])}</a>' for item in data['findings']) + '<a href="#order">修复顺序与保留项</a>'
document = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(data['title'])} · 2026-11-04</title><style>{style}</style></head><body><aside aria-label="报告目录">{nav}</aside><main><header><div class="eyebrow">现场体验审查 / {escape(data['date'])} / 本地开发页面</div><h1>{escape(data['title'])}</h1><p class="lead">{escape(data['verdict'])}</p><div class="counts"><div><strong>4</strong><span>P1 优先修复</span></div><div><strong>{counts["P2"]}</strong><span>P2 效率与可靠性</span></div><div><strong>2</strong><span>P3 信息组织</span></div></div><p>共{total}项。严重级别是本次体验审查的排序，不等同于生产事故等级。浏览器复现、静态原因及未验证的写入风险已分别标明。</p></header><section id="scope"><h2>范围与证据边界</h2><p>{escape(data['scope'])}</p><p>{escape(data['method'])}</p><p>{escape(data['limits'])}</p></section><section id="steps"><h2>实际检查路径</h2>{steps_html}</section><div class="filters" role="group" aria-label="按优先级筛选"><button data-filter="all" aria-pressed="true">全部{total}项</button><button data-filter="P1" aria-pressed="false">P1 · 4项</button><button data-filter="P2" aria-pressed="false">P2 · {counts["P2"]}项</button><button data-filter="P3" aria-pressed="false">P3 · 2项</button><span>展开截图查看原始现场</span></div>{''.join(findings_html)}<section id="order"><h2>推荐修复顺序</h2>{paras(data['order'])}<h2>保留的有效设计</h2>{paras(data['strengths'])}<h2>未当作确定缺陷的现象</h2>{paras(data['notBugs'])}</section><footer class="foot"><p>正文引用{len(images)}张本轮原始截图。全部图片嵌入本文件，离线可读。结构化清单为同目录findings.json，文字交接版为report.md。</p><p>本报告不宣称已穷尽所有输入组合。检查结束时回到页面首屏桌面1440×810，服务端草稿已保存、保存模板按钮禁用；没有进行业务持久化或发布。代码定位按检查时工作区解释，后续修改可能使行号移动。</p></footer></main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{{const value=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('article[data-priority]').forEach(a=>a.hidden=value!=='all'&&a.dataset.priority!==value);}}));</script></body></html>'''
(base / 'report.html').write_text(document, encoding='utf-8')
print(json.dumps({'findings':len(data['findings']),'priorities':dict(counts),'embedded_screenshots':len(images),'html_bytes':(base/'report.html').stat().st_size,'outputs':['report.md','report.html']},ensure_ascii=False))
