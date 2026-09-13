/* bsort: bubble sort of an 800-element pseudo-random array: a mixed
 * integer/memory/branch kernel whose comparison branches start out
 * unpredictable and become predictable as the array gets sorted.      */
#include "common.h"
int main(int argc, char **argv) {
    long n = arg_or(argc, argv, 800);
    uint32_t *a = malloc(n * sizeof(uint32_t));
    if (!a) return 1;
    uint64_t seed = 777;
    for (long i = 0; i < n; i++) a[i] = (uint32_t)lcg_next(&seed);
    for (long i = 0; i < n - 1; i++)
        for (long j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) { uint32_t tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp; }
    uint64_t chk = 0;
    for (long i = 0; i < n; i++) chk = chk * 31 + a[i];
    printf("bsort: n=%ld sorted=%d checksum=%016llx\n", n, a[0] <= a[n - 1],
           (unsigned long long)chk);
    free(a);
    return 0;
}
