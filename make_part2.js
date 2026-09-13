// make_part2.js -- Assignment 4, Part 2: practical exploration of ILP techniques in gem5 (APA 7 report).
// Tables are filled from results/summary.csv, results/latency.csv and results/smt_summary.csv.
// Usage: NODE_PATH=~/Documents/BectranWorkSpace/node_modules node make_part2.js [out.docx]
const fs = require('fs');
const path = require('path');
const { Paragraph, AlignmentType } = require('docx');
const A = require('./apa.js');
const { P, H1, H2, H3, Bullet, Code, Ref, Blank, titlePage } = A;

const REPO = path.resolve(__dirname, '..');
const SHOTS = path.join(REPO, 'report', 'shots', 'cropped');
const FIGDIR = path.join(REPO, 'figures');
const OUT = process.argv[2] || path.join(__dirname, 'Assignment4-Part2-gem5-ILP-Experiments.docx');
const TITLE = 'Assignment 4, Part 2: Practical Exploration of Instruction-Level Parallelism Techniques in gem5';
const GITHUB = 'https://github.com/srimancherukuru/gem5-ilp-assignment4';
const counter = new A.Counter();
// Figure numbers follow this emission order; F() checks that the document emits them in the same order.
const FIG_ORDER = ['fig_make', 'fig_config_bp_fu', 'fig_config_o3', 'fig_config_system', 'fig_checksums', 'fig_runs_dir',
  'fig_staticbp_hh', 'fig_staticbp_cc', 'fig_staticbp_py', 'fig_gem5_branch', 'fig_gem5_rebuild',
  'fig_trace_raw', 'fig_pipeview_w1', 'fig_stage_debug', 'gantt_dep_chain_w1', 'gantt_int_alu_w1',
  'fig_pipestats', 'fig_table_latency', 'chart_latency_vs_width', 'chart_latency_stages', 'fig_stats_bsort',
  'fig_table_bp', 'chart_bp_predictors', 'chart_bp_width_interaction',
  'fig_run_w1', 'fig_run_w8', 'fig_table_sweep', 'chart_ipc_vs_width', 'chart_speedup_vs_width', 'gantt_dep_chain_w4', 'gantt_int_alu_w4', 'fig_pipeview_w4',
  'fig_run_smt', 'fig_table_smt', 'chart_smt_throughput', 'fig_btb_stats', 'chart_smt_btb', 'fig_smt_deadlock', 'fig_lsq_fix', 'fig_rob_assert',
  'fig_config_error', 'fig_fp_panic', 'fig_minor_trace'];
FIG_ORDER.forEach(k => counter.figNo(k));
let figEmitted = 0;

// ---------------------------------------------------------------- data
function readCsv(p) {
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.length);
  const parse = l => { const out = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out; };
  const head = parse(lines[0]);
  return lines.slice(1).map(l => { const v = parse(l); const o = {}; head.forEach((h, i) => o[h] = v[i]); return o; });
}
const S = readCsv(path.join(REPO, 'results', 'summary.csv'));
const L = readCsv(path.join(REPO, 'results', 'latency.csv'));
const M = readCsv(path.join(REPO, 'results', 'smt_summary.csv'));
const byName = Object.fromEntries(S.map(r => [r.name, r]));
const sweep = (w, wl) => byName[`ss_w${w}_${wl}`];
const bp = (b, w, wl) => byName[`bp_${b}_w${w}_${wl}`];
const lat = (w, wl) => L.find(r => +r.width === w && r.workload === wl);
const smt = n => M.find(r => r.run === n);
const WL = ['int_alu', 'dep_chain', 'fp_matmul', 'mem_stream', 'mem_chase', 'branchy', 'bsort'];
const f = (x, d = 2) => Number(x).toFixed(d);
const pct = (x, d = 1) => (100 * Number(x)).toFixed(d) + '%';
const big = x => Number(x).toLocaleString('en-US');
const nRuns = S.length;

// ---------------------------------------------------------------- helpers
function F(key, title, note, o = {}) {
  figEmitted++;
  if (counter.figNo(key) !== figEmitted) throw new Error(`figure order mismatch: ${key} is number ${counter.figNo(key)} but emitted ${figEmitted}th`);
  const file = (key.startsWith('chart_') || key.startsWith('gantt_')) ? path.join(FIGDIR, key + '.png') : path.join(SHOTS, key + '.png');
  return A.Fig(counter, key, file, title, note, o);
}
function T(key, title, headers, rows, widths, o = {}) { return A.Tbl(counter, key, title, headers, rows, widths, o); }
const c = [];

// ================================================================ title page
c.push(...titlePage({ title: TITLE, author: 'Sriman Cherukuru', affiliation: 'University of the Cumberlands',
  course: 'Computer Architecture', assignment: 'Assignment 4, Part 2: gem5 Experiments', date: 'September 13, 2026' }));
c.push(new Paragraph({ children: [A.tr(TITLE, { b: true })], alignment: AlignmentType.CENTER, spacing: { line: 480 }, pageBreakBefore: true }));

c.push(P(`This report presents the hands-on half of Assignment 4. Using the gem5 simulator already built for Assignments 1 and 2 (gem5 v25.1.0.1, X86, syscall-emulation mode), I configured a pipeline, ran seven small self-checking programs through it, and measured how four ILP techniques change its behavior: the basic pipeline itself, branch prediction, multiple issue, and simultaneous multithreading (SMT). In total ${nRuns} simulations were run from one parameterized configuration script. Two small additions were made to gem5 itself: a static branch predictor (StaticBP), because gem5 ships no “no prediction” option, and a fix for a crash in its SMT load/store-queue code. Everything (configuration, workloads, scripts, raw statistics, charts, screenshots and this report) is in the GitHub repository ${GITHUB}.`));

// ================================================================ 1. environment and method
c.push(H1('Environment and Method'));
c.push(H2('Simulator, Host and Toolchain'));
c.push(P('The simulator is the gem5 stable release v25.1.0.1 cloned in Assignment 1 and built as build/X86/gem5.opt with scons -j 16 on a MacBook with an Apple M5 Max (18 cores, 48 GB) running macOS 26.4.1, clang 16 and Python 3.14. Because macOS has no x86-64 Linux GCC, the guest programs are cross-compiled with zig cc to statically linked x86-64 musl ELF executables, the same recipe that worked for the Hello World program in Assignment 2. Vectorization and loop unrolling are disabled so that the kernels stay scalar integer and scalar double-precision code whose instruction classes are easy to read in the statistics (Figure ' + (counter.figNo('fig_make')) + ').'));
c.push(...F('fig_make', 'Cross-Compiling the Seven Workloads With zig for gem5’s x86-64 Syscall-Emulation Mode',
  'The Makefile passes -O2 -static -fno-vectorize -fno-slp-vectorize -fno-unroll-loops; each binary is a self-contained 1.3 MB static ELF file.'));
