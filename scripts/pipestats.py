#!/usr/bin/env python3
"""
pipestats.py -- analyse a gem5 O3PipeView trace (--debug-flags=O3PipeView).

For every instruction the trace records the tick at which it was fetched,
decoded, renamed, dispatched, issued, completed (wrote back) and retired
(committed).  This script turns that into the two metrics Assignment 4 asks
for and a per-stage breakdown:

  * instruction latency   = (retire tick - fetch tick) / ticks-per-cycle,
                            averaged over committed instructions
  * instruction throughput = committed instructions / elapsed cycles
  * stage delays: fetch->decode, decode->rename, rename->dispatch,
                  dispatch->issue (waiting for operands / a unit),
                  issue->complete (execution + memory), complete->retire
  * speculation waste: instructions fetched but never retired (squashed)

--trim F drops the first and last fraction F of committed instructions so
the numbers describe the steady-state loop rather than program start-up.
--png draws a Gantt-style pipeline diagram (like Konata / o3-pipeview) for
--count instructions starting at committed instruction index --start.

usage: pipestats.py trace.out [--cycle 500] [--trim 0.1] [--json out.json]
                              [--png out.png --start N --count 40 --title T]
"""
import argparse, json, statistics, sys

STAGES = ["fetch", "decode", "rename", "dispatch", "issue", "complete", "retire"]

def parse(path):
    insts, cur = [], None
    with open(path, errors="replace") as f:
        for line in f:
            if not line.startswith("O3PipeView:"):
                continue
            parts = line.rstrip("\n").split(":")
            stage = parts[1]
            if stage == "fetch":
                # O3PipeView:fetch:<tick>:<pc>:<upc>:<sn>:<disasm>
                cur = {"fetch": int(parts[2]), "pc": parts[3], "upc": parts[4],
                       "sn": int(parts[5]), "disasm": ":".join(parts[6:]).strip()}
                insts.append(cur)
            elif cur is not None and stage == "retire":
                # O3PipeView:retire:<tick>:store:<store-completion tick>
                cur["retire"] = int(parts[2])
                cur["store_complete"] = int(parts[4]) if len(parts) > 4 else 0
            elif cur is not None and stage in STAGES:
                cur[stage] = int(parts[2])
    return insts

def analyse(insts, cycle, trim):
    """Trim the first/last `trim` fraction of ALL fetched instructions (by
    sequence number) so the edges of a tick-window trace, where records are
    incomplete, and the program start-up are excluded; then measure within."""
    insts = sorted(insts, key=lambda i: i["sn"])
    n_fetched = len(insts)
    k = int(n_fetched * trim) if (trim > 0 and n_fetched > 20) else 0
    inside = insts[k:n_fetched - k]
    committed = [i for i in inside if i.get("retire", 0) > 0 and all(i.get(s, 0) > 0 for s in STAGES)]
    n_committed = len(committed)
    n_fetched = len(inside)
    window = committed
    lat = [(i["retire"] - i["fetch"]) / cycle for i in window]
    deltas = {}
    for a, b in zip(STAGES, STAGES[1:]):
        deltas[f"{a}->{b}"] = statistics.fmean((i[b] - i[a]) / cycle for i in window) if window else 0
    span_cycles = (max(i["retire"] for i in window) - min(i["fetch"] for i in window)) / cycle if window else 0
    res = {
        "instructions_fetched": n_fetched,          # inside the trimmed window
        "instructions_committed": n_committed,
        "squashed_fraction": round(1 - n_committed / n_fetched, 4) if n_fetched else 0,
        "window_instructions": len(window),
        "window_cycles": round(span_cycles, 1),
        "throughput_ipc": round(len(window) / span_cycles, 4) if span_cycles else 0,
        "latency_mean_cycles": round(statistics.fmean(lat), 3) if lat else 0,
        "latency_median_cycles": statistics.median(lat) if lat else 0,
        "latency_p90_cycles": sorted(lat)[int(0.9 * len(lat))] if lat else 0,
        "latency_max_cycles": max(lat) if lat else 0,
        "stage_delays_cycles": {k: round(v, 3) for k, v in deltas.items()},
    }
    return res, committed

