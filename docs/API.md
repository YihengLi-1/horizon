# SIS API Reference

## Auth
- `POST /auth/register` - Register a new student with invite code
- `GET /auth/verify-email` - Verify email token
- `POST /auth/login` - Create authenticated session
- `POST /auth/logout` - Revoke current session cookies
- `POST /auth/refresh` - Rotate refresh token and renew access cookie
- `POST /auth/forgot-password` - Create password reset token
- `POST /auth/reset-password` - Reset password from token
- `GET /auth/me` - Return authenticated user profile shell
- `GET /auth/csrf-token` - Issue a CSRF cookie/token pair
- `PATCH /auth/change-password` - Change password for logged-in user
- `POST /auth/unlock-account` - Admin-only unlock account
- `GET /auth/sessions` - Admin-only active session list
- `DELETE /auth/sessions/:id` - Admin-only revoke tracked session

## Academics
- `GET /academics/terms` - List terms
- `GET /academics/courses` - List courses with prerequisite links
- `GET /academics/courses/:id` - Get course detail and sections
- `GET /academics/sections` - List sections by optional term/course filters

## Registration
- `GET /registration/cart` - Student cart for a term
- `POST /registration/cart` - Add a section to cart
- `DELETE /registration/cart/:id` - Remove cart item
- `POST /registration/submit` - Submit cart and create enrollments
- `POST /registration/precheck` - Preview submit validation issues
- `POST /registration/drop` - Drop enrollment or waitlist item
- `GET /registration/enrollments` - Student enrollments for optional term
- `GET /registration/schedule` - Student schedule for term
- `GET /registration/grades` - Student grade rows
- `GET /registration/waitlist-position/:sectionId` - Student waitlist position

## Students
- `GET /students/me` - Student profile details
- `GET /students/notifications` - Student notifications
- `GET /students/transcript` - Grouped transcript with semester GPA
- `GET /students/cart` - Student cart summary
- `GET /students/announcements` - Authenticated announcement feed
- `GET /students/announcements/public` - Public announcement feed
- `GET /students/ratings` - Student section ratings
- `GET /students/recommended` - Recommended sections
- `POST /students/rate-section` - Submit section rating
- `PATCH /students/me` - Update student profile
- `POST /students/me/change-password` - Legacy student password change route
- `GET /students` - Admin/student directory list
- `GET /students/:id` - Student detail
- `POST /students` - Create student
- `PATCH /students/:id` - Update student
- `DELETE /students/:id` - Delete student

## Admin
- `GET /admin/dashboard` - Dashboard KPI payload
- `GET /admin/reports` - Report summary payload
- `GET /admin/students` - Paginated student list
- `GET /admin/terms` - List terms
- `POST /admin/terms` - Create term
- `PATCH /admin/terms/:id` - Update term
- `PATCH /admin/terms/:id/toggle-registration` - Toggle registration flag
- `DELETE /admin/terms/:id` - Delete term
- `GET /admin/courses` - List courses
- `POST /admin/courses` - Create course
- `PATCH /admin/courses/:id` - Update course
- `DELETE /admin/courses/:id` - Soft-delete course
- `GET /admin/sections` - List sections
- `POST /admin/sections` - Create section
- `PATCH /admin/sections/:id` - Update section
- `DELETE /admin/sections/:id` - Delete section with guards
- `GET /admin/sections/:id/enrollments` - Section roster
- `POST /admin/sections/:id/notify` - Notify all section students
- `POST /admin/sections/:id/clone` - Clone a section
- `GET /admin/enrollments` - Paginated enrollments with filters
- `PATCH /admin/enrollments/:id` - Update enrollment status or grade
- `DELETE /admin/enrollments/:id` - Admin force-drop enrollment
- `POST /admin/enrollments/grade` - Update grade by enrollment id
- `PATCH /admin/enrollments/grade` - Update grade by student+section
- `POST /admin/enrollments/bulk-approve` - Bulk approve pending enrollments
- `GET /admin/waitlist` - Waitlist view
- `POST /admin/waitlist/promote` - Promote waitlist entries
- `GET /admin/invite-codes` - List invite codes
- `POST /admin/invite-codes` - Create invite codes
- `DELETE /admin/invite-codes/:id` - Revoke unused invite code
- `GET /admin/announcements` - List announcements
- `POST /admin/announcements` - Create announcement
- `PATCH /admin/announcements/:id` - Update announcement
- `DELETE /admin/announcements/:id` - Delete announcement
- `GET /admin/settings/system` - Read DB-backed system settings
- `PUT /admin/settings/system` - Update DB-backed system setting
- `PATCH /admin/users/:id/role` - Update user role
- `GET /admin/users/:id/login-history` - Login security info
- `GET /admin/audit-logs` - Audit log list
- `GET /admin/audit-logs/integrity` - Audit integrity snapshot
- `GET /admin/notification-log` - Paginated notification log
- `GET /admin/webhooks` - List registered webhooks
- `POST /admin/webhooks` - Register webhook
- `DELETE /admin/webhooks/:id` - Remove webhook
- `GET /admin/stats/registration` - Registration KPI stats
- `GET /admin/stats/enrollment-trend` - Enrollment trend by day
- `GET /admin/stats/dept-breakdown` - Enrollment status by department
- `GET /admin/stats/top-sections` - Top sections by enrollment
- `GET /admin/stats/gpa-distribution` - GPA distribution buckets

## Ops and Health
- `GET /health` - Basic API health check
- `GET /ops/ready` - Readiness payload
- `GET /ops/metrics` - In-memory metrics snapshot
- `GET /ops/metrics/snapshot` - Rolling metric history
- `GET /ops/version` - Version, env, uptime, build metadata
- `GET /ops/audit` - Audit integrity health stub
- `POST /ops/csp-report` - CSP violation report sink
- `GET /ops/db-check` - Live DB connectivity check
- `GET /api/health` - Lightweight load balancer health route
- `GET /api/docs-json` - OpenAPI schema
