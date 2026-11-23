# Manual test script

These two test accounts were used while testing. They were removed from the Neon
`production` branch on 2026-11-23 and now only exist in the old local `data/pinjam.db`.
Re-register them to repeat the script:

| Role | Name | Email | Password |
| --- | --- | --- | --- |
| Student A (lender) | Alya Putri | alya.putri@binus.ac.id | pinjam-test-123 |
| Student B (borrower) | Bima Santoso | bima.santoso@binus.ac.id | pinjam-test-456 |

Prefer testing on a Neon branch rather than `production` (see `docs/database.md`). If you test on
production, delete the accounts afterwards. Deleting a user cascades to their sessions, files,
items and notifications, but delete their reviews, reports, conversations and loans first.

Then repeat:

1. **A** registers, lists "Scientific Calculator" (Electronics, Good, max 3 days, free, pickup Atrium).
2. **B** registers, finds it on Browse (search "calc"), picks a pickup date and 2 days, sends the request.
3. **B** opens "Chat with lender about pickup time" and sends a message.
4. **A** sees the bell badge, opens Notifications → Requests → **Approve**, then **Mark ready for pickup**.
5. **B** sees "approved" and "ready for pickup" notifications; My Loans → **Confirm received** (Item received screen).
6. **B** taps **Return** → status "Return pending".
7. **A** Requests → **Confirm returned** (condition "Same as pickup") → Return confirmed; rates B.
8. **B** opens the loan → "Item returned" screen, "Returned on time", rates A.

Edge cases worth repeating: empty and invalid registration, a non-university email, a duplicate NIM, a wrong
password, requesting your own item, overlapping dates, cancelling a request, a paid item (fee breakdown and payment
choice), hiding and deleting a listing, reporting a listing, and dark mode.