def gantt(committed, cycle, start, count, png, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch
    sel = committed[start:start + count]
    if not sel:
        sys.exit("no instructions in the requested window")
    t0 = min(i["fetch"] for i in sel)
    # one colour per stage interval (colour-blind-safe, ordered light->dark)
    colors = {"fetch": "#9ecae1", "decode": "#6baed6", "rename": "#4292c6",
              "dispatch": "#fdd0a2", "issue": "#fd8d3c", "complete": "#41ab5d"}
    labels = {"fetch": "fetch→decode", "decode": "decode→rename", "rename": "rename→dispatch",
              "dispatch": "dispatch→issue (wait)", "issue": "issue→complete (execute)",
              "complete": "complete→retire (commit wait)"}
    fig_h = max(3.0, 0.28 * len(sel) + 1.2)
    fig, ax = plt.subplots(figsize=(11, fig_h), dpi=150)
    for row, ins in enumerate(sel):
        y = len(sel) - 1 - row
        for a, b in zip(STAGES, STAGES[1:]):
            xa, xb = (ins[a] - t0) / cycle, (ins[b] - t0) / cycle
            if xb > xa:
                ax.barh(y, xb - xa, left=xa, height=0.7, color=colors[a], edgecolor="none")
            else:                       # zero-length stage: draw a tick mark
                ax.plot([xa], [y], marker="|", color=colors[a], markersize=8)
        ax.plot([(ins["retire"] - t0) / cycle], [y], marker="|", color="black", markersize=9)
    ax.set_yticks(range(len(sel)))
    ax.set_yticklabels([f"{i['sn']}  {i['disasm'][:34]}" for i in reversed(sel)], fontsize=6.5, family="monospace")
    ax.set_xlabel("cycle (relative to first fetch in window)")
    ax.set_title(title or "O3 pipeline occupancy per instruction", fontsize=10)
    ax.grid(axis="x", color="#dddddd", linewidth=0.5)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    handles = [Patch(color=colors[k], label=labels[k]) for k in STAGES[:-1]]
    handles.append(Patch(color="black", label="retire (commit)"))
    ax.legend(handles=handles, fontsize=6.5, loc="upper center", bbox_to_anchor=(0.5, -0.05), ncol=4, frameon=False)
    fig.tight_layout()
    fig.savefig(png)
    print(f"wrote {png} ({len(sel)} instructions)")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("trace")
    ap.add_argument("--cycle", type=int, default=500, help="ticks per cycle (500 at 2 GHz)")
    ap.add_argument("--trim", type=float, default=0.1, help="fraction trimmed at both ends")
    ap.add_argument("--json", help="write the metrics as JSON")
    ap.add_argument("--png", help="draw a Gantt chart to this file")
    ap.add_argument("--start", type=int, default=0, help="first committed instruction index for the chart")
    ap.add_argument("--count", type=int, default=40, help="instructions in the chart")
    ap.add_argument("--title", default="")
    ap.add_argument("--find-pc", help="start the chart at the first committed instruction with this pc (hex)")
    a = ap.parse_args()
    insts = parse(a.trace)
    res, committed = analyse(insts, a.cycle, a.trim)
    for k, v in res.items():
        print(f"{k:28} {v}")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(res, f, indent=1)
    if a.png:
        start = a.start
        if a.find_pc:
            for idx, ins in enumerate(committed):
                if ins["pc"].lower().endswith(a.find_pc.lower().replace("0x", "")) and idx >= a.start:
                    start = idx; break
        gantt(committed, a.cycle, start, a.count, a.png, a.title)

if __name__ == "__main__":
    main()
