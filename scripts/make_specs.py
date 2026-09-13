#!/usr/bin/env python3
"""Generate the experiment matrices (TSV spec files) for run_experiments.sh."""
import os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# workload -> default argument (sized for roughly 3-5 million instructions)
WL = {"int_alu": "50000", "dep_chain": "500000", "fp_matmul": "4", "mem_stream": "2",
      "mem_chase": "300000", "branchy": "20", "bsort": "800"}
def cmd(wl): return f"bin/{wl}:{WL[wl]}"
def w(name, gopts, cargs): return f"{name}\t{gopts or 'NONE'}\t{cargs}\n"   # NONE = no gem5 options

def batch(name, workloads, lines_fn):
    path = os.path.join(R, "results", "specs", f"{name}.tsv")
    with open(path, "w") as f:
        f.write("# name\tgem5-options\tconfig-arguments\n")
        for line in lines_fn(workloads): f.write(line)
    print(path)

def sweep_and_more(wls):
    out = []
    # A. issue-width sweep, out-of-order core, tournament predictor
    for wl in wls:
        for width in (1, 2, 4, 8):
            out.append(w(f"ss_w{width}_{wl}", "", f"--cpu o3 --width {width} --bp tournament --cmd {cmd(wl)}"))
    # B. branch predictors at width 4 (and the two extremes at width 1)
    for wl in [x for x in ("branchy", "bsort", "int_alu") if x in wls]:
        for bp in ("static-nt", "static-t", "local", "tournament", "tage"):
            out.append(w(f"bp_{bp}_w4_{wl}", "", f"--cpu o3 --width 4 --bp {bp} --cmd {cmd(wl)}"))
        for bp in ("static-nt", "tournament"):
            out.append(w(f"bp_{bp}_w1_{wl}", "", f"--cpu o3 --width 1 --bp {bp} --cmd {cmd(wl)}"))
    # C. SMT on the 4-wide core; stop when the first thread reaches 3M instructions
    pairs = [("int_alu", "mem_chase"), ("int_alu", "dep_chain"), ("dep_chain", "dep_chain"),
             ("bsort", "branchy"), ("mem_stream", "mem_chase"), ("int_alu", "int_alu"),
             ("fp_matmul", "int_alu"), ("fp_matmul", "mem_chase")]
    for a, b in pairs:
        if a in wls and b in wls:
            out.append(w(f"smt2_{a}+{b}", "", f"--cpu o3 --width 4 --maxinsts 3000000 --cmd {cmd(a)} --cmd {cmd(b)}"))
    if all(x in wls for x in ("int_alu", "dep_chain", "mem_chase", "branchy")):
        out.append(w("smt4_int_alu+dep_chain+mem_chase+branchy", "",
                     "--cpu o3 --width 4 --maxinsts 3000000 " + " ".join(f"--cmd {cmd(x)}" for x in ("int_alu", "dep_chain", "mem_chase", "branchy"))))
    if "int_alu" in wls and "mem_chase" in wls:
        out.append(w("smt2pol_iqcount_int_alu+mem_chase", "", f"--cpu o3 --width 4 --maxinsts 3000000 --smt-fetch IQCount --cmd {cmd('int_alu')} --cmd {cmd('mem_chase')}"))
        out.append(w("smt2pol_dynamic_int_alu+mem_chase", "", f"--cpu o3 --width 4 --maxinsts 3000000 --smt-share Dynamic --cmd {cmd('int_alu')} --cmd {cmd('mem_chase')}"))
    # D. tiny fully-traced runs for the cycle-by-cycle pipeline study
    for wl, n in (("dep_chain", 30), ("int_alu", 30)):
        if wl in wls:
            for width in (1, 4):
                out.append(w(f"pv_demo_w{width}_{wl}", "--debug-flags=O3PipeView --debug-file=trace.out",
                             f"--cpu o3 --width {width} --bp tournament --cmd bin/{wl}:{n}"))
    return out