c.push(H2('The Configuration Script'));
c.push(P('One script, configs/ilp_config.py, drives every experiment. It builds a two-level cache hierarchy that never changes (32 KiB 4-way instruction cache and 64 KiB 4-way data cache with 2-cycle latency, a 512 KiB 8-way L2 with 10-cycle latency, a crossbar and a DDR3-1600 channel with 1 GiB) and then instantiates the core the command line asks for. The out-of-order core is gem5’s X86O3CPU. Its issue width sets the fetch, decode, rename, dispatch, issue, write-back and commit widths together, and the reorder buffer (ROB), instruction queue (IQ), load and store queues and functional-unit pool are scaled with it (Table 1). The direction predictor is selectable, the branch target buffer (BTB), return address stack and indirect predictor stay at gem5’s defaults, and giving several --cmd programs turns the core into an SMT core with one hardware thread per program. Figures ' + counter.figNo('fig_config_bp_fu') + ' to ' + counter.figNo('fig_config_system') + ' show the three parts of the script; the complete listing is Appendix A.'));
c.push(...T('t_core', 'Out-of-Order Core Configurations Used in the Issue-Width Sweep',
  ['Parameter', '1-wide', '2-wide', '4-wide', '8-wide'],
  [['Fetch/decode/rename/dispatch/issue/writeback/commit width', '1', '2', '4', '8'],
   ['Reorder buffer entries', '32', '64', '128', '192'],
   ['Instruction queue entries', '16', '32', '64', '96'],
   ['Load queue / store queue entries', '8 / 8', '16 / 16', '32 / 32', '48 / 48'],
   ['Integer ALUs', '1', '2', '4', '8'],
   ['Integer multiply/divide, FP add, FP multiply/divide, SIMD units (each)', '1', '1', '2', '4'],
   ['Load/store ports', '1', '1', '2', '4'],
   ['Physical integer / FP registers (gem5 default)', '256 / 256', '256 / 256', '256 / 256', '256 / 256'],
   ['Direction predictor (default)', 'Tournament', 'Tournament', 'Tournament', 'Tournament'],
   ['BTB / return address stack (default)', '4096 entries, direct-mapped / 16', 'same', 'same', 'same'],
   ['Clock; L1I / L1D; L2; DRAM', '2 GHz; 32 KiB / 64 KiB 4-way; 512 KiB 8-way; DDR3-1600', 'same', 'same', 'same']],
  [3860, 1700, 1250, 1250, 1300], { size: 18, note: 'The 1-wide configuration is the “basic pipeline” of Section 2; widths 2, 4 and 8 are the superscalar configurations of Section 5. Per-thread partitions apply when SMT is enabled (Section 6).' }));
c.push(...F('fig_config_bp_fu', 'ilp_config.py, Part 1: Cache Classes, Branch Predictor Selection and the Width-Scaled Functional-Unit Pool',
  'The static-nt and static-t choices instantiate the StaticBP class added to gem5 for this assignment.'));
c.push(...F('fig_config_o3', 'ilp_config.py, Part 2: Building the Out-of-Order Core (and the In-Order MinorCPU Alternative)',
  'All seven stage widths are set from --width; ROB, IQ and LSQ sizes come from the SIZES table; SMT fetch and sharing policies apply when more than one program is given.'));
c.push(...F('fig_config_system', 'ilp_config.py, Part 3: Processes, System, Caches, Memory, Interrupt Controllers and the Simulation Loop',
  'Each --cmd becomes a Process with its own PID; the x86 core needs one interrupt controller per hardware thread, each wired with three ports.'));

c.push(H2('Workloads'));
c.push(P('Seven small C programs were written so that each stresses one kind of instruction-level behavior (Table 2). Each takes an iteration count, runs for three to seven million instructions, and prints a checksum, so every gem5 run can be validated against a native run of the same source (Figure ' + counter.figNo('fig_checksums') + '): all seven checksums match, which confirms that the simulator executed the programs correctly. The sources are in Appendix C.'));
{
  const desc = { int_alu: 'Eight independent xorshift lanes: integer ALU work with high ILP', dep_chain: 'One serial multiply-add chain: no ILP (the limit case)',
    fp_matmul: '48×48 double-precision matrix multiply: FP multiply/add, L1-resident', mem_stream: 'Sequential sweep of a 4 MiB array: memory bandwidth/latency bound',
    mem_chase: 'Pointer chase, one cache line per hop over 2 MiB: dependent misses', branchy: 'Random data-dependent branches (50/50 and 25/75): predictor stress',
    bsort: 'Bubble sort of 800 random keys: mixed integer/memory/branches' };
  const rows = WL.map(wl => { const r = sweep(4, wl); return [wl, desc[wl], `${wl}:${r.program_output.split(' ')[1].split('=')[1] || ''}`.replace(/:$/, ''), big(r.insts_total), f(+r.ops_total / +r.insts_total, 2), pct(r.dcache_miss_rate, 2)]; });
  c.push(...T('t_wl', 'The Seven Workloads', ['Program', 'What it stresses', 'Argument', 'Instructions', 'µops / inst.', 'L1D miss rate'], rows,
    [1250, 3960, 1250, 1100, 900, 900], { size: 18, rightCols: [3, 4, 5], note: 'Instruction counts, micro-op (µop) ratios and miss rates are from the 4-wide runs. x86 instructions decode into one or more µops; gem5 reports IPC in instructions and the pipeline viewer records µops.' }));
}
c.push(...F('fig_checksums', 'Validation: Native Outputs (Apple M-Series, clang) Versus gem5 Outputs (x86-64 Out-of-Order Core) for the Same Arguments',
  'The order differs (the gem5 list is alphabetical) but every checksum is identical, so the simulated executions are correct.'));

c.push(H2('Metrics and Tooling'));
c.push(P('Throughput is instructions per cycle (IPC), computed from the committed-instruction and cycle counters in each run’s stats.txt; its inverse is CPI. Instruction latency is measured from gem5’s O3PipeView trace, which records for every micro-op the tick at which it was fetched, decoded, renamed, dispatched, issued, completed and retired. A small Python script (pipestats.py) turns that into the mean, median and 90th-percentile fetch-to-commit latency, the average delay between consecutive stages, the fraction of fetched µops that were squashed, and a Gantt-style pipeline diagram. Branch behavior comes from the predictor’s condPredicted/condIncorrect counters and the commit stage’s misprediction counter (reported as a rate and as mispredictions per thousand instructions, MPKI), and structural pressure from the rename stage’s ROB-full, IQ-full and store-queue-full event counters. All ' + nRuns + ' runs were launched from generated run matrices, and parse_stats.py aggregates every stats.txt into results/summary.csv (Figure ' + counter.figNo('fig_runs_dir') + ').'));
c.push(...F('fig_runs_dir', 'The Results Directory: One Folder per Simulation Run With stats.txt, config.ini and run.log', null, { maxH: 330 }));

c.push(H2('Adding a Static Predictor to gem5'));
c.push(P('The assignment asks for the pipeline “with and without branch prediction”. gem5’s out-of-order core cannot run without a predictor object, and it ships only dynamic predictors (local, tournament, bi-mode, TAGE variants and perceptrons). I therefore added StaticBP, a ConditionalPredictor subclass modeled on LocalBP: lookup() returns a fixed direction (not-taken by default, taken when predictTaken is set) and update() learns nothing (Figures ' + counter.figNo('fig_staticbp_hh') + ' to ' + counter.figNo('fig_staticbp_py') + '). The class was registered in the SConscript and in BranchPredictor.py, committed on a branch of the gem5 clone (Figure ' + counter.figNo('fig_gem5_branch') + '), and gem5 was rebuilt; only the new files and the generated parameter headers recompiled (Figure ' + counter.figNo('fig_gem5_rebuild') + '). Appendix B lists the source, and the patch is in the repository.'));
c.push(...F('fig_staticbp_hh', 'static_bp.hh: The StaticBP Class Declaration (Interface Identical to gem5’s LocalBP)', null, { maxH: 420 }));
c.push(...F('fig_staticbp_cc', 'static_bp.cc: lookup() Returns the Fixed Direction; update() and the History Hooks Do Nothing', null, { maxH: 430 }));
c.push(...F('fig_staticbp_py', 'The Python SimObject (BranchPredictor.py) With Its predictTaken Parameter, and the SConscript Registration', null, { maxH: 300 }));
c.push(...F('fig_gem5_branch', 'The gem5 Working Copy: Branch ilp-assignment4 With the Two Commits Made for This Assignment on Top of v25.1.0.1', null, { maxH: 280 }));
c.push(...F('fig_gem5_rebuild', 'Incremental Rebuild: Only static_bp.cc and the Generated StaticBP Parameter Files Were Compiled', null, { maxH: 200 }));

