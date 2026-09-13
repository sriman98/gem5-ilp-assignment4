#!/usr/bin/env python3
"""plot_results.py -- draw the Part 2 charts from results/summary.csv and
results/latency.csv into figures/*.png (matplotlib, 150 dpi).

Colour rules (dataviz method): categorical hues in a fixed, validated order,
one ordinal blue ramp for the issue widths, thin marks, hairline grid,
legend for every multi-series chart, text in ink colours never series colours."""
import csv, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.lines import Line2D

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(R, "figures"); os.makedirs(FIG, exist_ok=True)

# ---- palette (validated with dataviz/scripts/validate_palette.js) ----
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
WIDTH_RAMP = {1: "#86b6ef", 2: "#5598e7", 4: "#2a78d6", 8: "#184f95"}        # ordinal blue
STAGE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]   # ordinal, validated
INK, INK2, MUTED, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#fcfcfb"
WORKLOADS = ["int_alu", "dep_chain", "fp_matmul", "mem_stream", "mem_chase", "branchy", "bsort"]
WL_COLOR = dict(zip(WORKLOADS, CAT))
PREDICTORS = ["static-nt", "static-t", "local", "tournament", "tage"]
BP_LABEL = {"static-nt": "static not-taken", "static-t": "static taken", "local": "2-bit local (LocalBP)",
            "tournament": "tournament", "tage": "TAGE"}
BP_COLOR = dict(zip(PREDICTORS, CAT))

plt.rcParams.update({"font.family": "sans-serif", "font.size": 8.5, "axes.edgecolor": AXIS,
                     "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
                     "text.color": INK, "axes.titlecolor": INK, "figure.facecolor": SURFACE,
                     "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE})

def style(ax, ygrid=True):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_linewidth(0.6); ax.spines["bottom"].set_linewidth(0.6)
    if ygrid:
        ax.grid(axis="y", color=GRID, linewidth=0.6); ax.set_axisbelow(True)
    ax.tick_params(length=0, pad=4)

def save(fig, name):
    fig.tight_layout()
    path = os.path.join(FIG, name); fig.savefig(path, dpi=150); plt.close(fig); print("wrote", path)

def load(path):
    return list(csv.DictReader(open(path)))

rows = load(os.path.join(R, "results", "summary.csv"))
def get(kind=None, **kw):
    out = []
    for r in rows:
        if kind and r["kind"] != kind: continue
        if all(str(r.get(k)) == str(v) for k, v in kw.items()): out.append(r)
    return out
def one(**kw):
    m = get(**kw); assert len(m) == 1, (kw, len(m)); return m[0]

# ---------------------------------------------------------------- Fig: IPC vs width
def fig_ipc_width():
    fig, ax = plt.subplots(figsize=(9.5, 4.2))
    widths = [1, 2, 4, 8]; bw = 0.15; gap = 0.03
    for j, w in enumerate(widths):
        xs = [i + (j - 1.5) * (bw + gap) for i in range(len(WORKLOADS))]
        ys = [float(one(kind="sweep", width=w, workloads=wl)["ipc"]) for wl in WORKLOADS]
        ax.bar(xs, ys, width=bw, color=WIDTH_RAMP[w], label=f"{w}-wide", zorder=3)
        if w in (1, 8):                                       # label the two extremes only
            for x, y in zip(xs, ys):
                ax.text(x, y + 0.05, f"{y:.2f}", ha="center", va="bottom", fontsize=6.5, color=INK2)
    ax.set_xticks(range(len(WORKLOADS))); ax.set_xticklabels(WORKLOADS)
    ax.set_ylabel("committed instructions per cycle (IPC)")
    ax.set_title("IPC of the out-of-order core as the issue width grows from 1 to 8 (tournament predictor)", fontsize=9.5, loc="left")
    ax.legend(title="issue width", frameon=False, fontsize=8, title_fontsize=8, loc="upper right", ncol=4)
    ax.set_ylim(0, 4.3); style(ax); save(fig, "chart_ipc_vs_width.png")

# ---------------------------------------------------------------- Fig: speedup vs width
def fig_speedup_width():
    fig, ax = plt.subplots(figsize=(7.5, 4.4))
    widths = [1, 2, 4, 8]; xs = range(len(widths))
    ax.plot(xs, widths, color=AXIS, linewidth=1.2, zorder=2)
    ax.text(len(widths) - 1 + 0.08, widths[-1], "ideal (linear)", va="center", fontsize=7.5, color=MUTED)
    finals = []
    for wl in WORKLOADS:
        base = float(one(kind="sweep", width=1, workloads=wl)["ipc"])
        ys = [float(one(kind="sweep", width=w, workloads=wl)["ipc"]) / base for w in widths]
        ax.plot(xs, ys, color=WL_COLOR[wl], linewidth=2, marker="o", markersize=6.5,
                markeredgecolor=SURFACE, markeredgewidth=1.5, label=wl, zorder=3, solid_capstyle="round")
        finals.append((ys[-1], wl))
    # direct end labels for the top and bottom series only (others via legend)
    finals.sort()
    for y, wl in (finals[0], finals[-1]):
        ax.text(len(widths) - 1 + 0.08, y, f"{wl}  {y:.2f}×", va="center", fontsize=7.5, color=INK2)
    ax.set_xticks(list(xs)); ax.set_xticklabels([f"{w}-wide" for w in widths])
    ax.set_ylabel("speedup over the 1-wide core (IPC ratio)")
    ax.set_title("Superscalar speedup by workload: ILP-rich kernels scale, dependency- and latency-bound ones do not", fontsize=9.5, loc="left")
    ax.set_xlim(-0.2, len(widths) - 1 + 0.9); ax.set_ylim(0.8, 8.3)
    ax.legend(frameon=False, fontsize=8, loc="upper left", ncol=2); style(ax); save(fig, "chart_speedup_vs_width.png")

# ---------------------------------------------------------------- Fig: branch predictors (IPC + mispredict %)
def fig_bp():
    wls = ["branchy", "bsort", "int_alu"]
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 4.0))
    bw = 0.14; gap = 0.02
    for ax, key, ylab, ttl in ((axes[0], "ipc", "IPC", "Throughput (IPC), 4-wide core"),
                               (axes[1], "cond_mispred_rate", "conditional-branch misprediction rate (%)", "Misprediction rate, 4-wide core")):
        for j, bp in enumerate(PREDICTORS):
            xs = [i + (j - 2) * (bw + gap) for i in range(len(wls))]
            ys = [float(one(kind="bp", width=4, bp=bp, workloads=wl)[key]) * (100 if key != "ipc" else 1) for wl in wls]
            ax.bar(xs, ys, width=bw, color=BP_COLOR[bp], label=BP_LABEL[bp], zorder=3)
            for x, y in zip(xs, ys):                                    # value on every cap: only 15 bars
                ax.text(x, y + (0.02 if key == "ipc" else 0.4), f"{y:.2f}" if key == "ipc" else f"{y:.1f}",
                        ha="center", va="bottom", fontsize=6, color=INK2, rotation=90)
        ax.set_xticks(range(len(wls))); ax.set_xticklabels(wls); ax.set_ylabel(ylab)
        ax.set_title(ttl, fontsize=9.5, loc="left"); style(ax)
    axes[0].set_ylim(0, 3.4); axes[1].set_ylim(0, 108)
    axes[0].legend(frameon=False, fontsize=7.5, loc="upper left")
    save(fig, "chart_bp_predictors.png")

