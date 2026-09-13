#!/usr/bin/env python3
"""
parse_stats.py -- aggregate every results/runs/<name>/stats.txt into
results/summary.csv (one row per run) and print a readable table.

Run names encode the configuration:
  ss_w<W>_<wl>              issue-width sweep (O3, tournament predictor)
  bp_<bp>_w<W>_<wl>         branch-predictor study
  smt2_<a>+<b>, smt4_...    SMT runs (4-wide O3), smt2pol_<policy>_<a>+<b>
  pv_demo_w<W>_<wl>         tiny fully traced runs (pipeline viewer)
"""
import csv, glob, os, re, sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNS = os.path.join(R, "results", "runs")

INST_CLASSES = ["IntAlu", "IntMult", "IntDiv", "FloatAdd", "FloatCmp", "FloatCvt",
                "FloatMult", "FloatMultAcc", "FloatDiv", "SimdFloatAdd", "SimdFloatMult",
                "SimdFloatMultAcc", "SimdAlu", "SimdMisc", "MemRead", "MemWrite",
                "FloatMemRead", "FloatMemWrite", "No_OpClass"]

def load_stats(path):
    """stats.txt -> {name: float}; keeps only the first numeric column."""
    stats = {}
    with open(path) as f:
        for line in f:
            if not line.startswith("system.") and not line.startswith("sim") and not line.startswith("host"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            try:
                stats[parts[0]] = float(parts[1])
            except ValueError:
                pass
    return stats

def first(stats, names, default=0.0):
    for n in names:
        if n in stats:
            return stats[n]
    return default

def parse_name(name):
    m = re.match(r"ss_w(\d)_(\w+)$", name)
    if m:
        return dict(kind="sweep", width=int(m.group(1)), bp="tournament", workloads=m.group(2), policy="")
    m = re.match(r"bp_([a-z\-]+)_w(\d)_(\w+)$", name)
    if m:
        return dict(kind="bp", width=int(m.group(2)), bp=m.group(1), workloads=m.group(3), policy="")
    WL = "(?:int_alu|dep_chain|fp_matmul|mem_stream|mem_chase|branchy|bsort)"
    m = re.match(rf"smt(\d)(.*?)_({WL}(?:\+{WL})+)$", name)
    if m:   # smt2_a+b, smt2btb2_a+a, smt2dyn_a+b, smt2pol_iqcount_a+b, smt4_...
        return dict(kind=f"smt{m.group(1)}", width=4, bp="tournament", workloads=m.group(3),
                    policy=m.group(2) or "default")
    m = re.match(r"pv_(\w+?)_w(\d)_(\w+)$", name)
    if m:
        return dict(kind="trace", width=int(m.group(2)), bp="tournament", workloads=m.group(3), policy="")
    return dict(kind="other", width=0, bp="", workloads="", policy="")

def program_output(run_log):
    """The workload's own output line(s), e.g. 'int_alu: n=50000 checksum=...'."""
    outs = []
    try:
        with open(run_log) as f:
            for line in f:
                if re.match(r"^(int_alu|dep_chain|fp_matmul|mem_stream|mem_chase|branchy|bsort):", line):
                    outs.append(line.strip())
    except OSError:
        pass
    return " | ".join(outs)

def summarize(run_dir):
    name = os.path.basename(run_dir)
    st_path = os.path.join(run_dir, "stats.txt")
    if not os.path.exists(st_path) or os.path.getsize(st_path) == 0:
        return None
    s = load_stats(st_path)
    row = dict(name=name, **parse_name(name))
    cycles = first(s, ["system.cpu.numCycles"])
    row["cycles"] = int(cycles)
    row["sim_seconds"] = first(s, ["simSeconds"])
    row["host_seconds"] = first(s, ["hostSeconds"])
    # per-thread committed instructions (commitStats<i>.numInsts) and micro-ops
    insts, ops = [], []
    for i in range(8):
        k = f"system.cpu.commitStats{i}.numInsts"
        if k in s:
            insts.append(s[k]); ops.append(s.get(f"system.cpu.commitStats{i}.numOps", 0.0))
    row["threads"] = len(insts)
    row["insts_total"] = int(sum(insts))
    row["ops_total"] = int(sum(ops))
    for i in range(4):
        row[f"insts_t{i}"] = int(insts[i]) if i < len(insts) else ""
        row[f"ipc_t{i}"] = round(insts[i] / cycles, 4) if i < len(insts) and cycles else ""
    row["ipc"] = round(sum(insts) / cycles, 4) if cycles else 0
    row["cpi"] = round(cycles / sum(insts), 4) if sum(insts) else 0
    row["ipc_gem5"] = first(s, ["system.cpu.ipc"])          # gem5's own core-level IPC
    row["idle_cycles"] = int(first(s, ["system.cpu.idleCycles"]))
    # branch prediction
    cp = first(s, ["system.cpu.branchPred.condPredicted"])
    ci = first(s, ["system.cpu.branchPred.condIncorrect"])
    row["cond_predicted"] = int(cp); row["cond_incorrect"] = int(ci)
    row["cond_mispred_rate"] = round(ci / cp, 4) if cp else 0
    row["bp_lookups"] = int(first(s, ["system.cpu.branchPred.lookups_0::total"]))
    row["bp_mispredicted"] = int(first(s, ["system.cpu.branchPred.mispredicted_0::total"]))
    row["btb_hits"] = int(first(s, ["system.cpu.branchPred.BTBHits"]))
    row["btb_lookups"] = int(first(s, ["system.cpu.branchPred.BTBLookups"]))
    row["commit_branch_mispredicts"] = int(first(s, ["system.cpu.commit.branchMispredicts"]))
    row["mpki"] = round(1000.0 * row["commit_branch_mispredicts"] / sum(insts), 3) if sum(insts) else 0
    # speculation waste
    row["squashed_commit"] = int(first(s, ["system.cpu.commit.commitSquashedInsts"]))
    row["squashed_decode"] = int(first(s, ["system.cpu.decode.squashedInsts"]))
    row["squashed_rename"] = int(first(s, ["system.cpu.rename.squashedInsts"]))
    row["squashed_execute"] = int(first(s, ["system.cpu.numSquashedInsts"]))
    row["fetched_insts"] = int(first(s, ["system.cpu.fetchStats0.numInsts", "system.cpu.fetch.insts"]))
    # structural stalls / resource sharing
    row["rob_full"] = int(first(s, ["system.cpu.rename.ROBFullEvents"]))
    row["iq_full"] = int(first(s, ["system.cpu.rename.IQFullEvents"]))
    row["lq_full"] = int(first(s, ["system.cpu.rename.LQFullEvents"]))
    row["sq_full"] = int(first(s, ["system.cpu.rename.SQFullEvents"]))
    row["iew_iq_full"] = int(first(s, ["system.cpu.iew.iqFullEvents"]))
    row["iew_lsq_full"] = int(first(s, ["system.cpu.iew.lsqFullEvents"]))
    row["rob_reads"] = int(first(s, ["system.cpu.rob.reads"]))
    row["rob_writes"] = int(first(s, ["system.cpu.rob.writes"]))
    row["fu_busy_rate"] = first(s, ["system.cpu.fuBusyRate", "system.cpu.instQueues0.fuBusyRate", "system.cpu.iq.fuBusyRate"])
    row["issue_rate"] = first(s, ["system.cpu.issueRate", "system.cpu.instQueues0.issueRate", "system.cpu.iq.issueRate"])
    row["lq_avg_occ"] = first(s, ["system.cpu.lsq0.lqAvgOccupancy"])
    row["sq_avg_occ"] = first(s, ["system.cpu.lsq0.sqAvgOccupancy"])
    row["rename_int_lookups"] = int(first(s, ["system.cpu.rename.intLookups"]))
    row["rename_fp_lookups"] = int(first(s, ["system.cpu.rename.fpLookups"]))
    # caches
    row["dcache_misses"] = int(first(s, ["system.cpu.dcache.overallMisses::total"]))
    row["dcache_miss_rate"] = first(s, ["system.cpu.dcache.overallMissRate::total"])
    row["icache_misses"] = int(first(s, ["system.cpu.icache.overallMisses::total"]))
    row["l2_misses"] = int(first(s, ["system.l2cache.overallMisses::total"]))
    row["l2_miss_rate"] = first(s, ["system.l2cache.overallMissRate::total"])
    # committed micro-op mix (summed over threads)
    for cls in INST_CLASSES:
        tot = 0.0
        for i in range(8):
            tot += s.get(f"system.cpu.commit.committedInstType_{i}::{cls}", 0.0)
        row[f"mix_{cls}"] = int(tot)
    row["program_output"] = program_output(os.path.join(run_dir, "run.log"))
    return row

def main():
    rows = []
    for d in sorted(glob.glob(os.path.join(RUNS, "*"))):
        if not os.path.isdir(d):
            continue
        r = summarize(d)
        if r:
            rows.append(r)
    if not rows:
        print("no completed runs found"); return
    out = os.path.join(R, "results", "summary.csv")
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"wrote {out} ({len(rows)} runs)\n")
    print(f"{'run':42} {'thr':>3} {'cycles':>11} {'insts':>10} {'IPC':>7} {'CPI':>7} {'mispr%':>7} {'MPKI':>6}  output")
    for r in rows:
        print(f"{r['name']:42} {r['threads']:>3} {r['cycles']:>11,} {r['insts_total']:>10,} "
              f"{r['ipc']:>7.3f} {r['cpi']:>7.3f} {100*r['cond_mispred_rate']:>6.2f}% {r['mpki']:>6.2f}  "
              f"{r['program_output'][:60]}")

if __name__ == "__main__":
    main()
