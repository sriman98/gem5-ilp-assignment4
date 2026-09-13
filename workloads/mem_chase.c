/* mem_chase: pointer chasing through a 2 MiB array where every hop lands
 * on a new cache line and page (stride 4097 words).  Each load depends
 * on the previous one -> serialized cache misses, no MLP: latency bound. */
#include "common.h"
#define M (512 * 1024)                     /* 512 Ki x 4 B = 2 MiB */
#define STRIDE 4097                        /* odd => single cycle over M */
int main(int argc, char **argv) {
    long hops = arg_or(argc, argv, 300000);
    uint32_t *next = malloc(M * sizeof(uint32_t));
    if (!next) return 1;
    for (long i = 0; i < M; i++) next[i] = (uint32_t)((i + STRIDE) % M);
    uint32_t p = 0;
    for (long h = 0; h < hops; h++) p = next[p];
    printf("mem_chase: hops=%ld final=%u\n", hops, p);
    free(next);
    return 0;
}
