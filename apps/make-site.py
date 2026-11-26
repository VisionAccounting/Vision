#!/usr/bin/env python3
"""يجمّع الموقع الجاهز للنشر في مجلد (افتراضياً dist-apps/) من apps/ دون المصادر وملفات البناء.

الاستخدام:  python3 apps/make-site.py [مجلد_الإخراج]
يصلح لأي استضافة ثابتة (Cloudflare Pages أو Netlify أو Firebase ...): اجعل أمر البناء
    python3 apps/make-site.py dist-apps
ومجلد النشر  dist-apps
"""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "dist-apps"))

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
shutil.copytree(
    ROOT, OUT,
    ignore=shutil.ignore_patterns("src", ".build", "_*", "*.py", "VERSION", "README.md", "__pycache__"),
)
subprocess.run([sys.executable, os.path.join(ROOT, "build-index.py"), OUT], check=True)
print("site ready:", OUT, "->", sorted(os.listdir(OUT)))
