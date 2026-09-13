/* int_alu: eight independent xorshift64 lanes -> integer-ALU bound with
 * plenty of ILP (8 independent dependency chains per iteration).      */
#include "common.h"
static inline uint64_t xs(uint64_t x) { x ^= x << 13; x ^= x >> 7; x ^= x << 17; return x; }
int main(int argc, char **argv) {
    long n = arg_or(argc, argv, 60000);
    uint64_t a = 1, b = 2, c = 3, d = 4, e = 5, f = 6, g = 7, h = 8;
    for (long i = 0; i < n; i++) {
        a = xs(a); b = xs(b); c = xs(c); d = xs(d);
        e = xs(e); f = xs(f); g = xs(g); h = xs(h);
    }
    printf("int_alu: n=%ld checksum=%016llx\n", n,
           (unsigned long long)(a ^ b ^ c ^ d ^ e ^ f ^ g ^ h));
    return 0;
}
