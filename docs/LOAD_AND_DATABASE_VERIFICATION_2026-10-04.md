# Controlled load and database verification

**Local workload passed; production capacity remains unqualified.** This is a short synthetic run on the user's Windows host, with four concurrent clients. It is not a soak test, production SLA or multi-instance test.

`run-postgres-restore-rehearsal.ps1 -RunLoad` seeds a disposable loopback database with 2,005 items, 3,001 purchase headers/lines, 10,001 movements and synthetic consumption. `tools/PurchaseAssistant.LoadTest` refuses a non-loopback URL or a database marker outside the private restored-test prefix. Tokens/passwords are inherited through temporary environment values, never command-line arguments or output. Each worker has a separate stock item and uses the real preview/version contracts for writes.

Latest complete run: `d95d78d9d06f4ca1b92e937b32b810f6`; raw reports `TestResults/phase4-load-<run>.json` and `phase4-database-load-<run>.json`.

| Measure | Observed |
|---|---:|
| HTTP requests | 264, 24 per operation below |
| Concurrent workers / cycles per worker | 4 / 6 |
| Duration | 4.487 s |
| Throughput | 58.84 requests/s |
| Overall median / p95 / p99 | 18.87 / 467.35 / 604.01 ms |
| Unexpected failures | 0 (0%) |
| Expected AI rate-limited responses | 15 × HTTP 429 |
| Explicit unavailable AI responses | 9 × HTTP 200 with `status=Error`, zero fabricated success |
| API process CPU | 14.69 CPU-seconds; average 327.35% of one core on 8 logical processors |
| Peak sampled API CPU | 511.71% of one core, sampled approximately every 100 ms |
| Peak API working set | 239.60 MiB |

| Operation | Median ms | p95 ms | Response evidence |
|---|---:|---:|---|
| Login | 467.59 | 609.76 | 24 authenticated successes; deliberately authentication-heavy mix |
| Dashboard | 23.69 | 155.67 | 24 × 200 |
| Product search | 11.22 | 64.37 | 24 × 200, current catalog route |
| Stock list | 9.16 | 43.62 | 24 × 200 |
| Stock read | 6.08 | 8.28 | 24 × 200 |
| Versioned stock update | 13.03 | 21.36 | 24 × 200 |
| Purchase preview | 7.88 | 77.58 | 24 × 200, returned scoped confirmation proof |
| Purchase creation | 21.36 | 180.17 | 24 × 201, real database writes |
| Purchase reports | 32.70 | 52.43 | 24 × 200 |
| ML inference | 41.29 | 107.35 | 24 × 200, restored synthetic model |
| Unconfigured AI / throttle | 4.68 | 25.70 | Controlled unavailable response or expected 429 |

AI latency here is local failure/throttle behavior, not external-provider latency. These synthetic writes cannot be treated as business data. Authentication uses the existing password hash cost; its deliberate CPU cost was not weakened to improve a benchmark. The short run cannot establish memory stability or long-term throughput.

## Measured bottleneck and change

The prior correct-route run `73658e2dee064c759e0ec277be0766e8` passed the same 264 requests but ML median/p95 was 186.47/313.79 ms. The movement SQL itself measured 0.551 ms. The CPU path repeatedly scanned/sorted up to 2,000 movements for every recent row.

Replaced it with independent type/direction histories of at most 60 strictly earlier observations, processing equal timestamps together. A regression compares flagged IDs with the original causal calculation, including equal-time and opposite-direction cases. Latest observed ML median/p95 is 41.29/107.35 ms. Runs share the fixture/concurrency but background host activity is uncontrolled; this is observed evidence, not a statistically estimated speedup. No stock cache or speculative performance index was added.

## Actual database measurements

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` ran on populated, analyzed synthetic tables after the workload. Queries represent the scoped projection/filter/order used by each path; plans are preserved in the raw report.

| Query | Execution ms |
|---|---:|
| Inventory page | 0.981 |
| Dashboard grouped purchases | 2.786 |
| Reporting supplier aggregate | 1.143 |
| Recent scoped movement page | 0.548 |
| Scoped usage extraction | 0.151 |

Database counter deltas: 2,713 commits, 0 rollbacks/deadlocks, 139 block reads, 119,342 block hits, zero temporary files/bytes. These are observed PostgreSQL statistics, which update asynchronously and can include delayed reporting from nearby preflight activity; they are not an exact write ledger or whole-machine utilization. Read/hit ratio is about 99.88% cached. Unrelated PostgreSQL processes' CPU/memory are not attributed to this private database.

Reviewed existing Business/item/date, Business/status/order and scoped movement indexes and the resulting plans. The new historical indexes enforce scope/idempotency, rather than hypothetical speed improvements. Sequential/aggregate scans over a few thousand local rows are not automatically failures and do not justify an extra index. No measured query exceeded 3 ms in this plan sample.

ML extraction now uses chunks of 100 items, with two bounded source reads per chunk plus the catalog query. The restored extraction measured **43 queries for 2,005 items and 181 observations**, 116.72 ms cumulative executed-query duration and 1.519 s including context/materialization/output. This prevents the former per-item extraction growth. API dashboard/report aggregates issue a bounded number of queries; no per-row relation query was observed in the reviewed paths.

Production remaining: approved real data/traffic, agreed latency/error targets, longer staged load/soak runs, concurrent stock-conflict profiles, provider quotas, database disk/WAL/connection pressure, multiple instances/realtime fanout and shared key-ring qualification. Repeat under the actual deployment topology before asserting production capacity.
