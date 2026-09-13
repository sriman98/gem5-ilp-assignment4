/* Shared helpers for the Assignment 4 ILP workloads (Sriman Cherukuru).
 * Every program is a small, self-checking kernel: it takes an optional
 * iteration count, runs, and prints a checksum so correct execution
 * inside gem5 can be verified against the native run. */
#ifndef ILP_COMMON_H
#define ILP_COMMON_H
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
static inline uint64_t lcg_next(uint64_t *s) {           /* fixed-seed PRNG */
    *s = *s * 6364136223846793005ULL + 1442695040888963407ULL;
    return *s >> 33;
}
static inline long arg_or(int argc, char **argv, long dflt) {
    return argc > 1 ? atol(argv[1]) : dflt;
}
#endif