// ================================================================ 2. basic pipeline
c.push(H1('Basic Pipeline Simulation'));
c.push(P('gem5 has no textbook five-stage in-order model for x86 that works in this release (its in-order MinorCPU discards every wrong-path x86 instruction in a loop and needs more than 20 cycles per instruction; see Section 8), so the basic pipeline is the 1-wide out-of-order configuration of Table 1: one instruction per stage per cycle, a 32-entry window, one ALU and one memory port. Its stages are fetch, decode, rename, dispatch (into the instruction queue), issue and execute (with the memory access for loads and stores), write-back (“complete”) and commit (“retire”). Two tiny workloads, dep_chain with 30 iterations and int_alu with 30 iterations, were run with the O3PipeView debug flag so that every µop of the run is traced.'));
c.push(H2('Cycle-by-Cycle Behavior'));
c.push(P('Figure ' + counter.figNo('fig_trace_raw') + ' shows the raw trace records for three consecutive instructions of the dep_chain loop: each record lists the µop and the tick (1 tick = 1 ps, 500 ticks = one 2 GHz cycle) at which it passed each stage. gem5’s pipeline viewer, util/o3-pipeview.py, renders these records as a timeline (Figure ' + counter.figNo('fig_pipeview_w1') + '): f, d, n, p, i, c and r mark the cycle of fetch, decode, rename, dispatch, issue, completion and retirement, one row per µop in fetch order. The Fetch, Decode, Rename, IEW and Commit debug flags give the same information from the stages’ point of view, cycle by cycle (Figure ' + counter.figNo('fig_stage_debug') + '). To make the flow easier to read I also drew Gantt charts from the trace with matplotlib (Figures ' + counter.figNo('gantt_dep_chain_w1') + ' and ' + counter.figNo('gantt_int_alu_w1') + '): each row is a µop and each colored segment is the time it spent between two stages.'));
c.push(...F('fig_trace_raw', 'O3PipeView Trace Records for Three Consecutive Instructions of the dep_chain Loop (1-Wide Core)',
  'Each x86 instruction decodes into one or more µops (the IMUL into three: limm, mul1s, mulel). The ticks are 500 apart, one per cycle; complete:0 marks a µop that produced no result.'));
c.push(...F('fig_pipeview_w1', 'gem5’s Pipeline Viewer (util/o3-pipeview.py) for the dep_chain Loop on the 1-Wide Core',
  'Two loop iterations are visible. The f/d/n columns advance one cycle per µop because the front end is one µop wide; the multiply µops (mul1s/mulel) issue only when the previous iteration’s result is complete.', { maxH: 470 }));
c.push(...F('fig_stage_debug', 'Stage-Level Debug Output (Fetch, Decode, Rename, IEW, Commit Flags) for Five Cycles of the Same Loop',
  'Each line is one stage’s action at one tick; the 500-tick spacing between groups is one clock cycle.', { maxH: 470 }));
c.push(...F('gantt_dep_chain_w1', 'Pipeline Occupancy of 36 Consecutive µops of the dep_chain Loop on the 1-Wide Core',
  'Light-to-dark blue segments are the fetch→decode, decode→rename and rename→dispatch delays (fixed at 1, 1 and 2 cycles); pale orange is the wait in the instruction queue; orange is execution; green is the wait for in-order commit. The staircase shape shows the single-issue front end handing one µop per cycle to the back end; the longer orange segments of the mul1s µop (3-cycle multiply) and the pale-orange waits of the µops behind it show the dependency chain.', { maxH: 470 }));
c.push(...F('gantt_int_alu_w1', 'Pipeline Occupancy of 40 Consecutive µops of the int_alu Loop on the 1-Wide Core',
  'With eight independent lanes almost no µop waits for an operand: the pale-orange (dispatch→issue) segments vanish and every µop follows the fixed seven-cycle path, so the 1-wide core is limited purely by its fetch/decode bandwidth.', { maxH: 470 }));
{
  const rows = [];
  for (const [wl, w] of [['dep_chain', 1], ['int_alu', 1], ['dep_chain', 4], ['int_alu', 4]]) {
    const r = byName[`pv_demo_w${w}_${wl}`];
    const j = JSON.parse(fs.readFileSync(path.join(REPO, 'results', 'runs', `pv_demo_w${w}_${wl}`, 'pipestats.json')));
    rows.push([`${wl} (30 iterations)`, `${w}-wide`, big(r.cycles), big(r.insts_total), f(r.ipc, 3), big(j.instructions_fetched), big(j.instructions_committed), pct(j.squashed_fraction), f(j.latency_mean_cycles, 1)]);
  }
  c.push(...T('t_demo', 'The Fully Traced Demonstration Runs (Whole Program, Including C-Library Start-Up)',
    ['Workload', 'Core', 'Cycles', 'Instructions', 'IPC', 'µops fetched', 'µops committed', 'Squashed', 'Mean latency (cycles)'], rows,
    [1700, 800, 1000, 1150, 800, 1150, 1200, 900, 1060], { size: 17, rightCols: [2, 3, 4, 5, 6, 7, 8], note: 'These runs are dominated by libc start-up (about 4,000 instructions) and are used only to illustrate the stage flow; the steady-state measurements are in Sections 3 to 5.' }));
}
c.push(P('Two things stand out in the cycle-by-cycle view. First, the fixed part of the path is seven cycles: one cycle each for fetch→decode, decode→rename, two for rename→dispatch, one for execution and at least two from completion to retirement, so no µop can commit sooner than seven cycles after it was fetched. Second, the two workloads wait in different places. In dep_chain every multiply must wait for the previous iteration’s result, so µops queue in the instruction queue (pale orange) and the retire markers spread out; in int_alu the eight lanes are independent, nothing waits, and the only limit is that the 1-wide front end can supply one µop per cycle. That contrast is the whole story of ILP: the machine can only go as fast as the program’s dependences and its own narrowest stage allow.'));