# ---------------------------------------------------------------- Fig: predictor x width interaction
def fig_bp_width():
    fig, ax = plt.subplots(figsize=(6.5, 3.6))
    groups = [("bsort", 1), ("bsort", 4), ("branchy", 1), ("branchy", 4), ("int_alu", 1), ("int_alu", 4)]
    bw = 0.3
    for j, bp in enumerate(["static-nt", "tournament"]):
        xs = [i + (j - 0.5) * (bw + 0.04) for i in range(len(groups))]
        ys = [float(one(kind="bp", width=w, bp=bp, workloads=wl)["ipc"]) for wl, w in groups]
        ax.bar(xs, ys, width=bw, color=BP_COLOR[bp], label=BP_LABEL[bp], zorder=3)
        for x, y in zip(xs, ys):
            ax.text(x, y + 0.03, f"{y:.2f}", ha="center", va="bottom", fontsize=6.5, color=INK2)
    ax.set_xticks(range(len(groups))); ax.set_xticklabels([f"{wl}\n{w}-wide" for wl, w in groups])
    ax.set_ylabel("IPC"); ax.set_ylim(0, 3.2)
    ax.set_title("The value of dynamic prediction grows with issue width", fontsize=9.5, loc="left")
    ax.legend(frameon=False, fontsize=8, loc="upper left"); style(ax); save(fig, "chart_bp_width_interaction.png")

