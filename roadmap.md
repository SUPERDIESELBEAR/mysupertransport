# Roadmap

## In progress
- Module 4 (dispatch company settlement) — Pass 1: schema only. Enum, five tables,
  constraints, grants, RLS, immutability trigger pair, live-catalog tests, purge-list
  registration. No computation function, no line-item writer, no UI.

## Next
- Pass 2: extract the shared period/pay-policy pieces and pin the caller test.
- Pass 3: the pure `computeDispatchSettlement`, verified against the six seed loads.
- Pass 4: the writer RPC and attribution rollup.
- Pass 5: the management screen.