// ================================================================ 3. metrics
c.push(H1('Performance Metrics: Throughput and Latency'));
c.push(P('For steady-state numbers each of the 28 issue-width runs was repeated with an O3PipeView trace window covering about 40,000 µops from the middle of the run, and pipestats.py discarded the first and last 10% of the window (Figure ' + counter.figNo('fig_pipestats') + '). Table 4 lists throughput and latency for the basic 1-wide pipeline and, for comparison, the 4-wide core; Figure ' + counter.figNo('fig_table_latency') + ' shows the full table for all four widths, Figure ' + counter.figNo('chart_latency_vs_width') + ' plots the latency trend and Figure ' + counter.figNo('chart_latency_stages') + ' breaks the latency into stage-to-stage delays. Figure ' + counter.figNo('fig_stats_bsort') + ' shows the raw counters behind the IPC and branch numbers of one run.'));
{
  const rows = WL.map(wl => { const a = lat(1, wl), b = lat(4, wl); return [wl, f(sweep(1, wl).ipc, 3), f(a.latency_mean_cycles, 1), f(a.latency_median_cycles, 0), f(a.latency_p90_cycles, 0), pct(a.squashed_fraction), f(sweep(4, wl).ipc, 3), f(b.latency_mean_cycles, 1), pct(b.squashed_fraction)]; });
  c.push(...T('t_lat', 'Throughput and Per-µop Fetch-to-Commit Latency (Steady-State Window) on the 1-Wide and 4-Wide Cores',
    ['Workload', 'IPC 1-wide', 'Mean lat.', 'Median', 'p90', 'Squashed', 'IPC 4-wide', 'Mean lat.', 'Squashed'], rows,
    [1300, 950, 950, 850, 800, 1000, 1100, 1210, 1200], { size: 18, rightCols: [1, 2, 3, 4, 5, 6, 7, 8], note: 'Latency in cycles per µop; IPC in instructions per cycle over the whole run. “Squashed” is the share of fetched µops that never committed (wrong-path work).' }));
}
c.push(...F('fig_pipestats', 'pipestats.py Output for the 4-Wide int_alu Trace Window: Throughput, Latency Distribution and Stage Delays', null, { maxH: 330 }));
c.push(...F('fig_table_latency', 'The Complete Latency Table for All Seven Workloads at Widths 1, 2, 4 and 8 (latency_table.py)',
  'uPC is the trace-derived µop throughput; IPC(win) divides it by the µop ratio and agrees with the whole-run IPC(run) from stats.txt.', { maxH: 470 }));
c.push(...F('chart_latency_vs_width', 'Mean Fetch-to-Commit Latency per µop Versus Issue Width (Log Scale)',
  'Latency rises with width for every workload whose throughput does not rise as fast, because the larger window holds more waiting µops (Little’s law).'));
c.push(...F('chart_latency_stages', 'Where the Latency Goes: Mean Delay Between Pipeline Events on the 1-Wide and 4-Wide Cores',
  'For the memory-bound workloads most of the time is spent queued in the front end behind a full window (fetch→decode) and waiting to commit behind an older miss (complete→retire).'));
c.push(...F('fig_stats_bsort', 'Raw Counters From stats.txt for the 4-Wide bsort Run: Cycles, IPC/CPI, Committed Instructions and µops, Predictor and Squash Statistics', null, { maxH: 330 }));
c.push(P('The patterns are instructive. On the 1-wide core the ALU-bound int_alu achieves 0.87 IPC with the minimum seven-cycle latency, dep_chain reaches only 0.50 IPC although its latency is almost as low (its µops wait in the queue, not in the pipeline), and the memory-bound programs have both low IPC (0.22 and 0.27) and long latencies (147 and 249 cycles) because every µop behind a DRAM miss waits for it. Widening the core exposes the throughput–latency trade-off: dep_chain’s IPC rises only from 0.50 to 0.89, yet its mean latency jumps from 7.9 cycles at 1-wide to 96 cycles at 4-wide and 136 at 8-wide. The reason is Little’s law: a 128-entry ROB divided by 1.44 µops per cycle is about 89 cycles of residence per µop, which matches the measurement. The front end runs far ahead, fills the window with µops that cannot execute, and each of them waits its turn. For mem_chase the window fills with µops that all depend on one pointer load, so latency grows from 249 to 943 cycles while IPC stays at 0.31. The squashed fraction grows with width for the branchy programs (bsort: 8% at 1-wide, 52% at 8-wide) because a wider machine fetches more wrong-path work before a misprediction is discovered, which foreshadows the next section.'));

// ================================================================ 4. branch prediction
c.push(H1('Impact of Branch Prediction'));
c.push(P('Five direction predictors were compared on the 4-wide core: the two static predictors (always not-taken, always taken), a 2-bit local predictor with 2,048 counters (gem5’s LocalBP), the default tournament predictor (2,048-entry local, 8,192-entry global and choice tables) and TAGE. The BTB, return-address stack and indirect predictor were identical in all runs, so the static configurations are the pipeline “without branch prediction” in the sense of having no learned direction prediction: unconditional branches still have their targets buffered. Three workloads were used, the two branch-heavy programs and, as a control, int_alu whose only branch is a loop back-edge. The static not-taken and tournament predictors were also run on the 1-wide core to see how the value of prediction depends on the machine width.'));
{
  const names = { 'static-nt': 'static not-taken', 'static-t': 'static taken', local: '2-bit local', tournament: 'tournament', tage: 'TAGE' };
  const rows = [];
  for (const wl of ['branchy', 'bsort', 'int_alu']) for (const b of ['static-nt', 'static-t', 'local', 'tournament', 'tage']) {
    const r = bp(b, 4, wl); rows.push([wl, names[b], f(r.ipc, 3), f(r.cpi, 3), pct(r.cond_mispred_rate), f(r.mpki, 1), pct(+r.fetched_insts / +r.insts_total - 1)]);
  }
  c.push(...T('t_bp', 'Branch Predictors on the 4-Wide Core', ['Workload', 'Predictor', 'IPC', 'CPI', 'Cond. mispredicted', 'MPKI', 'Wasted fetch'], rows,
    [1250, 1700, 900, 900, 1700, 900, 2010], { size: 18, rightCols: [2, 3, 4, 5, 6], note: 'MPKI = branch mispredictions per thousand committed instructions. “Wasted fetch” = instructions fetched beyond those committed, i.e., wrong-path fetch as a share of useful work.' }));
}
c.push(...F('fig_table_bp', 'The Branch-Predictor Runs as Aggregated by parse_stats.py (Including the 1-Wide Runs)', null, { maxH: 430 }));
c.push(...F('chart_bp_predictors', 'Throughput and Conditional-Branch Misprediction Rate by Predictor and Workload (4-Wide Core)',
  'Static taken is the worst predictor for these loops because most of their conditional branches fall through; the static not-taken bar for int_alu is 97.8% because its only branch is an always-taken loop back-edge.'));
c.push(...F('chart_bp_width_interaction', 'The Same Two Predictors on the 1-Wide and 4-Wide Cores',
  'The gain from dynamic prediction is small on the narrow core and large on the wide one.'));
c.push(P('The results separate the workloads by how predictable they are. The branches in branchy are decided by random data, so no predictor can do better than the entropy of the data allows: every dynamic predictor sits at 15–16% mispredicted (about 40 MPKI) and gains only 3–8% IPC over static not-taken, while static taken doubles the misprediction rate and cuts IPC by a third. Bubble sort is the opposite case. Its comparison branches look random in the first passes but become highly repetitive as the array gets sorted, so the more history a predictor keeps the better it does: 9.8% mispredicted for static not-taken, 7.1% for the 2-bit local predictor, 4.0% for tournament and 1.6% for TAGE, and IPC climbs from 0.70 to 0.94, 1.38 and 1.74, a 2.5× range from prediction alone. For int_alu the loop branch is taken 49,999 times out of 50,000; static not-taken mispredicts every iteration (97.8%), but because the loop body is 50 instructions long the damage is limited to 24% of IPC (2.06 versus 2.71), and every dynamic predictor learns the branch after one iteration.'));
c.push(P('Why accurate prediction is crucial becomes clear when width changes (Figure ' + counter.figNo('chart_bp_width_interaction') + '). On the 1-wide core the tournament predictor lifts bsort by 31% over static not-taken (0.39 to 0.51 IPC); on the 4-wide core the lift is 96% (0.70 to 1.38). The misprediction penalty in cycles, roughly the depth from fetch to branch resolution, is the same on both machines, but the wide machine loses four issue slots per penalty cycle instead of one and it also fetches and renames far more wrong-path work before the branch resolves (Table 5’s wasted-fetch column). Branch prediction is therefore not an independent optimization: it is what makes width usable, and a superscalar core without a good predictor spends most of its bandwidth on instructions it will throw away.'));

