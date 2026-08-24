---
name: Verification token email binding
description: Safety rule for changing a patient's email address while verification links exist.
---

Patient email-verification links must be bound to the normalized email address they were issued for, and verification must only succeed when that address still matches the patient record.

**Why:** Invalidating an old link alone is not enough under concurrent requests: a link that is consumed around an email edit can otherwise mark the replacement address verified without the new owner proving control.

**How to apply:** Any flow that issues verification links (registration, manual resend, administrative edits, or scheduled reminders) must record the target email. Email-change flows must reset the verified state and invalidate previous links. Verification must atomically consume the link and conditionally verify against the current address.