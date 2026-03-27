

## Delete Test Operator: David Thompson

### Data Found
David Thompson (test operator) has records across these tables:

| Table | Records | Key ID |
|-------|---------|--------|
| `applications` | 1 | `9be11770-fffc-4470-940d-8f8337ff68e8` |
| `operators` | 1 | `fc298f76-69c3-48d3-a556-c2e01d3583ef` |
| `onboarding_status` | 1 | operator_id reference |
| `active_dispatch` | 1 | operator_id reference |
| `dispatch_status_history` | 1 | operator_id reference |
| `profiles` | 1 | user_id `5c20d324-c609-4eca-9b32-0dee6cd37968` |
| `user_roles` | 1 | user_id reference |

No data in: messages, notifications, documents, ICA contracts, MO plates, equipment, driver uploads, inspection docs, or audit log.

### Deletion Plan (order matters for referential integrity)
Using the data insert tool for each DELETE, executed in dependency order:

1. **Delete `onboarding_status`** where `operator_id = fc298f76-...`
2. **Delete `dispatch_status_history`** where `operator_id = fc298f76-...`
3. **Delete `active_dispatch`** where `operator_id = fc298f76-...`
4. **Delete `user_roles`** where `user_id = 5c20d324-...`
5. **Delete `profiles`** where `user_id = 5c20d324-...`
6. **Delete `operators`** where `id = fc298f76-...`
7. **Delete `applications`** where `id = 9be11770-...`
8. **Delete auth user** via the `delete-user-account` edge function for user `5c20d324-c609-4eca-9b32-0dee6cd37968`

### Files changed
None — this is a data-only operation.

