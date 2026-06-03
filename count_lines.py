"""
代码行数统计工具
用法:
    python count_lines.py                统计当前代码
    python count_lines.py --record       记录今日快照到历史
    python count_lines.py --history      查看每日历史变化
    python count_lines.py --diff baseline.json   与基线对比
    python count_lines.py --include-docs         包含文档文件
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent
HISTORY_FILE = ROOT / ".line_history.json"

EXCLUDE_DIRS = {
    "node_modules", ".git", ".turbo", "dist", ".next", "build",
    "coverage", "__pycache__", ".changeset", ".github", ".husky",
    ".vscode", "migrations", "docs", "public", ".expo",
    "release", "out", "ndk", ".cxx",
}

DOC_EXTENSIONS = {".md", ".mdx", ".rst", ".txt", ".pdf"}

CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".css", ".scss", ".less",
    ".html", ".htm",
    ".json",
    ".yaml", ".yml",
    ".sql",
    ".toml",
    ".sh", ".bash", ".ps1", ".bat",
    ".py",
    ".kt", ".kts", ".java", ".xml", ".gradle", ".properties",
}

CONFIG_FILES = {
    ".editorconfig", ".gitattributes", ".gitignore", ".npmrc", ".nvmrc",
    ".prettierignore", ".prettierrc", ".eslintrc", ".eslintignore",
    "Dockerfile", "Makefile",
}


def get_extension(path: Path) -> str:
    name = path.name.lower()
    suffix = path.suffix.lower()
    if suffix:
        return suffix.lstrip(".")
    if name in CONFIG_FILES:
        return name.lstrip(".")
    return ""


def should_include(path: Path, include_docs: bool) -> str:
    ext = path.suffix.lower()
    name = path.name.lower()
    if not ext and name not in CONFIG_FILES:
        return ""
    cat = get_extension(path)
    if ext in CODE_EXTENSIONS or name in CONFIG_FILES:
        return cat
    if include_docs and ext in DOC_EXTENSIONS:
        return cat
    return ""


def count_lines(filepath: Path) -> int:
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0


def scan(root: Path, include_docs: bool) -> dict:
    stats = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith(".")]
        for filename in filenames:
            filepath = Path(dirpath) / filename
            cat = should_include(filepath, include_docs)
            if not cat:
                continue
            lines = count_lines(filepath)
            if lines == 0:
                continue
            entry = stats.setdefault(cat, {"files": 0, "lines": 0})
            entry["files"] += 1
            entry["lines"] += lines
    return stats


def print_table(stats: dict):
    total_files = sum(v["files"] for v in stats.values())
    total_lines = sum(v["lines"] for v in stats.values())
    items = sorted(stats.items(), key=lambda x: x[1]["lines"], reverse=True)

    w_lang = max(max(len(k) for k in stats), 12)
    header = f"{'Language':<{w_lang}} {'Files':>8} {'Lines':>10}  {'%':>7}"
    sep = "-" * len(header)

    print("=" * len(header))
    print(header)
    print(sep)
    for lang, data in items:
        pct = (data["lines"] / total_lines * 100) if total_lines else 0
        print(f"{lang:<{w_lang}} {data['files']:>8} {data['lines']:>10,}  {pct:>6.2f}%")
    print(sep)
    print(f"{'TOTAL':<{w_lang}} {total_files:>8} {total_lines:>10,}  {'100.00%':>7}")
    print("=" * len(header))
    print(f"\n  \u2705 {total_files} files, {total_lines:,} lines")


def print_diff(stats_now: dict, stats_before: dict):
    all_keys = sorted(set(stats_now) | set(stats_before),
                      key=lambda k: stats_now.get(k, {}).get("lines", 0), reverse=True)

    print(f"\n{'Language':<12} {'Before':>9} {'After':>9} {'Delta':>9} {'Files+\u2193':>9}")
    print("-" * 55)

    total_before_f = total_before_l = total_after_f = total_after_l = 0
    for lang in all_keys:
        b = stats_before.get(lang, {"files": 0, "lines": 0})
        a = stats_now.get(lang, {"files": 0, "lines": 0})
        delta = a["lines"] - b["lines"]
        df = a["files"] - b["files"]
        total_before_f += b["files"]
        total_before_l += b["lines"]
        total_after_f += a["files"]
        total_after_l += a["lines"]
        sign = "+" if delta >= 0 else ""
        f_sign = "+" if df >= 0 else ""
        print(f"{lang:<12} {b['lines']:>8,} {a['lines']:>8,} {sign}{delta:>8,} {f_sign}{df:>8}")

    delta_l = total_after_l - total_before_l
    delta_f = total_after_f - total_before_f
    sign_l = "+" if delta_l >= 0 else ""
    sign_f = "+" if delta_f >= 0 else ""
    x = total_after_l / total_before_l if total_before_l else 0
    print("-" * 55)
    print(f"{'TOTAL':<12} {total_before_l:>8,} {total_after_l:>8,} {sign_l}{delta_l:>8,} {sign_f}{delta_f:>8}")
    print(f"\n  \U0001f4c8 {x:.1f}x growth | {total_before_f:,} \u2192 {total_after_f:,} files")


def load_history() -> list:
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(entries: list):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)


def record_today(stats: dict):
    today = datetime.now().strftime("%Y-%m-%d")
    entries = load_history()

    total_files = sum(v["files"] for v in stats.values())
    total_lines = sum(v["lines"] for v in stats.values())

    entry = {
        "date": today,
        "files": total_files,
        "lines": total_lines,
        "languages": {k: {"files": v["files"], "lines": v["lines"]} for k, v in stats.items()}
    }

    replaced = False
    for i, e in enumerate(entries):
        if e.get("date") == today:
            entries[i] = entry
            replaced = True
            break

    if not replaced:
        entries.append(entry)

    entries.sort(key=lambda e: e["date"])
    save_history(entries)

    return entry, replaced


def print_history():
    entries = load_history()
    if not entries:
        print("  \u26a0\ufe0f 还没有历史记录，先运行 --record 吧")
        return

    print(f"  \U0001f4c5 代码行数变化 ({entries[0]['date']} \u2192 {entries[-1]['date']})")
    print(f"  {'Date':<12} {'Files':>7} {'Lines':>10}  {'+\u0394Files':>9} {'+\u0394Lines':>10}")
    print(f"  {'-'*12} {'-'*7} {'-'*10}  {'-'*9} {'-'*10}")

    prev = None
    total_delta = 0
    for e in entries:
        date = e["date"]
        files = e["files"]
        lines = e.get("lines", sum(v["lines"] for v in e.get("languages", {}).values()))

        if prev:
            df = files - prev["files"]
            dl = lines - prev["lines"]
            sf = f"+{df}" if df >= 0 else str(df)
            sl = f"+{dl:,}" if dl >= 0 else f"{dl:,}"
            total_delta += dl
        else:
            sf = "---"
            sl = "---"

        marker = " \u2b50" if date == datetime.now().strftime("%Y-%m-%d") else ""
        print(f"  {date:<12} {files:>7} {lines:>10,}  {sf:>9} {sl:>10}{marker}")
        prev = {"files": files, "lines": lines}

    if len(entries) >= 2:
        first = entries[0]
        last = entries[-1]
        lines_f = sum(v["lines"] for v in first.get("languages", {}).values()) if first.get("languages") else first["lines"]
        lines_l = sum(v["lines"] for v in last.get("languages", {}).values()) if last.get("languages") else last["lines"]
        days = (datetime.strptime(last["date"], "%Y-%m-%d") - datetime.strptime(first["date"], "%Y-%m-%d")).days or 1
        print(f"\n  \U0001f4ca {len(entries):,} records over {days} days")
        print(f"  \U0001f680 Total growth: +{lines_l - lines_f:,} lines  |  ~{(lines_l - lines_f) // days:,} lines/day")


def main():
    p = argparse.ArgumentParser(description="代码行数统计")
    p.add_argument("--save", metavar="FILE", help="保存当前结果作为基线")
    p.add_argument("--diff", metavar="FILE", help="与基线文件对比")
    p.add_argument("--record", action="store_true", help="记录今日快照到历史")
    p.add_argument("--history", action="store_true", help="查看每日历史变化")
    p.add_argument("--include-docs", action="store_true", help="包含文档 (.md 等)")
    args = p.parse_args()

    if args.history:
        print_history()
        return

    include_docs = args.include_docs
    stats = scan(ROOT, include_docs)

    if args.diff:
        with open(args.diff, "r", encoding="utf-8") as f:
            baseline = json.load(f)
        print(f"\U0001f4ca 对比: {Path(args.diff).name}  (saved {baseline.get('_date', '?')})")
        print("=" * 55)
        print_table(stats)
        print_diff(stats, {k: v for k, v in baseline.items() if not k.startswith("_")})
        return

    print_table(stats)

    if args.save:
        stats["_date"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        stats["_include_docs"] = include_docs
        with open(args.save, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        print(f"  \U0001f4be 基线已保存到 {args.save}")

    if args.record:
        entry, replaced = record_today(stats)
        verb = "\u267b\ufe0f 已更新" if replaced else "\U0001f4dd 已记录"
        print(f"  {verb} {entry['date']} 快照: {entry['files']} files, {entry['lines']:,} lines")


if __name__ == "__main__":
    main()