# ---------------------------------------------------------------- SMT metrics
def smt_metrics(r):
    """per-thread IPC, total IPC, and the throughput of running the same work
    back-to-back on one core (each thread at its single-thread IPC)."""
    wls = r["workloads"].split("+")
    insts = [float(r[f"insts_t{i}"]) for i in range(len(wls)) if r[f"insts_t{i}"] != ""]
    cycles = float(r["cycles"])
    alone = [float(one(kind="sweep", width=4, workloads=wl)["ipc"]) for wl in wls]
    seq_cycles = sum(n / a for n, a in zip(insts, alone))
    return dict(wls=wls, insts=insts, cycles=cycles, ipc_threads=[n / cycles for n in insts],
                ipc_total=sum(insts) / cycles, seq_ipc=sum(insts) / seq_cycles,
                speedup=seq_cycles / cycles, weighted=sum((n / cycles) / a for n, a in zip(insts, alone)))

SMT_SET = [("smt2_int_alu+dep_chain", "int_alu +\ndep_chain"), ("smt2_fp_matmul+int_alu", "fp_matmul +\nint_alu"),
           ("smt2_bsort+branchy", "bsort +\nbranchy"), ("smt2_fp_matmul+mem_chase", "fp_matmul +\nmem_chase"),
           ("smt2_mem_stream+mem_chase", "mem_stream +\nmem_chase"), ("smt2btb2_int_alu+int_alu", "int_alu ×2\n(2-way BTB)"),
           ("smt2btb2_dep_chain+dep_chain", "dep_chain ×2\n(2-way BTB)"), ("smt2btb2_bsort+bsort", "bsort ×2\n(2-way BTB)"),
           ("smt4_int_alu+dep_chain+mem_chase+branchy", "4 threads:\nint_alu, dep_chain,\nmem_chase, branchy")]

def fig_smt():
    fig, ax = plt.subplots(figsize=(9.5, 5.0))
    bw = 0.34
    for i, (name, label) in enumerate(SMT_SET):
        m = smt_metrics(one(name=name))
        ax.bar(i - bw / 2 - 0.02, m["seq_ipc"], width=bw, color=MUTED, zorder=3)
        ax.text(i - bw / 2 - 0.02, m["seq_ipc"] + 0.04, f"{m['seq_ipc']:.2f}", ha="center", fontsize=6.5, color=INK2)
        bottom = 0
        for t, ipc in enumerate(m["ipc_threads"]):
            ax.bar(i + bw / 2 + 0.02, ipc, bottom=bottom, width=bw, color=CAT[t], edgecolor=SURFACE, linewidth=1.2, zorder=3)
            bottom += ipc
        ax.text(i + bw / 2 + 0.02, bottom + 0.04, f"{m['ipc_total']:.2f}\n({m['speedup']:.2f}×)", ha="center", fontsize=6.5, color=INK2)
    ax.set_xticks(range(len(SMT_SET))); ax.set_xticklabels([l for _, l in SMT_SET], fontsize=7)
    ax.set_ylabel("instructions per cycle (IPC)"); ax.set_ylim(0, 4.6); ax.set_xlim(-0.6, len(SMT_SET) - 0.4)
    ax.set_title("SMT on the 4-wide core: same work run back-to-back on one core (gray) versus simultaneously (stacked per thread)", fontsize=9.5, loc="left")
    handles = [Patch(color=MUTED, label="threads run one after another (single-thread IPCs)")] + \
              [Patch(color=CAT[t], label=f"SMT thread {t}") for t in range(4)]
    ax.legend(handles=handles, frameon=False, fontsize=7.5, loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=5); style(ax); save(fig, "chart_smt_throughput.png")

def fig_btb():
    pairs = [("int_alu", "smt2_int_alu+int_alu", "smt2btb2_int_alu+int_alu"), ("dep_chain", "smt2_dep_chain+dep_chain", "smt2btb2_dep_chain+dep_chain"),
             ("bsort", "smt2_bsort+bsort", "smt2btb2_bsort+bsort")]
    fig, axes = plt.subplots(1, 2, figsize=(9.0, 3.6)); bw = 0.3
    for j, (assoc, col) in enumerate((("1-way (direct-mapped) BTB", CAT[0]), ("2-way BTB", CAT[1]))):
        xs = [i + (j - 0.5) * (bw + 0.04) for i in range(len(pairs))]
        cyc = [float(one(name=p[1 + j])["cycles"]) / 1e6 for p in pairs]
        hit = [100 * float(one(name=p[1 + j])["btb_hits"]) / float(one(name=p[1 + j])["btb_lookups"]) for p in pairs]
        axes[0].bar(xs, cyc, width=bw, color=col, label=assoc, zorder=3)
        axes[1].bar(xs, hit, width=bw, color=col, label=assoc, zorder=3)
        for x, y in zip(xs, cyc): axes[0].text(x, y + 0.05, f"{y:.2f}", ha="center", fontsize=6.5, color=INK2)
        for x, y in zip(xs, hit): axes[1].text(x, y + 1, f"{y:.0f}%", ha="center", fontsize=6.5, color=INK2)
    for ax, ylab, ttl in ((axes[0], "cycles to commit 2 × 3M instructions (millions)", "Execution time, two copies of the same program"),
                          (axes[1], "BTB hit ratio (%)", "Branch-target-buffer hit ratio")):
        ax.set_xticks(range(len(pairs))); ax.set_xticklabels([f"{p[0]} ×2" for p in pairs]); ax.set_ylabel(ylab)
        ax.set_title(ttl, fontsize=9.5, loc="left"); style(ax)
    axes[0].set_ylim(0, 6.2); axes[1].set_ylim(0, 112)
    axes[0].legend(frameon=False, fontsize=7.5, loc="upper left"); save(fig, "chart_smt_btb.png")

