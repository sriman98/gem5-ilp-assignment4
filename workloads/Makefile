# Cross-compile the workloads for gem5's x86-64 SE mode on macOS with zig
# (no glibc x86-64 gcc exists on the Mac; see Assignment 2).  Static musl
# binaries run in gem5 as-is.  Vectorization is disabled so the kernels
# stay scalar integer / scalar double code, which keeps the instruction
# classes easy to interpret in the O3 statistics.
ZIG    ?= zig
TARGET ?= x86_64-linux-musl
CFLAGS ?= -O2 -static -fno-vectorize -fno-slp-vectorize -fno-unroll-loops
PROGS   = int_alu dep_chain fp_matmul mem_stream mem_chase branchy bsort
BIN     = ../bin

all: $(addprefix $(BIN)/,$(PROGS))

$(BIN)/%: %.c common.h
	@mkdir -p $(BIN)
	$(ZIG) cc -target $(TARGET) $(CFLAGS) $< -o $@

clean:
	rm -rf $(BIN)
.PHONY: all clean
