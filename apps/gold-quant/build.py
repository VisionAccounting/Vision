#!/usr/bin/env python3
"""يبني apps/gold-quant/index.html (ملف واحد) من مجلد src/ ويكتب version.json.

الاستخدام:  python3 apps/gold-quant/build.py
المتطلبات:  python3 و node/npx (لتوليد CSS الاحتياطي لـ Tailwind مرة عند كل بناء).
رقم الإصدار = محتوى ملف VERSION + بصمة قصيرة من الكود، فيتغير تلقائياً مع أي تعديل.
"""
import datetime, hashlib, json, os, shutil, subprocess, sys

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, "src")
TMP = os.path.join(D, ".build")
JS_ORDER = ["i18n.js", "math.js", "core.js", "ui.js", "research.js"]


def read(path):
    with open(path, encoding="utf8") as f:
        return f.read()


def tailwind_cmd():
    local = shutil.which("tailwindcss")
    if local:
        return [local]
    return ["npx", "--yes", "tailwindcss@3.4.17"]


def main():
    os.makedirs(TMP, exist_ok=True)
    base = read(os.path.join(D, "VERSION")).strip()
    js = "\n".join(read(os.path.join(SRC, f)) for f in JS_ORDER)
    doc = read(os.path.join(SRC, "head.html")) + read(os.path.join(SRC, "body.html")) \
        + '\n<script>\n"use strict";\n' + js + "\n</script>\n</body>\n</html>\n"
    digest = hashlib.sha1(doc.encode("utf8")).hexdigest()[:8]
    version = f"{base}-{digest}"
    doc = doc.replace("__APP_VERSION__", version)

    with open(os.path.join(TMP, "assembled.html"), "w", encoding="utf8") as f:
        f.write(doc)
    shutil.copy(os.path.join(SRC, "tailwind.config.js"), TMP)
    shutil.copy(os.path.join(SRC, "tw.css"), TMP)
    subprocess.run(tailwind_cmd() + ["-c", "tailwind.config.js", "-i", "tw.css", "-o", "tw.out.css", "--minify"],
                   check=True, cwd=TMP, capture_output=True)
    css = read(os.path.join(TMP, "tw.out.css")).replace("</style>", "")
    out = doc.replace("/*TWCSS*/", '<style id="tw-fallback">' + css + "</style>")

    with open(os.path.join(D, "index.html"), "w", encoding="utf8") as f:
        f.write(out)
    with open(os.path.join(D, "version.json"), "w", encoding="utf8") as f:
        json.dump({"version": version, "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}, f)
    print(f"built index.html {len(out)//1024} KB · version {version}")


if __name__ == "__main__":
    sys.exit(main())
