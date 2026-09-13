#!/bin/zsh
# Result-dependent Terminal.app screenshots for the Part 2 report.
R=~/git/gem5-ilp-assignment4; S=$R/tools/shot.sh; O=$R/report/shots/raw; PY=/private/tmp/claude-501/-Users-srimancherukuru-Documents-BectranWorkSpace/93be3428-3876-46bd-9c28-435fc16ac7db/scratchpad/venv/bin/python; cd $R
FONT=12 $S $O/fig_run_w1.png 18 118 1 "grep -v '^warn' results/runs/ss_w1_int_alu/run.log | tail -14 | cut -c1-116"
FONT=12 $S $O/fig_run_w8.png 18 118 1 "grep -v '^warn' results/runs/ss_w8_int_alu/run.log | tail -14 | cut -c1-116"
FONT=12 $S $O/fig_stats_bsort.png 24 118 1 "grep -E '^system\.cpu\.(numCycles|ipc|cpi|commitStats0\.(numInsts|numOps)|branchPred\.(condPredicted|condIncorrect|BTBHitRatio|lookups_0::total)|commit\.(branchMispredicts|commitSquashedInsts)|numSquashedInsts|rename\.(ROBFullEvents|IQFullEvents|SQFullEvents)|idleCycles)\b' results/runs/ss_w4_bsort/stats.txt | cut -c1-116"
FONT=11 $S $O/fig_table_sweep.png 36 132 1 "python3 scripts/parse_stats.py | grep -E '^(run|ss_w)' | cut -c1-130"
FONT=11 $S $O/fig_table_bp.png 30 132 1 "python3 scripts/parse_stats.py | grep -E '^(run|bp_)' | cut -c1-130"
FONT=11 $S $O/fig_table_smt.png 26 132 1 "python3 scripts/smt_table.py | cut -c1-130"
FONT=10 $S $O/fig_table_latency.png 36 150 1 "$PY scripts/latency_table.py | cut -c1-148"
FONT=12 $S $O/fig_pipestats.png 18 118 1 "$PY scripts/pipestats.py results/runs/pv_w4_int_alu/trace.out --trim 0.1"
FONT=12 $S $O/fig_run_smt.png 16 118 1 "grep -v '^warn' 'results/runs/smt2_fp_matmul+int_alu/run.log' | tail -10 | cut -c1-116; grep -E '^system\.cpu\.(numCycles|commitStats[01]\.numInsts)\b' 'results/runs/smt2_fp_matmul+int_alu/stats.txt'"
FONT=11 $S $O/fig_smt_deadlock.png 20 150 1 "cut -c1-148 results/logs/smt_deadlock_commit_excerpt.log"
FONT=12 $S $O/fig_btb_stats.png 18 118 1 "for r in smt2_int_alu+int_alu smt2btb2_int_alu+int_alu; do echo \"== $r\"; grep -E '^system\.cpu\.(numCycles|branchPred\.(BTBHitRatio|predTakenBTBMiss|condIncorrect))\b' results/runs/$r/stats.txt | cut -c1-110; done"
FONT=11 $S $O/fig_lsq_fix.png 44 118 1 "cd ~/git/gem5 && git log --oneline -3 && git diff HEAD~1 -- src/cpu/o3/lsq.cc | head -36"
FONT=12 $S $O/fig_rob_assert.png 14 118 1 "cut -c1-116 results/logs/smt_dynamic_policy_rob_assert.log"
FONT=12 $S $O/fig_checksums.png 22 118 1 "echo '--- native (Apple M-series, clang -O2):'; cat results/native_checksums.txt; echo; echo '--- gem5 X86 O3 4-wide:'; grep -h -E '^(int_alu|dep_chain|fp_matmul|mem_stream|mem_chase|branchy|bsort):' results/runs/ss_w4_*/run.log"
FONT=11 $S $O/fig_stage_debug.png 48 118 1 "sed -n 1,44p results/logs/o3_stage_debug_dep_chain_w1.log"
FONT=12 $S $O/fig_runs_dir.png 26 118 1 "ls results/runs | column -c 116; echo; ls results/runs/ss_w4_int_alu; wc -l results/runs/_done.log"