# ---------------------------------------------------------------- latency figures
def fig_latency():
    lat = load(os.path.join(R, "results", "latency.csv"))
    def L(wl, w, k): return float([r for r in lat if r["workload"] == wl and int(r["width"]) == w][0][k])
    widths = [1, 2, 4, 8]; xs = range(4)
    fig, ax = plt.subplots(figsize=(7.5, 4.4))
    finals = []
    for wl in WORKLOADS:
        ys = [L(wl, w, "latency_mean_cycles") for w in widths]
        ax.plot(xs, ys, color=WL_COLOR[wl], linewidth=2, marker="o", markersize=6.5, markeredgecolor=SURFACE,
                markeredgewidth=1.5, label=wl, zorder=3); finals.append((ys[-1], wl))
    finals.sort()
    for y, wl in (finals[0], finals[-1]):
        ax.text(3.08, y, f"{wl}  {y:.0f}", va="center", fontsize=7.5, color=INK2)
    ax.set_xticks(list(xs)); ax.set_xticklabels([f"{w}-wide" for w in widths]); ax.set_xlim(-0.2, 3.9)
    ax.set_yscale("log"); ax.set_ylabel("mean fetch-to-commit latency per micro-op (cycles, log scale)")
    ax.set_title("Mean fetch-to-commit latency per micro-op versus issue width (steady-state window of ~40k micro-ops)", fontsize=9.5, loc="left")
    ax.legend(frameon=False, fontsize=8, loc="upper left", ncol=2); style(ax); save(fig, "chart_latency_vs_width.png")
    # stage breakdown, widths 1 and 4
    stages = [("fetch_to_decode",), ("decode_to_rename", "rename_to_dispatch"), ("dispatch_to_issue",), ("issue_to_complete",), ("complete_to_retire",)]
    labels = ["fetch→decode (front-end queueing)", "decode→dispatch (fixed pipeline depth)", "dispatch→issue (operand / unit wait)",
              "issue→complete (execute or memory)", "complete→retire (in-order commit wait)"]
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 4.6), sharey=False)
    for ax, w in zip(axes, (1, 4)):
        bottoms = [0.0] * len(WORKLOADS)
        for s, (st, lab) in enumerate(zip(stages, labels)):
            ys = [sum(L(wl, w, k) for k in st) for wl in WORKLOADS]
            ax.bar(range(len(WORKLOADS)), ys, bottom=bottoms, width=0.5, color=STAGE_RAMP[s], edgecolor=SURFACE, linewidth=1.0, label=lab, zorder=3)
            bottoms = [b + y for b, y in zip(bottoms, ys)]
        for i, b in enumerate(bottoms):
            ax.text(i, b * 1.02, f"{b:.0f}", ha="center", va="bottom", fontsize=6.5, color=INK2)
        ax.set_xticks(range(len(WORKLOADS))); ax.set_xticklabels(WORKLOADS, rotation=25, ha="right")
        ax.set_yscale("log"); ax.set_ylim(1, max(bottoms) * 3)
        ax.set_ylabel("mean cycles spent between stages (log scale)"); ax.set_title(f"{w}-wide core", fontsize=9.5, loc="left"); style(ax)
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, frameon=False, fontsize=7.5, loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.01))
    fig.suptitle("Where an instruction's latency goes: mean time between pipeline events, per workload", fontsize=9.5, x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0.09, 1, 1)); path = os.path.join(FIG, "chart_latency_stages.png"); fig.savefig(path, dpi=150); plt.close(fig); print("wrote", path)

if __name__ == "__main__":
    which = sys.argv[1:] or ["all"]
    if "all" in which or "sweep" in which: fig_ipc_width(); fig_speedup_width()
    if "all" in which or "bp" in which: fig_bp(); fig_bp_width()
    if "all" in which or "smt" in which: fig_smt(); fig_btb()
    if "all" in which or "latency" in which: fig_latency()