// ================================================================ 5. multiple issue
c.push(H1('Multiple Issue (Superscalar) Simulation'));
c.push(P('The 1-wide baseline was widened to 2, 4 and 8 with every stage width, the ROB, IQ and load/store queues and the functional-unit pool scaled together (Table 1). All seven workloads were run at all four widths with the tournament predictor; Figures ' + counter.figNo('fig_run_w1') + ' and ' + counter.figNo('fig_run_w8') + ' show two of the runs, Figure ' + counter.figNo('fig_table_sweep') + ' the aggregated table, and Figures ' + counter.figNo('chart_ipc_vs_width') + ' and ' + counter.figNo('chart_speedup_vs_width') + ' the results as charts.'));
c.push(...F('fig_run_w1', 'Running int_alu on the 1-Wide Core: the Configuration Banner, the Program’s Own Output and the Exit Message', null, { maxH: 300 }));
c.push(...F('fig_run_w8', 'The Same Program on the 8-Wide Core: Identical Output and Checksum, 4.3 Times Fewer Ticks', null, { maxH: 300 }));
c.push(...F('fig_table_sweep', 'The 28 Issue-Width Runs Aggregated by parse_stats.py', null, { maxH: 450 }));
{
  const rows = WL.map(wl => { const v = [1, 2, 4, 8].map(w => +sweep(w, wl).ipc); return [wl, ...v.map(x => f(x, 3)), f(v[3] / v[0], 2) + '×', f(sweep(8, wl).cpi, 2)]; });
  c.push(...T('t_sweep', 'IPC Versus Issue Width and the 8-Wide Speedup Over the 1-Wide Core', ['Workload', '1-wide', '2-wide', '4-wide', '8-wide', 'Speedup 8/1', 'CPI 8-wide'], rows,
    [1700, 1100, 1100, 1100, 1100, 1560, 1700], { size: 18, rightCols: [1, 2, 3, 4, 5, 6] }));
}
c.push(...F('chart_ipc_vs_width', 'IPC of Every Workload at Issue Widths 1, 2, 4 and 8'));
c.push(...F('chart_speedup_vs_width', 'Speedup Over the 1-Wide Core; the Gray Line Is Ideal Linear Scaling',
  'No workload reaches the ideal line; the ranking follows the amount of independent work each program exposes.'));
{
  const rows = WL.map(wl => { const r = sweep(4, wl), n = +r.insts_total; return [wl, f(1000 * r.rob_full / n, 2), f(1000 * r.iq_full / n, 2), f(1000 * r.sq_full / n, 2), f(1000 * r.lq_full / n, 2), pct(r.dcache_miss_rate, 2)]; });
  c.push(...T('t_stall', 'Structural Stall Events per Thousand Instructions on the 4-Wide Core (Rename Stage Blocked Because a Buffer Was Full)',
    ['Workload', 'ROB full', 'IQ full', 'Store queue full', 'Load queue full', 'L1D miss rate'], rows, [1900, 1400, 1400, 1700, 1600, 1360], { size: 18, rightCols: [1, 2, 3, 4, 5],
    note: 'Each workload hits a different wall: the ROB for int_alu and fp_matmul, the instruction queue for the dependency chain (µops waiting for operands), the store queue for the memory streams.' }));
}
c.push(...F('gantt_dep_chain_w4', 'dep_chain on the 4-Wide Core: the Front End Delivers Four µops per Cycle but They Queue Behind the Multiply Chain',
  'Compared with Figure ' + counter.figNo('gantt_dep_chain_w1') + ', fetch, decode and rename now happen in bursts of four, yet the issue (orange) markers keep the same one-multiply-per-iteration spacing and the pale-orange waits grow.', { maxH: 470 }));
c.push(...F('gantt_int_alu_w4', 'int_alu on the 4-Wide Core: Four µops per Cycle Move Through Every Stage Almost Without Waiting',
  'The eight independent lanes give the scheduler enough ready µops to fill most of the four issue slots each cycle.', { maxH: 470 }));
c.push(...F('fig_pipeview_w4', 'gem5’s Pipeline Viewer for the dep_chain Loop on the 4-Wide Core',
  'Groups of µops now share the same fetch (f), decode (d) and rename (n) cycles; the issue and completion columns still form the diagonal of the dependency chain.', { maxH: 470 }));
c.push(P('Superscalar issue helps exactly where the program offers independent work. int_alu, whose eight lanes provide eight independent chains, scales to 3.70 IPC at 8-wide, a 4.3× speedup; it is held back only by the ROB filling up (Table 7) and by x86 decode bandwidth. fp_matmul scales 3.3× because its inner loop has independent multiply-adds across the columns and because the number of FP units grows with width (1, 1, 2, 4). bsort gains 2.9× and branchy 2.5×: both have independent work per element, but mispredictions waste an increasing share of the wider machine (Section 4). At the other end, dep_chain improves from 0.50 to 0.80 IPC when the width goes from 1 to 2 and then stops: its loop is one chain of a 3-cycle multiply, an add, a shift and an exclusive-or, and no width can shorten that chain; the instruction queue simply fills with µops waiting for it (406 IQ-full events per thousand instructions). mem_chase is the extreme case, 1.16× at 8-wide, because every hop is a DRAM access that depends on the previous hop; the wider core only waits with more entries occupied. mem_stream doubles (2.0×) not because of width itself but because the store and load queues that come with it let more misses overlap, which is memory-level rather than instruction-level parallelism.'));

