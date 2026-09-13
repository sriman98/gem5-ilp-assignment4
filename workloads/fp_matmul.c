/* fp_matmul: 48x48 double-precision matrix multiply (i-k-j order,
 * stride-1 inner loop), repeated R times -> floating-point multiply/add
 * with independent accumulators across j; working set ~55 KiB.       */
#include "common.h"
#define N 48
static double A[N][N], B[N][N], C[N][N];
int main(int argc, char **argv) {
    long reps = arg_or(argc, argv, 4);
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++) {
            A[i][j] = (i * 7 + j * 3) % 11 / 10.0 + 0.5;
            B[i][j] = (i * 5 + j * 13) % 17 / 20.0 + 0.25;
            C[i][j] = 0.0;
        }
    for (long r = 0; r < reps; r++)
        for (int i = 0; i < N; i++)
            for (int k = 0; k < N; k++) {
                double a = A[i][k];
                for (int j = 0; j < N; j++)
                    C[i][j] += a * B[k][j];
            }
    double sum = 0.0;
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++) sum += C[i][j];
    /* print as a scaled integer: musl's %f formatting uses x87 long-double
     * code that gem5's x86 model does not emulate correctly (see report). */
    printf("fp_matmul: reps=%ld checksum=%lld\n", reps, (long long)(sum * 1000.0));
    return 0;
}
