#!/usr/bin/env python3
"""تشغيل البرامج محلياً على جهازك مع سحب أي تحديث يُدفع إلى GitHub تلقائياً.

الإعداد لمرة واحدة (على جهازك، ويلزم git و python 3):
    git clone https://github.com/VisionAccounting/Vision
    cd Vision
    git checkout claude/gold-price-forecast-app-j0q271     # أو main بعد الدمج

التشغيل:
    python3 apps/sync-local.py            # ويندوز:  python apps\\sync-local.py
ثم افتح:  http://localhost:8080/gold-quant/

كل دقيقة يفحص السكربت الفرع الحالي على GitHub؛ إن وُجد جديد يسحبه (fast-forward فقط)،
وعند الدفع من جلسة Claude يظهر في البرنامج المفتوح شريط «يتوفر إصدار جديد — تحديث الآن».
خيارات:  --port 8080  --interval 60  --once (مزامنة مرة واحدة ثم خروج)  --no-serve
"""
import argparse, functools, http.server, json, os, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, ".."))


def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True)


def sync():
    """يسحب الجديد من الفرع الحالي. يرجع (حدث_تحديث, رسالة)."""
    br = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if not br or br == "HEAD":
        return False, "لست على فرع (detached HEAD)؛ نفّذ git checkout <الفرع>"
    f = git("fetch", "origin", br)
    if f.returncode:
        return False, "تعذر الاتصال بـ GitHub: " + (f.stderr.strip().splitlines() or ["?"])[-1]
    behind = git("rev-list", "--count", f"HEAD..origin/{br}").stdout.strip()
    if behind in ("", "0"):
        return False, f"محدّث ({br})"
    m = git("merge", "--ff-only", f"origin/{br}")
    if m.returncode:
        return False, "تعذر الدمج التلقائي (لديك تعديلات محلية؟): " + (m.stderr.strip().splitlines() or ["?"])[-1]
    return True, f"تم سحب {behind} تحديث/تحديثات من {br}"


def current_version():
    try:
        with open(os.path.join(ROOT, "gold-quant", "version.json"), encoding="utf8") as f:
            return json.load(f).get("version", "?")
    except Exception:
        return "?"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--interval", type=int, default=60)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--no-serve", action="store_true")
    a = ap.parse_args()

    updated, msg = sync()
    print(msg)
    if a.once:
        print("version", current_version())
        return 0
    if not a.no_serve:
        handler = functools.partial(NoCache, directory=ROOT)
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        print(f"افتح:  http://localhost:{a.port}/gold-quant/   (Ctrl+C للإيقاف)")
        print("ملاحظة: ثبّت المنفذ نفسه دائماً حتى تبقى بياناتك المحفوظة في المتصفح.")
    print("الإصدار الحالي:", current_version())
    try:
        while True:
            time.sleep(a.interval)
            updated, msg = sync()
            if updated:
                print(time.strftime("%H:%M:%S"), msg, "← الإصدار", current_version())
    except KeyboardInterrupt:
        print("\nتم الإيقاف")
    return 0


if __name__ == "__main__":
    sys.exit(main())
