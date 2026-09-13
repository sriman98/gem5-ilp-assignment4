/* dep_chain: ONE serial dependency chain (LCG multiply-add + shift/xor).
 * Each iteration needs the previous result, so ILP is ~1 no matter how
 * wide the machine is: the ILP-limit case.                             */
#include "common.h"
int main(int argc, char **argv) {
    long n = arg_or(argc, argv, 500000);
    uint64_t x = 1;
    for (long i = 0; i < n; i++) {
        x = x * 6364136223846793005ULL + 1442695040888963407ULL;
        x ^= x >> 29;
    }
    printf("dep_chain: n=%ld checksum=%016llx\n", n, (unsigned long long)x);
    return 0;
}
