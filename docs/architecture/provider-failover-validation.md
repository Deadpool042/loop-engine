# Provider failover validation matrix

| Scenario | Expected outcome |
| --- | --- |
| Primary completes | Stop after one attempt |
| Recoverable primary failure | Invoke the next distinct provider |
| Terminal primary failure | Stop immediately |
| Attempt budget exhausted | Do not invoke further providers |
| Duplicate provider ids | Reject before effects |
| Executor throws | Redact exception and classify stable failure |
| Resolver replaces primary plan | Reject before effects |
| Fallback completes | Aggregate modified files and select fallback provider |

The focused test suite covers every row and verifies that emitted evidence is immutable.
