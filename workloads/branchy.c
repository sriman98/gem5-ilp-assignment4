/* branchy: data-dependent conditional branches on pseudo-random data.
 * The two branch bodies have different memory side effects so the
 * compiler cannot turn them into branch-free cmov code.  About half of
 * the branches are taken at random -> the branch-predictor stress test. */
#include "common.h"
#define SZ 16384
static uint32_t data[SZ];
static uint32_t hist[256];
int main(int argc, char **argv) {
    long passes = arg_or(argc, argv, 40);
    uint64_t seed = 12345;
    for (int i = 0; i < SZ; i++) data[i] = (uint32_t)lcg_next(&seed);
    uint64_t s = 0, t = 0;
    for (long p = 0; p < passes; p++)
        for (int i = 0; i < SZ; i++) {
            uint32_t x = data[i];
            if (x & 1) {                    /* random 50/50 branch */
                s += x;
                hist[x & 255]++;
            } else {
                t ^= x;
            }
            if (x > 0x60000000u) s += 3;    /* random ~25/75 branch */
        }
    uint64_t hs = 0;
    for (int i = 0; i < 256; i++) hs += hist[i];
    printf("branchy: passes=%ld checksum=%016llx hist=%llu\n", passes,
           (unsigned long long)(s ^ t), (unsigned long long)hs);
    return 0;
}