def latency_traces(_):
    """O3PipeView trace of ~40k instructions from the middle of every
    issue-width sweep run (window derived from that run's ticks and IPC)."""
    import csv
    out = []
    with open(os.path.join(R, "results", "summary.csv")) as f:
        for r in csv.DictReader(f):
            if r["kind"] != "sweep":
                continue
            ticks = float(r["sim_seconds"]) * 1e12
            ipc = max(float(r["ipc"]), 0.05)
            start = int(ticks * 0.5)
            end = start + int(40000 / ipc * 500)          # 500 ticks per cycle at 2 GHz
            wl, width = r["workloads"], r["width"]
            out.append(w(f"pv_w{width}_{wl}",
                         f"--debug-flags=O3PipeView --debug-file=trace.out --debug-start={start} --debug-end={end}",
                         f"--cpu o3 --width {width} --bp tournament --cmd {cmd(wl)}"))
    return out

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "batch1"
    if which == "batch1":
        batch("batch1", ["int_alu", "dep_chain", "mem_stream", "mem_chase", "branchy", "bsort"], sweep_and_more)
    elif which == "probe":    # SMT follow-up probes (thread order, malloc-ing partners, sharing policy)
        def probes(_):
            return [
                w("smt2_mem_chase+int_alu", "", f"--cpu o3 --width 4 --maxinsts 3000000 --cmd {cmd('mem_chase')} --cmd {cmd('int_alu')}"),
                w("smt2_int_alu+mem_stream", "", f"--cpu o3 --width 4 --maxinsts 3000000 --cmd {cmd('int_alu')} --cmd {cmd('mem_stream')}"),
                w("smt2_dep_chain+mem_chase", "", f"--cpu o3 --width 4 --maxinsts 3000000 --cmd {cmd('dep_chain')} --cmd {cmd('mem_chase')}"),
                w("smt2pol_threshold_int_alu+mem_chase", "", f"--cpu o3 --width 4 --maxinsts 3000000 --smt-share Threshold --cmd {cmd('int_alu')} --cmd {cmd('mem_chase')}"),
            ]
        batch("probe", [], probes)
    elif which == "batch3":
        batch("batch3", [], latency_traces)
    elif which == "probe2":   # same-binary SMT with a set-associative BTB
        def probes2(_):
            return [
                w("smt2btb2_int_alu+int_alu", "", f"--cpu o3 --width 4 --maxinsts 3000000 --btb-assoc 2 --cmd {cmd('int_alu')} --cmd {cmd('int_alu')}"),
                w("smt2btb2_dep_chain+dep_chain", "", f"--cpu o3 --width 4 --maxinsts 3000000 --btb-assoc 2 --cmd {cmd('dep_chain')} --cmd {cmd('dep_chain')}"),
                w("smt2btb2_bsort+bsort", "", f"--cpu o3 --width 4 --maxinsts 2500000 --btb-assoc 2 --cmd {cmd('bsort')} --cmd {cmd('bsort')}"),
                w("smt2_bsort+bsort", "", f"--cpu o3 --width 4 --maxinsts 2500000 --cmd {cmd('bsort')} --cmd {cmd('bsort')}"),
            ]
        batch("probe2", [], probes2)
    elif which == "dyn":      # dynamically shared ROB/IQ/LSQ (needs the LSQ recursion fix)
        def dyn(_):
            pairs = [("int_alu", "dep_chain"), ("fp_matmul", "int_alu"), ("bsort", "branchy"),
                     ("fp_matmul", "mem_chase"), ("mem_stream", "mem_chase")]
            out = [w(f"smt2dyn_{a}+{b}", "", f"--cpu o3 --width 4 --maxinsts 3000000 --smt-share Dynamic --cmd {cmd(a)} --cmd {cmd(b)}") for a, b in pairs]
            out.append(w("smt4dyn_int_alu+dep_chain+mem_chase+branchy", "", "--cpu o3 --width 4 --maxinsts 3000000 --smt-share Dynamic " + " ".join(f"--cmd {cmd(x)}" for x in ("int_alu", "dep_chain", "mem_chase", "branchy"))))
            return out
        batch("dyn", [], dyn)
    elif which == "batch2":   # fp_matmul added after fixing its printf
        def fp_only(_):
            allw = ["int_alu", "dep_chain", "fp_matmul", "mem_stream", "mem_chase", "branchy", "bsort"]
            return [l for l in sweep_and_more(allw) if "fp_matmul" in l]
        batch("batch2", [], fp_only)
