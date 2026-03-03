# API Routes

All API responses follow:

- Success: `{ success: true, data: ... }`
- Error: `{ success: false, error: { statusCode, code, message, details?, requestId? } }`
- Every response includes header: `x-request-id`

## Auth (`/auth`)
- `POST /register` - invite-based student registration.
- `GET /verify-email?token=...` - activate account.
- `POST /login` - login with `identifier` (`email` or `studentId`) + password.
  - rate limit / lockout errors:
    - `TOO_MANY_ATTEMPTS` (`429`) with `details.retryAfterSeconds`
- `POST /logout` - clear auth cookie.
- `POST /forgot-password` - issue reset token/link.
- `POST /reset-password` - reset with token.
- `GET /me` - authenticated current user.

## Students (`/students`)
- `GET /me` - my profile.
- `PATCH /me` - update my profile fields.
- `GET /` (admin) - list students.
- `GET /:id` (admin) - get student.
- `POST /` (admin) - create student.
- `PATCH /:id` (admin) - update student.
- `DELETE /:id` (admin) - delete student.

## Academics (`/academics`)
- `GET /terms`
- `GET /courses`
- `GET /courses/:id?termId=...`
- `GET /sections?termId=...&courseId=...`

## Registration (`/registration`)
- `GET /cart?termId=...`
- `POST /cart` add section to cart
- `DELETE /cart/:id` remove cart item
- `POST /precheck` pre-validate cart without writing enrollments
  - body: `{ termId }`
  - response:
    - `termId`
    - `cartCount`
    - `ok`
    - `preview: [{ sectionId, sectionCode, courseCode, status, waitlistPosition }]`
    - `issues: [{ sectionId, sectionCode, courseCode, reasonCode, message }]`
- `POST /submit` submit cart (rules + create enrollments)
- `POST /drop` drop enrollment (drop deadline enforced)
- `GET /enrollments?termId=...`
- `GET /schedule?termId=...`
- `GET /grades`

## Admin (`/admin`)
- Dashboard: `GET /dashboard`
- Terms: `GET /terms`, `POST /terms`, `PATCH /terms/:id`, `DELETE /terms/:id`
- Courses: `GET /courses`, `POST /courses`, `PATCH /courses/:id`, `DELETE /courses/:id`
- Sections: `GET /sections`, `POST /sections`, `PATCH /sections/:id`, `DELETE /sections/:id`
- Enrollments: `GET /enrollments`, `PATCH /enrollments/:id`, `POST /enrollments/grade`
- Waitlist:
  - `GET /waitlist`
  - `POST /waitlist/promote` body: `{ sectionId, count? }` (default `count=1`)
  - response:
    - `promoted: [{ enrollmentId, studentId, sectionId }]`
    - `promotedCount`
    - `remainingWaitlistCount`
    - `availableSeatsBefore`
    - `availableSeatsAfter`
- Invite Codes: `GET /invite-codes`, `POST /invite-codes`, `PATCH /invite-codes/:id`
- Audit Logs: `GET /audit-logs?limit=200`
- CSV Imports: `POST /import/students`, `POST /import/courses`, `POST /import/sections`
  - request body:
    - `csv: string` (required)
    - `dryRun?: boolean` (optional, default `false`)
    - `idempotencyKey?: string` (optional)
  - dry run response example:
    - `{ created: 0, dryRun: true, wouldCreate, skipped? }`
  - write response example:
    - `{ created, skipped?, idempotencyReused?: true }`

## Ops
- `GET /ops/metrics` - in-memory operational metrics:
  - `uptimeSeconds`
  - `requestsTotal`
  - `errorResponsesTotal`
  - `byMethod`
  - `byStatusCode`
  - `byRoute`
  - `auditActionCounts`
