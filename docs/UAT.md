# Student Portal / Registrar Ops UAT Checklist

Use this checklist for client acceptance. Mark each scenario as PASS / FAIL / BLOCKED and capture screenshots or request IDs for failures.

## 1. Student Login and Dashboard
Preconditions:
- Seeded student account exists (`student1@sis.edu` / `Student@2026!`)
- API and web are both running

Steps:
1. Open `/login`
2. Sign in as the seeded student
3. Confirm redirect to `/student/dashboard`
4. Verify dashboard cards load without runtime errors
5. Confirm recommended courses and announcements sections render or show clear empty states

Expected result:
- Login succeeds
- Dashboard renders without console/runtime error
- Empty sections show clear empty states, not broken placeholders

Pass/fail notes:
- Verified from code: student dashboard is protected and redirects unauthenticated users
- Recommended courses depend on existing enrollment/transcript data

## 2. Course Browsing and Catalog Filters
Preconditions:
- Student is logged in
- At least one term and sections exist in seed data

Steps:
1. Open `/student/catalog`
2. Filter by department
3. Filter by modality
4. Filter by credits
5. Filter by weekday
6. Toggle available seats only
7. Add/remove compare selections
8. Verify recently viewed updates after opening cards

Expected result:
- Filters reduce visible sections consistently
- Compare modal opens only when at least two sections are selected
- Completed courses show disabled enrollment state
- Full sections show watch/subscription action instead of add-to-cart

Pass/fail notes:
- Grade distribution bars depend on completed enrollment history for a section
- Watch button depends on `SectionWatch` table existing in database

## 3. Add / Drop / Cart Flow
Preconditions:
- Student logged in
- Term open for registration
- Sections available in current term

Steps:
1. Add a section to cart
2. Submit registration/enroll action
3. Attempt to add a section with time conflict
4. Attempt to add a section without prerequisite completion
5. Drop a waitlisted section
6. Drop an enrolled section before deadline
7. Attempt drop after deadline if seeded data allows

Expected result:
- Successful enrollments appear in cart/schedule
- Conflict errors are explicit
- Prerequisite failure returns `PREREQ_NOT_MET: ...`
- After deadline, enrolled drop is blocked with explicit messaging

Pass/fail notes:
- Enroll path has server-side prerequisite enforcement and transaction logic
- Deadline behavior depends on term dates in seed data

## 4. Schedule / Calendar Behavior
Preconditions:
- Student has at least one enrolled section in a term

Steps:
1. Open `/student/schedule`
2. Switch between list and grid view
3. Confirm today's classes card shows matching sections or explicit empty state
4. Export `.ics` file
5. Verify public schedule sharing is shown as disabled in production handoff mode

Expected result:
- Both list and grid views render without hydration/runtime issues
- iCal download succeeds and returns a calendar file
- Public schedule sharing is not offered as an active production feature

Pass/fail notes:
- iCal export uses `SIS_TIMEZONE`
- Public share endpoints are disabled unless explicitly enabled via env

## 5. Governance Holds and Overload Workflow
Preconditions:
- Admin, student, and advisor seeded accounts exist
- Use `Fall 2026` for validation because its sections are future-dated and the registration window is already open

Steps:
1. Sign in as admin and open `/admin/holds`
2. Search for `student2@sis.edu` or `S2602`
3. Create a `REGISTRATION` hold with a clear note
4. Sign in as `student2@sis.edu` and open `/student/cart?termId=seed-term-fall-2026`
5. Confirm the hold is visible in the cart governance section
6. Attempt to add or submit a section and confirm the action is blocked
7. Sign back in as admin and resolve the hold from `/admin/holds`
8. Sign in as `student1@sis.edu` and build a `Fall 2026` cart above 18 credits
9. Submit a credit overload request from `/student/cart?termId=seed-term-fall-2026`
10. Sign in as `advisor1@sis.edu` and open `/advisor/requests`
11. Approve the request with a decision note
12. Sign back in as `student1@sis.edu`, reopen the cart, and rerun precheck

Expected result:
- Admin can create and resolve holds without API tooling
- Student sees authoritative hold state or an explicit governance load failure message
- Active hold blocks registration actions explicitly
- Approved overload request changes effective registration credit-limit behavior for `Fall 2026`

Pass/fail notes:
- No manual database date edits should be required
- Duplicate pending overload submissions for the same student and term should be rejected cleanly

## 6. Transcript and Notifications Behavior
Preconditions:
- Student logged in

Steps:
1. Open `/student/grades`
2. Open `/student/notifications`
3. Confirm transcript data renders if available
4. If backend data is unavailable, confirm explicit error state appears instead of empty fake state

Expected result:
- Grades/transcript page renders GPA and transcript data when available
- Notifications page renders notifications when available
- Failures are shown explicitly as unavailable, not as empty data

Pass/fail notes:
- Verified from code: transcript and notification service methods now throw explicit server errors on failure

## 7. Support Request Flow
Preconditions:
- Student logged in
- Admin account exists

Steps:
1. Open `/student/contact`
2. Submit a request with category, subject, and message
3. Open admin notification log view as admin
4. Confirm support-request entries are visible

Expected result:
- Student sees a request submitted confirmation
- Admin notification log shows the routed support request
- Wording consistently refers to registrar/support, not advisor

Pass/fail notes:
- This is not a helpdesk queue; it is an admin-routed support request log

## 8. Registrar/Admin Student Management
Preconditions:
- Admin logged in

Steps:
1. Open `/admin/students`
2. Search for a student
3. Open detail drawer
4. Inspect security/login info tab
5. Verify notification log tab loads
6. Change role only where allowed

Expected result:
- Student list and detail drawer load without unauthorized errors
- Security metadata is visible
- Role actions are admin-only

Pass/fail notes:
- There is no faculty/advisor user management domain in current scope

## 9. Invite Code Management
Preconditions:
- Admin logged in

Steps:
1. Open `/admin/invite-codes`
2. Create a single invite code
3. Bulk-generate invite codes
4. Copy unused invite codes
5. Revoke an unused invite code

Expected result:
- UI clearly indicates invite codes create student registrations only
- No role selector implies admin onboarding
- Used codes cannot be revoked

Pass/fail notes:
- Admin account creation is not driven by invite-code role semantics in this delivery scope

## 10. Reports and Registrar Ops Pages
Preconditions:
- Admin logged in
- Seeded data present

Steps:
1. Open `/admin/dashboard`
2. Open `/admin/reports`
3. Change term filter on reports page
4. Open `/admin/enrollments`, `/admin/sections`, `/admin/terms`
5. Confirm pages show data or clear empty states without runtime errors

Expected result:
- Dashboard and reports load without unauthorized/runtime error
- Reports filter by selected term where supported
- Operational pages expose registrar/admin semantics, not full-SIS claims

Pass/fail notes:
- Reports are registrar-focused operational reports, not institution-wide compliance reporting

## 11. Unauthenticated Access Control
Preconditions:
- No active session

Steps:
1. Open a protected student page directly
2. Open a protected admin page directly
3. Open `/maintenance` if maintenance mode cookie is set

Expected result:
- Protected pages redirect to `/login`
- No red-screen unauthorized runtime errors
- Maintenance page appears only when maintenance mode is active

Pass/fail notes:
- Verified from code: server-side auth redirects are in place for protected RSC routes