// ================================================================ 6. SMT
c.push(H1('Multithreading (SMT)'));
c.push(P('For SMT the 4-wide core was given two (or four) hardware threads, one per program, with gem5’s default policies: round-robin fetch and commit and partitioned ROB, IQ and load/store queues, so each of two threads owns half of the 128-entry ROB, the 64-entry IQ and the 32-entry load and store queues while the functional units, caches and predictor are shared. Each run stops when the first thread reaches three million committed instructions, which avoids a tail in which one thread runs alone. Throughput is compared with the fairest single-core alternative, running the same instructions one program after the other at each program’s single-thread IPC (“sequential IPC”); the ratio of the two is the throughput speedup. Figure ' + counter.figNo('fig_run_smt') + ' shows one run, Figure ' + counter.figNo('fig_table_smt') + ' the per-run metrics and Figure ' + counter.figNo('chart_smt_throughput') + ' the comparison.'));
c.push(...F('fig_run_smt', 'An SMT Run of fp_matmul and int_alu: Both Programs’ Outputs and the Per-Thread Committed-Instruction Counters', null, { maxH: 300 }));
c.push(...F('fig_table_smt', 'smt_table.py: Total and Per-Thread IPC, Sequential Baseline, Throughput and Weighted Speedup, and Buffer-Full Events for Every SMT Run', null, { maxH: 430 }));
{
  const sel = [['smt2_int_alu+dep_chain', 'int_alu + dep_chain'], ['smt2_fp_matmul+int_alu', 'fp_matmul + int_alu'], ['smt2_bsort+branchy', 'bsort + branchy'],
    ['smt2_fp_matmul+mem_chase', 'fp_matmul + mem_chase'], ['smt2_mem_stream+mem_chase', 'mem_stream + mem_chase'], ['smt2_int_alu+int_alu', 'int_alu ×2 (1-way BTB)'],
    ['smt2btb2_int_alu+int_alu', 'int_alu ×2 (2-way BTB)'], ['smt2_dep_chain+dep_chain', 'dep_chain ×2 (1-way BTB)'], ['smt2btb2_dep_chain+dep_chain', 'dep_chain ×2 (2-way BTB)'],
    ['smt2_bsort+bsort', 'bsort ×2 (1-way BTB)'], ['smt2btb2_bsort+bsort', 'bsort ×2 (2-way BTB)'], ['smt4_int_alu+dep_chain+mem_chase+branchy', 'int_alu + dep_chain + mem_chase + branchy']];
  const rows = sel.map(([n, label]) => { const r = smt(n); const per = [0, 1, 2, 3].map(i => r[`ipc_t${i}`]).filter(x => x !== '').map(x => f(x, 2)).join(' / ');
    return [label, per, f(r.ipc_total, 3), f(r.seq_ipc, 3), f(r.throughput_speedup, 2) + '×', f(r.weighted_speedup, 2)]; });
  c.push(...T('t_smt', 'SMT Throughput on the 4-Wide Core (Partitioned Buffers, Round-Robin Fetch and Commit)',
    ['Threads', 'Per-thread IPC', 'Total IPC', 'Sequential IPC', 'Throughput speedup', 'Weighted speedup'], rows,
    [3160, 1500, 1000, 1200, 1300, 1200], { size: 18, rightCols: [2, 3, 4, 5], note: 'Sequential IPC = the same work run back to back on one core at the single-thread IPCs. Weighted speedup = Σ IPCᵢ,SMT / IPCᵢ,alone.' }));
}
c.push(...F('chart_smt_throughput', 'Same Work Run Back to Back on One Core (Gray) Versus Simultaneously With SMT (Stacked by Thread)',
  'Labels give the SMT total IPC and the throughput speedup over sequential execution.'));
c.push(P('SMT improves throughput in every pairing, and by how much depends on what the threads leave idle. Two compute threads that each already use a good share of the 4-wide core gain modestly: fp_matmul with int_alu reaches 2.59 IPC, 1.22× the sequential 2.13, and two copies of int_alu reach 3.44 IPC (1.27×) once the BTB problem described below is fixed, because one int_alu alone already fills 2.7 of the 4 issue slots. Pairs in which one thread is stalled most of the time gain the most: int_alu with dep_chain gives 1.62× because the chain’s µops wait in its half of the queue while int_alu uses the ALUs, two dep_chain copies give exactly 2.00× since each chain is limited by its own latency and they interleave perfectly, and the memory-bound pairs give 2.4–2.5× because one thread’s cache misses overlap with the other’s work (fp_matmul with mem_chase 1.43 IPC versus 0.58 sequential). Four threads together reach 2.20 IPC, 2.83× the throughput of running them one after another. The weighted speedups equal the throughput speedups here because each thread received a fair share of the machine.'));

c.push(H2('Resource Sharing and Contention Points'));
{
  const rowOf = (label, r) => { const n = +r.insts_total; return [label, f(1000 * r.rob_full / n, 1), f(1000 * r.iq_full / n, 1), f(1000 * r.sq_full / n, 1), pct(r.cond_mispred_rate, 2)]; };
  const rows = [rowOf('int_alu alone', sweep(4, 'int_alu')), rowOf('dep_chain alone', sweep(4, 'dep_chain')), rowOf('int_alu + dep_chain (SMT)', byName['smt2_int_alu+dep_chain']),
    rowOf('fp_matmul alone', sweep(4, 'fp_matmul')), rowOf('fp_matmul + int_alu (SMT)', byName['smt2_fp_matmul+int_alu']),
    rowOf('mem_stream alone', sweep(4, 'mem_stream')), rowOf('mem_chase alone', sweep(4, 'mem_chase')), rowOf('mem_stream + mem_chase (SMT)', byName['smt2_mem_stream+mem_chase']),
    rowOf('int_alu ×2, 1-way BTB (SMT)', byName['smt2_int_alu+int_alu']), rowOf('int_alu ×2, 2-way BTB (SMT)', byName['smt2btb2_int_alu+int_alu'])];
  c.push(...T('t_share', 'How the Shared Pipeline Is Used: Buffer-Full Events per Thousand Instructions and Misprediction Rate, Alone Versus in SMT',
    ['Configuration', 'ROB full', 'IQ full', 'Store queue full', 'Cond. mispredicted'], rows, [3400, 1400, 1400, 1700, 1460], { size: 18, rightCols: [1, 2, 3, 4],
    note: 'With partitioned buffers each thread owns half of the ROB, IQ and queues. Round-robin fetch also halves the rate at which each partition fills, so per-instruction buffer-full events fall for int_alu and fp_matmul although their partitions are smaller; the throughput cost appears as shared fetch and issue bandwidth instead.' }));
}
c.push(P('The counters show where threads collide. Partitioning halves each thread’s ROB, yet int_alu’s ROB-full events per thousand instructions fall from 40 alone to 4–14 in SMT, because round-robin fetch feeds each thread only every other cycle, so the smaller partition fills less often; int_alu’s own IPC nevertheless drops from 2.71 to 1.69–1.76 because it now receives half of the fetch, rename and issue bandwidth while the partner uses the other half. The instruction queue remains dep_chain’s wall and the store queue the memory programs’ wall (Table 9); SMT does not relieve those, it overlaps them with another thread’s progress. The functional units were never the bottleneck (gem5’s fuBusyRate stayed at zero) because the unit counts scale with width. Two contention points were less expected and are worth describing in detail.'));
c.push(H3('A Shared, Thread-Tagged Branch Target Buffer'));
c.push(P('When two copies of the same program run together, the misprediction rate explodes: 99% of int_alu’s conditional branches and 67% of dep_chain’s are counted as mispredicted, IPC drops and the BTB hit ratio falls to 20–38% (Figure ' + counter.figNo('fig_btb_stats') + '). The cause is that gem5 tags each BTB entry with the thread that installed it and the default BTB is direct-mapped: both threads execute the same loop branch at the same address, so they evict each other’s entry every iteration, the predicted-taken branch has no target, gem5 falls back to “not taken”, and the branch is mispredicted (the predTakenBTBMiss counter equals the misprediction count). Making the BTB two-way set-associative with a new --btb-assoc option lets both threads’ entries coexist: the hit ratio returns to 99–100%, mispredictions vanish, and the same-program pairs speed up by 20% (int_alu), 55% (dep_chain) and 11% (bsort) (Figure ' + counter.figNo('chart_smt_btb') + '). Different programs do not collide because they occupy different addresses.'));
c.push(...F('fig_btb_stats', 'Two Copies of int_alu With the Default Direct-Mapped BTB Versus a 2-Way BTB: Cycles, BTB Hit Ratio, Predicted-Taken BTB Misses and Mispredictions', null, { maxH: 300 }));
c.push(...F('chart_smt_btb', 'Effect of BTB Associativity on Same-Program SMT Pairs: Execution Time and BTB Hit Ratio'));
c.push(H3('A Store-Writeback Deadlock in gem5’s x86 SMT Model'));
c.push(P('Pairing mem_chase or mem_stream with a program that has no memory traffic (int_alu or dep_chain) produced runs in which the memory thread committed exactly 1,583 (or 1,484) instructions and then nothing, in either thread order and under both fetch policies, while the partner ran at a third of its usual speed. Tracing the first cycles (Figure ' + counter.figNo('fig_smt_deadlock') + ') showed the stuck thread at the head of its ROB on a locked cmpxchg inside musl’s malloc, with commit repeating “waiting for all stores to writeback” forever: a store of that thread never wrote back, so the atomic instruction, which must wait for older stores, never committed. The same programs run correctly alone and next to fp_matmul or each other, so this is a defect in the interaction of gem5’s x86 total-store-order handling with SMT rather than a property of the workloads. I documented it and chose thread pairings that do not trigger it.'));
c.push(...F('fig_smt_deadlock', 'Commit-Stage Debug Output of the Stuck Thread and Its Last Executed Instructions: a Locked cmpxchg Waiting for a Store That Never Writes Back', null, { maxH: 330 }));
c.push(H3('Sharing Policies: Partitioned Versus Dynamic'));
c.push(P('gem5 also offers Dynamic and Threshold sharing of the ROB and queues. Selecting either aborted the simulator immediately with a stack overflow whose backtrace was LSQ::sqFull repeated hundreds of times: LSQ::sqFull(tid) calls sqFull(), which iterates over threads and calls sqFull(tid) again. I fixed the recursion by making the per-thread check compare the combined occupancy with the total number of entries (Figure ' + counter.figNo('fig_lsq_fix') + ', second commit in Figure ' + counter.figNo('fig_gem5_branch') + '). With that fix the Dynamic policy gets past initialization but then fails an assertion in ROB::insertInst because two threads are each allowed to fill the whole shared ROB (Figure ' + counter.figNo('fig_rob_assert') + '); the policy has clearly not been maintained in this gem5 version, so all SMT results above use the Partitioned policy, which is also what commercial two-thread cores do for their reorder buffers.'));
c.push(...F('fig_lsq_fix', 'The LSQ Fix Committed on the gem5 Branch: LSQ::lqFull(tid) and sqFull(tid) No Longer Recurse Under the Dynamic Policy', null, { maxH: 430 }));
c.push(...F('fig_rob_assert', 'After the LSQ Fix the Dynamic Policy Reaches a Second Defect: the ROB Over-Subscription Assertion', null, { maxH: 200 }));
c.push(P('Does SMT significantly improve the number of instructions completed per cycle? On this core it does: 22–62% more throughput for pairs of compute-bound threads, 2.4–2.5× for memory-bound pairs and 2.8× with four mixed threads, all with a fair split between threads. The gains come from filling idle issue slots and overlapping stalls, so they are largest exactly where the single-thread ILP techniques of Sections 4 and 5 gave up: the dependency chain and the pointer chase.'));

