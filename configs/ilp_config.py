"""
ilp_config.py -- gem5 syscall-emulation (SE) configuration for
Assignment 4, "Exploring Instruction-Level Parallelism", by Sriman Cherukuru.

One script drives every experiment in Part 2:

  --cpu o3   --width 1        scalar (single-issue) pipeline, the baseline
  --cpu o3   --width 2|4|8    superscalar (multiple-issue) pipelines
  --cpu minor                 a classic in-order pipeline for comparison
  --bp static-nt|static-t|local|tournament|tage
                              branch-direction predictor (static-* = the
                              StaticBP class added to gem5 for this study)
  --cmd BIN[:ARG]             workload; give --cmd twice or more for SMT
                              (the O3 core then gets one hardware thread
                              per program and they share the pipeline)

Example:
  build/X86/gem5.opt --outdir=m5out/ss4 configs/ilp_config.py \
      --cpu o3 --width 4 --bp tournament --cmd bin/int_alu:60000
"""
import argparse
import os

import m5
from m5.objects import *
import m5.objects as objs

# ---------------------------------------------------------------- options
parser = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--cpu", choices=["o3", "minor"], default="o3",
                    help="o3 = out-of-order (default), minor = in-order")
parser.add_argument("--width", type=int, default=1, choices=[1, 2, 4, 8],
                    help="issue width; applied to every O3 stage")
parser.add_argument("--bp", default="tournament",
                    choices=["static-nt", "static-t", "local", "tournament", "tage"],
                    help="conditional branch direction predictor")
parser.add_argument("--cmd", action="append", required=True, metavar="BIN[:ARG[:ARG]]",
                    help="program to run; repeat for SMT (one HW thread each)")
parser.add_argument("--clock", default="2GHz", help="CPU clock (default 2GHz)")
parser.add_argument("--rob", type=int, help="override reorder-buffer entries")
parser.add_argument("--iq", type=int, help="override instruction-queue entries")
parser.add_argument("--lsq", type=int, help="override load- and store-queue entries")
parser.add_argument("--smt-fetch", default="RoundRobin",
                    choices=["RoundRobin", "Branch", "IQCount", "LSQCount"],
                    help="SMT fetch policy (O3, >1 thread)")
parser.add_argument("--smt-share", default="Partitioned",
                    choices=["Dynamic", "Partitioned", "Threshold"],
                    help="SMT ROB/IQ/LSQ sharing policy (O3, >1 thread)")
parser.add_argument("--btb-assoc", type=int, default=1,
                    help="BTB associativity (2+ lets SMT threads that run the same code share sets)")
parser.add_argument("--minor-stock", action="store_true",
                    help="use gem5's stock MinorCPU parameters (no single-issue tweaks)")
parser.add_argument("--maxinsts", type=int, default=0,
                    help="stop after this many instructions on any thread")
args = parser.parse_args()

# ------------------------------------------------------------- the caches
# A two-level hierarchy that is the same for every experiment, so only the
# core changes between runs (latencies follow configs/learning_gem5).
class L1Cache(Cache):
    assoc = 4
    tag_latency = 2
    data_latency = 2
    response_latency = 2
    mshrs = 8
    tgts_per_mshr = 20

class L1ICache(L1Cache):
    size = "32KiB"

class L1DCache(L1Cache):
    size = "64KiB"

class L2Cache(Cache):
    size = "512KiB"
    assoc = 8
    tag_latency = 10
    data_latency = 10
    response_latency = 5
    mshrs = 32
    tgts_per_mshr = 16

# ---------------------------------------------------- branch predictors
def make_bp(kind):
    """Return a BranchPredictor unit whose *direction* predictor is `kind`.
    The BTB, return-address stack and indirect predictor stay at gem5's
    defaults so only the direction-prediction policy changes."""
    if kind == "static-nt":
        cond = StaticBP(predictTaken=False)       # always fall through
    elif kind == "static-t":
        cond = StaticBP(predictTaken=True)        # always take
    elif kind == "local":
        cond = LocalBP(localPredictorSize=2048, localCtrBits=2)   # 2-bit counters
    elif kind == "tournament":
        cond = TournamentBP()                     # local + global + chooser
    else:
        cond = TAGE()                             # state-of-the-art tagged geometric
    bp = BranchPredictor(conditionalBranchPred=cond)
    if args.btb_assoc > 1:
        bp.btb = SimpleBTB(associativity=args.btb_assoc)
    return bp

# ----------------------------------------------------- functional units
# Functional-unit pool scaled with the issue width: `w` integer ALUs, and
# about w/2 of each of the other unit types (never fewer than one).
IntMulDivCls = getattr(objs, "X86IntMultDiv", IntMultDiv)

