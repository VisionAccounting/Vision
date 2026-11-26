#!/usr/bin/env python3
"""يولّد صفحة فهرس (index.html) تضم كل التطبيقات التي في apps/ ولكل منها ملف app.json.

الاستخدام:  python3 apps/build-index.py [مجلد_الإخراج]
مثال app.json:
{ "title": {"ar": "...", "en": "..."}, "desc": {"ar": "...", "en": "..."}, "icon": "icon-192.png" }
"""
import html, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT

cards = []
for name in sorted(os.listdir(ROOT)):
    meta_path = os.path.join(ROOT, name, "app.json")
    if name.startswith(("_", ".")) or not os.path.isfile(meta_path):
        continue
    with open(meta_path, encoding="utf8") as f:
        m = json.load(f)
    icon = m.get("icon")
    img = f'<img src="{html.escape(name)}/{html.escape(icon)}" alt="" width="56" height="56">' if icon else ""
    cards.append(
        f'<a class="card" href="{html.escape(name)}/">{img}<div><b>{html.escape(m["title"]["ar"])}</b>'
        f'<span>{html.escape(m["title"]["en"])}</span><small>{html.escape(m["desc"]["ar"])}</small>'
        f'<small>{html.escape(m["desc"]["en"])}</small></div></a>'
    )

page = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Apps</title>
<style>
:root{{--bg:#f6f5f1;--card:#fff;--ink:#1c1917;--mut:#57534e;--line:#e4e1dc;--acc:#a16207}}
@media(prefers-color-scheme:dark){{:root{{--bg:#121110;--card:#1c1b19;--ink:#f5f5f4;--mut:#c7c3bd;--line:#34312d;--acc:#f2c14e}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px max(16px,env(safe-area-inset-left))}}
main{{max-width:760px;margin:0 auto}} h1{{font-size:22px;margin:0 0 4px}} p{{color:var(--mut);margin:0 0 18px}}
.card{{display:flex;gap:14px;align-items:center;padding:14px;margin-bottom:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;text-decoration:none;color:inherit}}
.card:hover{{border-color:var(--acc)}} .card img{{border-radius:12px}} .card div{{display:flex;flex-direction:column;gap:2px;min-width:0}}
.card span{{color:var(--acc);font-size:13px}} .card small{{color:var(--mut)}}
</style></head><body><main>
<h1>التطبيقات / Apps</h1><p>اختر تطبيقاً · Choose an app</p>
{''.join(cards) if cards else '<p>لا توجد تطبيقات بعد · No apps yet</p>'}
</main></body></html>
"""
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "index.html"), "w", encoding="utf8") as f:
    f.write(page)
print(f"catalog: {len(cards)} app(s) -> {os.path.join(OUT, 'index.html')}")
