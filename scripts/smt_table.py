#!/usr/bin/env python3
"""smt_table.py -- SMT throughput metrics from results/summary.csv -> results/smt_summary.csv
For each SMT run: per-thread IPC, total IPC, the IPC the same work would get if the
threads ran back-to-back on one core (each at its single-thread 4-wide IPC), the
resulting throughput speedup, and the weighted speedup sum(IPC_smt,i / IPC_alone,i)."""
import csv, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(R, "results", "summary.csv"))))
alone = {r["workloads"]: r for r in rows if r["kind"] == "sweep" and r["width"] == "4"}
out = []
for r in rows:
    if not r["kind"].startswith("smt"):
        continue
    wls = r["workloads"].split("+"); cyc = float(r["cycles"])
    insts = [float(r[f"insts_t{i}"]) for i in range(len(wls))]
    a = [float(alone[w]["ipc"]) for w in wls]
    seq_cycles = sum(n / x for n, x in zip(insts, a))
    rec = {"run": r["name"], "policy": r["policy"], "threads": len(wls), "workloads": " + ".join(wls),
           "cycles": int(cyc), "insts_total": int(sum(insts)),
           "ipc_total": round(sum(insts) / cyc, 3), "seq_ipc": round(sum(insts) / seq_cycles, 3),
           "throughput_speedup": round(seq_cycles / cyc, 3),
           "weighted_speedup": round(sum((n / cyc) / x for n, x in zip(insts, a)), 3),
           "rob_full_per_kinst": round(1000 * float(r["rob_full"]) / sum(insts), 2),
           "iq_full_per_kinst": round(1000 * float(r["iq_full"]) / sum(insts), 2),
           "sq_full_per_kinst": round(1000 * float(r["sq_full"]) / sum(insts), 2),
           "lq_full_per_kinst": round(1000 * float(r["lq_full"]) / sum(insts), 2),
           "cond_mispred_rate": r["cond_mispred_rate"], "btb_hit_ratio": round(float(r["btb_hits"]) / float(r["btb_lookups"]), 3) if float(r["btb_lookups"]) else ""}
    for i in range(4):
        rec[f"ipc_t{i}"] = round(insts[i] / cyc, 3) if i < len(insts) else ""
        rec[f"alone_ipc_t{i}"] = a[i] if i < len(a) else ""
        rec[f"share_t{i}"] = round((insts[i] / cyc) / a[i], 3) if i < len(a) else ""
    out.append(rec)
path = os.path.join(R, "results", "smt_summary.csv")
with open(path, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
print("wrote", path)
print(f"{'run':44} {'IPC':>6} {'seq':>6} {'x':>5} {'wsp':>5}  {'t0':>6} {'t1':>6} {'t2':>6} {'t3':>6}  {'ROBfull/k':>9} {'SQfull/k':>8}")
for o in out:
    print(f"{o['run']:44} {o['ipc_total']:>6.3f} {o['seq_ipc']:>6.3f} {o['throughput_speedup']:>5.2f} {o['weighted_speedup']:>5.2f}  "
          f"{str(o['ipc_t0']):>6} {str(o['ipc_t1']):>6} {str(o['ipc_t2']):>6} {str(o['ipc_t3']):>6}  {o['rob_full_per_kinst']:>9} {o['sq_full_per_kinst']:>8}")
