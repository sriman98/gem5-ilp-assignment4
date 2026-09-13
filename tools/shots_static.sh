#!/bin/zsh
# Static (result-independent) Terminal.app screenshots for the Part 2 report.
R=~/git/gem5-ilp-assignment4; S=$R/tools/shot.sh; O=$R/report/shots/raw; cd $R
FONT=12 $S $O/fig_make.png 26 118 1 "cd workloads && make -B && ls -la ../bin | cut -c1-90"
FONT=11 $S $O/fig_config_bp_fu.png 52 110 1 "sed -n '/^# -* branch predictors/,/^SIZES = /p' configs/ilp_config.py"
FONT=11 $S $O/fig_config_o3.png 46 110 1 "sed -n '/^def make_o3/,/^# -* workloads/p' configs/ilp_config.py"
FONT=11 $S $O/fig_config_system.png 58 110 1 "sed -n '/^# -* workloads/,\$p' configs/ilp_config.py"
FONT=11 $S $O/fig_staticbp_hh.png 50 110 1 "sed -n 12,54p ~/git/gem5/src/cpu/pred/static_bp.hh"
FONT=11 $S $O/fig_staticbp_cc.png 58 110 1 "sed -n 1,56p ~/git/gem5/src/cpu/pred/static_bp.cc"
FONT=12 $S $O/fig_staticbp_py.png 30 110 1 "grep -n -A15 'class StaticBP' ~/git/gem5/src/cpu/pred/BranchPredictor.py; grep -n 'StaticBP\|static_bp' ~/git/gem5/src/cpu/pred/SConscript"
FONT=12 $S $O/fig_gem5_branch.png 22 118 1 "cd ~/git/gem5 && git branch --show-current && git log --oneline -3 && git diff stable --stat && ls -la build/X86/gem5.opt"
FONT=12 $S $O/fig_gem5_rebuild.png 14 118 1 "grep -n -E 'static_bp|StaticBP|done building' results/logs/gem5_rebuild_staticbp.log"
FONT=10 $S $O/fig_minor_trace.png 26 160 1 "head -22 results/logs/minorcpu_x86_trace_excerpt.log | cut -c1-158"
FONT=12 $S $O/fig_fp_panic.png 26 118 1 "grep -n -B3 -A4 'panic' results/logs/fp_matmul_x87_printf_panic.log | head -24 | cut -c1-116"
FONT=12 $S $O/fig_config_error.png 16 118 1 "head -10 results/logs/config_error_numIQEntries.log"
FONT=10 $S $O/fig_pipeview_w1.png 50 150 1 "sed -n '3916,3960p' results/runs/pv_demo_w1_dep_chain/pipeview_color.txt"
FONT=10 $S $O/fig_pipeview_w4.png 50 150 1 "sed -n '6030,6074p' results/runs/pv_demo_w4_dep_chain/pipeview_color.txt"
FONT=12 $S $O/fig_trace_raw.png 30 118 1 "grep -n -A7 'O3PipeView:fetch:.*IMUL_R_R :' results/runs/pv_demo_w1_dep_chain/trace.out | sed -n '25,48p' | cut -c1-110"
FONT=12 $S $O/fig_pipeview_legend.png 14 118 1 "python3 ~/git/gem5/util/o3-pipeview.py -c 500 -w 90 -o /dev/stdout results/runs/pv_demo_w1_dep_chain/trace.out | head -6; python3 ~/git/gem5/util/o3-pipeview.py --help | head -12"
