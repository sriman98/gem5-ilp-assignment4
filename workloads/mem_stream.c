/* mem_stream: sequential sweep over a 4 MiB array (far larger than the
 * caches), R read passes -> memory-bandwidth/latency bound streaming.  */
#include "common.h"
#define WORDS (512 * 1024)                 /* 512 Ki x 8 B = 4 MiB */
int main(int argc, char **argv) {
    long passes = arg_or(argc, argv, 3);
    uint64_t *a = malloc(WORDS * sizeof(uint64_t));
    if (!a) return 1;
    for (long i = 0; i < WORDS; i++) a[i] = (uint64_t)i * 2654435761ULL;
    uint64_t sum = 0;
    for (long p = 0; p < passes; p++)
        for (long i = 0; i < WORDS; i++) sum += a[i];
    printf("mem_stream: passes=%ld checksum=%016llx\n", passes, (unsigned long long)sum);
    free(a);
    return 0;
}