def make_fu_pool(w):
    half = max(1, w // 2)
    return FUPool(FUList=[
        IntALU(count=w),
        IntMulDivCls(count=half),
        FP_ALU(count=half),
        FP_MultDiv(count=half),
        SIMD_Unit(count=half),
        RdWrPort(count=half),          # load/store ports
        PredALU(count=1),
        Matrix_Unit(count=1),
        System_Unit(count=1),
    ])

# Buffer sizes that grow with the width (ROB, IQ, LQ/SQ entries).
SIZES = {1: (32, 16, 8), 2: (64, 32, 16), 4: (128, 64, 32), 8: (192, 96, 48)}

def make_o3(nthreads):
    w = args.width
    rob, iq, lsq = SIZES[w]
    cpu = X86O3CPU(numThreads=nthreads)
    for p in ("fetchWidth", "decodeWidth", "renameWidth", "dispatchWidth",
              "issueWidth", "wbWidth", "commitWidth", "squashWidth"):
        setattr(cpu, p, w)
    cpu.numROBEntries = args.rob or rob
    cpu.instQueues = [IQUnit(numEntries=args.iq or iq,     # IQ lives in IQUnit in gem5 v25
                            smtIQPolicy=args.smt_share)]
    cpu.LQEntries = args.lsq or lsq
    cpu.SQEntries = args.lsq or lsq
    cpu.fuPool = make_fu_pool(w)
    cpu.branchPred = make_bp(args.bp)
    if nthreads > 1:                               # SMT policies
        cpu.smtFetchPolicy = args.smt_fetch
        cpu.smtROBPolicy = args.smt_share
        cpu.smtLSQPolicy = args.smt_share
        cpu.smtNumFetchingThreads = 1
    return cpu

def make_minor(nthreads):
    """Single-issue in-order pipeline: Fetch1 -> Fetch2 -> Decode -> Execute."""
    cpu = X86MinorCPU(numThreads=nthreads)
    cpu.branchPred = make_bp(args.bp)
    if args.minor_stock:
        return cpu
    cpu.fetch1FetchLimit = 1
    cpu.fetch2InputBufferSize = 2
    cpu.decodeInputWidth = 1
    cpu.decodeInputBufferSize = 3
    cpu.executeInputWidth = 1
    cpu.executeIssueLimit = 1
    cpu.executeMemoryIssueLimit = 1
    cpu.executeCommitLimit = 1
    cpu.executeMemoryCommitLimit = 1
    cpu.executeInputBufferSize = 7
    return cpu

# ------------------------------------------------------------ workloads
procs = []
for idx, spec in enumerate(args.cmd):
    parts = spec.split(":")
    binary = os.path.abspath(parts[0])
    procs.append(Process(pid=100 + idx, cmd=[binary] + parts[1:]))
nthreads = len(procs)

# --------------------------------------------------------------- system
system = System()
system.clk_domain = SrcClockDomain(clock=args.clock, voltage_domain=VoltageDomain())
system.mem_mode = "timing"
system.mem_ranges = [AddrRange("1GiB")]
if nthreads > 1:
    system.multi_thread = True

system.cpu = make_o3(nthreads) if args.cpu == "o3" else make_minor(nthreads)
if args.maxinsts:
    system.cpu.max_insts_any_thread = args.maxinsts

# L1 caches on the core, a shared L2, then the memory bus and DDR3.
system.cpu.icache = L1ICache()
system.cpu.dcache = L1DCache()
system.cpu.icache.cpu_side = system.cpu.icache_port
system.cpu.dcache.cpu_side = system.cpu.dcache_port
system.l2bus = L2XBar()
system.cpu.icache.mem_side = system.l2bus.cpu_side_ports
system.cpu.dcache.mem_side = system.l2bus.cpu_side_ports
system.l2cache = L2Cache()
system.l2cache.cpu_side = system.l2bus.mem_side_ports
system.membus = SystemXBar()
system.l2cache.mem_side = system.membus.cpu_side_ports
system.mem_ctrl = MemCtrl()
system.mem_ctrl.dram = DDR3_1600_8x8(range=system.mem_ranges[0])
system.mem_ctrl.port = system.membus.mem_side_ports
system.system_port = system.membus.cpu_side_ports

# x86 needs one interrupt controller per hardware thread, each with 3 ports.
system.cpu.createInterruptController()
for i in range(nthreads):
    system.cpu.interrupts[i].pio = system.membus.mem_side_ports
    system.cpu.interrupts[i].int_requestor = system.membus.cpu_side_ports
    system.cpu.interrupts[i].int_responder = system.membus.mem_side_ports

system.workload = SEWorkload.init_compatible(procs[0].cmd[0])
system.cpu.workload = procs if nthreads > 1 else procs[0]
system.cpu.createThreads()

# ------------------------------------------------------------ simulate
root = Root(full_system=False, system=system)
m5.instantiate()
print(f"[ilp_config] cpu={args.cpu} width={args.width} bp={args.bp} "
      f"threads={nthreads} cmds={args.cmd}")
exit_event = m5.simulate()
ticks = m5.curTick()
print(f"[ilp_config] exiting @ tick {ticks} because {exit_event.getCause()}")
