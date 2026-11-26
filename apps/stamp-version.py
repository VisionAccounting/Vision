#!/usr/bin/env python3
"""يختم رقم إصدار لأي تطبيق يتكوّن من ملف index.html واحد (بدون خطوة بناء).

الاستخدام:  python3 apps/stamp-version.py apps/<اسم_التطبيق>
- يحسب بصمة من محتوى index.html ويكتبها في السطر:  const APP_VERSION = "...";
- ينشئ/يحدّث version.json بجانبه، فيكتشف التطبيق المفتوح في المتصفح وجود إصدار جديد.
- الرقم الأساسي من ملف VERSION إن وُجد (وإلا 1.0.0).
"""
import datetime, hashlib, json, os, re, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
d = sys.argv[1]
p = os.path.join(d, "index.html")
s = open(p, encoding="utf8").read()
pat = re.compile(r'(const APP_VERSION = ")[^"]*(")')
if not pat.search(s):
    sys.exit('لم أجد السطر: const APP_VERSION = "..."; انسخه من apps/_template/index.html')
digest = hashlib.sha1(pat.sub(r"\1\2", s).encode("utf8")).hexdigest()[:8]
vf = os.path.join(d, "VERSION")
base = open(vf).read().strip() if os.path.isfile(vf) else "1.0.0"
ver = f"{base}-{digest}"
open(p, "w", encoding="utf8").write(pat.sub(lambda m: m.group(1) + ver + m.group(2), s))
json.dump({"version": ver, "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
          open(os.path.join(d, "version.json"), "w"))
print("version", ver)
