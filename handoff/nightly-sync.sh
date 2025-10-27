#!/bin/bash
set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATE=$(date +%Y-%m-%d)
HANDOFF_MD="$ROOT_DIR/Handoff.md"
LOG_JSON="$ROOT_DIR/handoff-log.json"
echo "🌙 Nightly sync for $DATE"
python3 - <<'PY'
import json, re, os
root = os.environ.get("ROOT_DIR")
date = os.environ.get("DATE")
md_path = os.path.join(root, "Handoff.md")
json_path = os.path.join(root, "handoff-log.json")
with open(md_path, "r", encoding="utf-8") as f:
    md = f.read()
def extract_list(names):
    import re
    pattern = r"(?:^|\n)##\s*(?:" + "|".join(map(re.escape, names)) + r")\s*\n(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, md, re.S|re.M)
    if not m: return []
    items = []
    for line in m.group(1).splitlines():
        s=line.strip()
        if s.startswith("-") or s.startswith("*"):
            items.append(s.lstrip("-* ").strip())
    return items
wins = extract_list(["1) Wins","1) Logros / Wins","Wins"])
stumbles = extract_list(["2) Stumbles","2) Dificultades / Stumbles","Stumbles"])
tasks = extract_list(["4) Top 3 Tasks for Tomorrow","4) Próximas Tareas / Next Tasks","Top 3 Tasks for Tomorrow"])
entry = {"date": date, "wins": wins, "stumbles": stumbles, "nextTasks": tasks}
if os.path.exists(json_path):
    try:
        data=json.load(open(json_path,"r",encoding="utf-8"))
    except Exception:
        data=[]
else:
    data=[]
data = [e for e in data if e.get("date")!=date]
data.append(entry)
with open(json_path,"w",encoding="utf-8") as f:
    json.dump(data,f,ensure_ascii=False,indent=2)
print("Appended", entry)
PY
cd "$ROOT_DIR/.."
git add handoff/Handoff.md handoff/handoff-log.json handoff/dashboard.html || true
git commit -m "Nightly handoff update: $DATE" || echo "No changes to commit"
git push || echo "Push skipped"
echo "✅ Done"
