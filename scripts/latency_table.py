#!/usr/bin/env python3
"""latency_table.py -- run pipestats on every windowed trace (results/runs/pv_w*_*)
and write results/latency.csv: one row per (width, workload) with throughput,
mean/median/p90 fetch-to-commit latency and the per-stage delays."""
import csv, glob, json, os, re, subprocess, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
summary = {r["name"]: r for r in csv.DictReader(open(os.path.join(R, "results", "summary.csv")))}
rows = []
for d in sorted(glob.glob(os.path.join(R, "results", "runs", "pv_w*_*"))):
    m = re.match(r"pv_w(\d)_(\w+)$", os.path.basename(d))
    tr = os.path.join(d, "trace.out")
    if not m or not os.path.exists(tr):
        continue
    js = os.path.join(d, "pipestats.json")
    subprocess.run([PY, os.path.join(R, "scripts", "pipestats.py"), tr, "--trim", "0.1", "--json", js],
                   check=True, stdout=subprocess.DEVNULL)
    res = json.load(open(js))
    row = {"width": int(m.group(1)), "workload": m.group(2)}
    for k in ("instructions_fetched", "instructions_committed", "squashed_fraction", "window_cycles",
              "throughput_ipc", "latency_mean_cycles", "latency_median_cycles", "latency_p90_cycles",
              "latency_max_cycles"):
        row[k] = res[k]
    for k, v in res["stage_delays_cycles"].items():
        row[k.replace("->", "_to_")] = v
    # the trace has one record per micro-op; convert with the run's micro-op ratio
    sw = summary.get(f"ss_w{row['width']}_{row['workload']}")
    ratio = float(sw["ops_total"]) / float(sw["insts_total"]) if sw else 1.0
    row["uops_per_inst"] = round(ratio, 3)
    row["throughput_ipc_macro"] = round(res["throughput_ipc"] / ratio, 4)
    row["full_run_ipc"] = float(sw["ipc"]) if sw else ""
    rows.append(row)
rows.sort(key=lambda r: (r["workload"], r["width"]))
out = os.path.join(R, "results", "latency.csv")
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(f"wrote {out} ({len(rows)} rows)")
print(f"{'workload':11} {'w':>2} {'uPC(win)':>8} {'IPC(win)':>8} {'IPC(run)':>8} {'lat mean':>8} {'median':>7} {'p90':>6} {'squash%':>7}  f>d   d>n   n>p   p>i   i>c   c>r")
for r in rows:
    print(f"{r['workload']:11} {r['width']:>2} {r['throughput_ipc']:>8.3f} {r['throughput_ipc_macro']:>8.3f} {float(r['full_run_ipc']):>8.3f} {r['latency_mean_cycles']:>8.1f} {r['latency_median_cycles']:>7.1f} {r['latency_p90_cycles']:>6.0f} {100*r['squashed_fraction']:>6.1f}%  "
          f"{r['fetch_to_decode']:>4.1f} {r['decode_to_rename']:>5.1f} {r['rename_to_dispatch']:>5.1f} {r['dispatch_to_issue']:>5.1f} {r['issue_to_complete']:>5.1f} {r['complete_to_retire']:>5.1f}")
