#!/bin/bash
# run_one.sh <name> "<gem5 options>" "<ilp_config.py arguments>"
# Runs one gem5 simulation into results/runs/<name>/ (stats.txt, config.ini,
# run.log) and appends a line to results/runs/_done.log when it finishes.
set -u
R=$(cd "$(dirname "$0")/.." && pwd)
G=${GEM5:-$HOME/git/gem5/build/X86/gem5.opt}
name=$1; gopts=$2; cargs=$3
[ "$gopts" = "NONE" ] && gopts=""      # NONE = no extra gem5 options (xargs -0 drops empty fields)
out=$R/results/runs/$name
mkdir -p "$out"
cd "$R"
start=$(date +%s)
# shellcheck disable=SC2086   # word splitting of the option strings is intended
$G --outdir="$out" $gopts "$R/configs/ilp_config.py" $cargs > "$out/run.log" 2>&1
rc=$?
echo "$name rc=$rc $(( $(date +%s) - start ))s" >> "$R/results/runs/_done.log"
exit 0