// ================================================================ 7. key questions
c.push(H1('Key Questions'));
c.push(H2('How Do the ILP Techniques Interact?'));
c.push(P('The experiments show that the techniques multiply rather than add. Width without prediction is wasted: on bsort the tournament predictor is worth 31% on the 1-wide core and 96% on the 4-wide core, and the fraction of fetched µops that are squashed rises from 8% to 52% between the 1-wide and 8-wide cores. Width without independent work is also wasted, and SMT is the technique that recovers it: dep_chain stops scaling at 2-wide, but two dep_chain threads on the 4-wide core reach 2.0× the throughput. The memory system interacts with all of them: a larger window and load queue raise mem_stream’s throughput by overlapping misses, but they also raise every instruction’s latency, and mem_chase is immune to every single-thread technique and only helped by SMT. Even the predictor and SMT interact, through the shared BTB.'));
c.push(H2('What Are the Limitations of These Techniques?'));
c.push(P('Each technique runs into a limit set by the program rather than the hardware. Multiple issue is bounded by the length of the critical dependence chain (dep_chain: 0.89 IPC at any width), branch prediction by the information content of the branch outcomes (branchy: 15% mispredictions with every predictor), and deeper windows by memory latency (mem_chase: 943 cycles of latency per µop for 0.31 IPC). SMT does not remove any of these limits; it hides them by finding work elsewhere, and it introduces its own: partitioned buffers halve what each thread gets, shared structures such as the BTB can thrash, and the simulator itself showed how delicate the shared machinery is (the store-writeback deadlock and the unmaintained Dynamic policy).'));
c.push(H2('How Can Complexity Be Balanced Against Benefit?'));
c.push(P('The sweep gives a concrete answer for this design. Going from 1 to 2 wide roughly doubles the buffers and functional units and gives 1.6–1.8× on the ILP-rich programs; going from 4 to 8 wide doubles them again for 1.1–1.4×, and for the dependency- and latency-bound programs for nothing, while every instruction’s latency and every misprediction’s cost keep growing. The 4-wide core is where most of the benefit of width is captured, which is why real cores of this class are four to six wide and spend their remaining transistors on prediction, caches and SMT instead. Branch prediction is the cheapest technique per unit of benefit (a few kilobytes of tables for up to 2.5× on bsort), and SMT is the most effective way to use the slots that width leaves empty, at the cost of per-thread fairness and shared-structure design care.'));

// ================================================================ 8. troubleshooting
c.push(H1('Troubleshooting and Issue Log'));
c.push(P('Table 10 lists every problem met while doing the assignment, how it was diagnosed and how it was resolved; three of them are illustrated in Figures ' + counter.figNo('fig_config_error') + ' to ' + counter.figNo('fig_minor_trace') + '.'));
c.push(...T('t_issues', 'Issues Encountered, Their Diagnosis and Resolution',
  ['Issue', 'Symptom', 'Cause and fix'],
  [['Instruction-queue size parameter', 'AttributeError: Invalid assignment for Class X86O3CPU with parameter numIQEntries', 'In v25.1 the IQ moved into an IQUnit object; the size is instQueues=[IQUnit(numEntries=…)].'],
   ['FP kernel crashed in gem5', 'panic: Tried to write unmapped address 0x7ffffffff000 at every width and with every predictor', 'musl’s printf(“%f”) uses x87 long-double code that gem5’s x86 model executes incorrectly; printing the checksum as a scaled integer avoids the path.'],
   ['MinorCPU unusable on x86', 'Stock or tuned in-order MinorCPU ran int_alu at 24 cycles per instruction', 'The MinorTrace/MinorExecute trace shows the execute stage discarding a stream of “(invalid)” wrong-path instructions every cycle after each branch; the model’s x86 support is not usable here, so the 1-wide O3 core is the basic pipeline.'],
   ['Empty field in the run matrix', 'Only the four traced demo runs completed; other runs failed instantly with argparse errors', 'xargs -0 drops an empty field, shifting the arguments; the matrix now writes NONE for “no gem5 options” and the runner strips it.'],
   ['Same-program SMT threads mispredict 99%', 'condIncorrect ≈ predTakenBTBMiss; BTB hit ratio 20–38%', 'Thread-tagged, direct-mapped BTB entries thrash; added --btb-assoc and used a 2-way BTB for those pairs (Section 6).'],
   ['SMT thread starves', 'One thread committed exactly 1,583 (mem_chase) or 1,484 (mem_stream) instructions, then nothing', 'Store-writeback deadlock at a locked cmpxchg in malloc (gem5 x86 TSO + SMT); documented, and pairings that trigger it excluded (Section 6).'],
   ['Dynamic/Threshold sharing policy aborts', 'Immediate stack overflow, backtrace of LSQ::sqFull repeated', 'Infinite recursion in LSQ::lqFull/sqFull(tid); fixed in lsq.cc, after which a ROB over-subscription assertion shows the policy is unmaintained; Partitioned policy used.'],
   ['Trace throughput above stats IPC', 'pipestats reported 1.56 “IPC” for branchy where stats.txt said 0.77', 'O3PipeView records µops, not instructions; the latency table reports µop throughput and divides by the measured µop ratio to cross-check against IPC.'],
   ['Latency windows at trace edges', 'µops fetched before or retiring after a tick window have incomplete records', 'pipestats trims the first and last 10% of fetched µops in the window before measuring.']],
  [2000, 3300, 4060], { size: 17, note: 'All logs referenced here are in results/logs/ of the repository.' }));
