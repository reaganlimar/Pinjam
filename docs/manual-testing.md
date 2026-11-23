# Manual test script

Two local test accounts were created while testing (they only exist in your local `data/pinjam.db`):

| Role | Name | Email | Password |
| --- | --- | --- | --- |
| Student A (lender) | Alya Putri | alya.putri@binus.ac.id | pinjam-test-123 |
| Student B (borrower) | Bima Santoso | bima.santoso@binus.ac.id | pinjam-test-456 |

Delete the `data/` folder to start fresh, then repeat:

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