c.push(...F('fig_config_error', 'The First Run of the Configuration Script: the IQ-Size Parameter Had Moved Into IQUnit in gem5 v25.1', null, { maxH: 220 }));
c.push(...F('fig_fp_panic', 'The FP Kernel’s Panic Before the Checksum Was Changed to an Integer: an Unmapped Write Above the Stack From musl’s x87 printf Path', null, { maxH: 330 }));
c.push(...F('fig_minor_trace', 'Why the In-Order MinorCPU Was Dropped: Its Execute Stage Discards “(invalid)” Wrong-Path x86 Instructions Every Cycle', null, { maxH: 330 }));

// ================================================================ 9. conclusion
c.push(H1('Conclusion'));
c.push(P('Starting from the gem5 build of the earlier assignments, this work turned one configuration script into ' + nRuns + ' simulations that measure the classical ILP techniques on a single x86 core. The basic 1-wide pipeline needs seven cycles per µop and delivers at most one µop per cycle; the pipeline viewer and Gantt charts make visible that a dependency chain waits in the instruction queue while independent lanes flow through untouched. Widening the core to 8 issue slots gives 4.3× on ALU-rich code, 3.3× on floating point, and almost nothing on a serial chain or a pointer chase, while every instruction’s latency grows with the window. Branch prediction is what makes width usable: on bubble sort TAGE delivers 2.5 times the IPC of a static predictor at 4-wide, and the value of prediction triples between the 1-wide and 4-wide cores. SMT recovers the slots the other techniques leave empty, 1.2–1.6× for compute pairs and 2.4–2.8× for memory-bound and mixed sets, provided shared structures such as the BTB are designed for it. Along the way the assignment required real engineering: a new predictor class, a bug fix in gem5’s SMT load/store queue, a workaround for an x87 emulation gap, and the diagnosis of a store-writeback deadlock, all of which are recorded in the repository at ' + GITHUB + '.'));

// ================================================================ references
c.push(H1('References', { pageBreak: true }));
c.push(Ref(['Binkert, N., Beckmann, B., Black, G., Reinhardt, S. K., Saidi, A., Basu, A., Hestness, J., Hower, D. R., Krishna, T., Sardashti, S., Sen, R., Sewell, K., Shoaib, M., Vaish, N., Hill, M. D., & Wood, D. A. (2011). The gem5 simulator. ', { t: 'ACM SIGARCH Computer Architecture News, 39', i: true }, '(2), 1–7. https://doi.org/10.1145/2024716.2024718']));
c.push(Ref(['Cherukuru, S. (2026). ', { t: 'gem5-ilp-assignment4: Exploring instruction-level parallelism in gem5', i: true }, ' [Source code and data]. GitHub. ' + GITHUB]));
c.push(Ref(['gem5 Project. (n.d.). ', { t: 'Visualization', i: true }, '. gem5 documentation. Retrieved September 13, 2026, from https://www.gem5.org/documentation/general_docs/cpu_models/visualization/']));
c.push(Ref(['gem5 Project. (2026). ', { t: 'gem5 source code', i: true }, ' (Version 25.1.0.1) [Computer software]. GitHub. https://github.com/gem5/gem5']));
c.push(Ref(['Hennessy, J. L., & Patterson, D. A. (2019). ', { t: 'Computer architecture: A quantitative approach', i: true }, ' (6th ed.). Morgan Kaufmann.']));
c.push(Ref(['Lowe-Power, J., Ahmad, A. M., Akram, A., Alian, M., Amslinger, R., Andreozzi, M., Armejach, A., Asmussen, N., Beckmann, B., Bharadwaj, S., Black, G., Bloom, G., Bruce, B. R., Carvalho, D. R., Castrillon, J., Chen, L., Derumigny, N., Diestelhorst, S., Elsasser, W., . . . Zulian, É. F. (2020). ', { t: 'The gem5 simulator: Version 20.0+', i: true }, '. arXiv. https://doi.org/10.48550/arXiv.2007.03152']));
c.push(Ref(['McFarling, S. (1993). ', { t: 'Combining branch predictors', i: true }, ' (WRL Technical Note TN-36). Digital Equipment Corporation Western Research Laboratory.']));
c.push(Ref(['Seznec, A., & Michaud, P. (2006). A case for (partially) TAgged GEometric history length branch prediction. ', { t: 'Journal of Instruction-Level Parallelism, 8', i: true }, ', 1–23.']));
c.push(Ref(['Tullsen, D. M., Eggers, S. J., & Levy, H. M. (1995). Simultaneous multithreading: Maximizing on-chip parallelism. In ', { t: 'Proceedings of the 22nd Annual International Symposium on Computer Architecture (ISCA ’95)', i: true }, ' (pp. 392–403). ACM. https://doi.org/10.1145/223982.224449']));

// ================================================================ appendices
function listing(file, size = 14) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  return lines.map((l, i) => new Paragraph({ children: [A.tr(l === '' ? ' ' : l.replace(/\t/g, '    '), { mono: true, size })],
    spacing: { line: 216, before: i === 0 ? 120 : 0, after: 0 }, shading: { type: require('docx').ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } }));
}
c.push(H1('Appendix A', { pageBreak: true }));
c.push(P([{ t: 'The gem5 Configuration Script (configs/ilp_config.py)', b: true }], { center: true, noindent: true, keepNext: true }));
c.push(...listing(path.join(REPO, 'configs', 'ilp_config.py')));
c.push(H1('Appendix B', { pageBreak: true }));
c.push(P([{ t: 'The StaticBP Predictor Added to gem5 (src/cpu/pred/static_bp.hh and static_bp.cc)', b: true }], { center: true, noindent: true, keepNext: true }));
c.push(...listing(path.join(process.env.HOME, 'git', 'gem5', 'src', 'cpu', 'pred', 'static_bp.hh')));
c.push(Blank());
c.push(...listing(path.join(process.env.HOME, 'git', 'gem5', 'src', 'cpu', 'pred', 'static_bp.cc')));
c.push(H1('Appendix C', { pageBreak: true }));
c.push(P([{ t: 'Workload Sources (workloads/)', b: true }], { center: true, noindent: true, keepNext: true }));
for (const fn of ['common.h', 'int_alu.c', 'dep_chain.c', 'fp_matmul.c', 'mem_stream.c', 'mem_chase.c', 'branchy.c', 'bsort.c']) {
  c.push(P([{ t: fn, b: true }], { noindent: true, single: true, keepNext: true }));
  c.push(...listing(path.join(REPO, 'workloads', fn)));
  c.push(Blank());
}

A.write(A.buildDoc({ title: TITLE, children: c }), OUT).then(() => console.log('figures:', counter.fig, 'tables:', counter.tbl));
