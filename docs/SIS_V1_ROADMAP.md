# SIS V1 Roadmap

## Current Truth

This repository is not a full institutional SIS. It is currently an early academic operations foundation with:

- student accounts and self-service
- admin/registrar term, course, section, and enrollment management
- grading, transcript, waitlist, and reporting foundations
- operational hardening around auth, audit, monitoring, backups, and deployment

It does **not** yet implement a full faculty/advisor/billing/degree-audit domain.

## Target: Formal University SIS v1

The minimum v1 target for formal institutional use is:

- actor model: student, faculty, advisor, registrar/admin
- academic structure: programs, majors, minors, catalogs, degree requirements
- instructional ownership: faculty-owned sections, rosters, grade entry, teaching assignments
- advising ownership: advisor assignment, student standing review, exception workflows
- enrollment governance: holds, overrides, approvals, add/drop, waitlist, deadlines
- academic records: transcript, grading changes, standing, graduation clearance
- institutional controls: audit integrity, privacy boundaries, configurable policies, timezone/calendar correctness
- integration points: finance/hold systems, LMS, identity, and notification infrastructure

## Recommended Build Phases

### Phase A: Actor and Ownership Foundation

- expand role model beyond `STUDENT`/`ADMIN`
- introduce first-class faculty and advisor profiles
- model advisor assignments
- model section instructor ownership with actor relation instead of text-only metadata
- keep existing student/admin UX operational while new actor domain is added behind the scenes

### Phase B: Faculty and Advisor Workflows

- faculty login landing page and section roster ownership
- grade submission and grade-change request flow
- advisor caseload, assigned students, academic standing review
- support request routing to advisor/registrar queues instead of generic admin logs

### Phase C: Academic Records and Policy Workflows

- holds and override approvals
- academic standing and exception records
- repeat/withdraw/pass-fail policy enforcement
- transcript corrections and registrar approval trails

### Phase D: Degree Audit and Graduation

- program/major/minor entities
- requirement blocks and catalog years
- transfer/equivalency scaffolding
- degree audit service and graduation clearance workflow

### Phase E: External Integrations and Institutional Operations

- finance/hold integration strategy
- SIS event model for downstream systems
- operational migrations for real institutional data
- privacy review, retention, archival, and go-live runbooks

## Decisions That Must Stay Stable

- `ADMIN` remains registrar/operations, not faculty
- faculty and advisor are first-class actor roles, not string labels
- section ownership moves toward `instructorUserId` with `instructorName` retained only for compatibility
- advising is represented as explicit assignments, not inferred UI state
- billing should be integrated externally unless the product team commits to building a real student account ledger
- institution timezone must stay configurable and term-aware

## Implemented Now

This repo now includes:

- `FACULTY` and `ADVISOR` roles in the domain model
- `FacultyProfile`
- `AdvisorProfile`
- `AdvisorAssignment`
- `AdvisorNote`
- `Section.instructorUserId`
- admin APIs to create faculty, create advisors, and assign advisors
- faculty login path to `/faculty/dashboard`
- faculty-owned section listing scoped by `instructorUserId`
- faculty-owned roster access
- faculty final-grade submission for owned sections only
- audit logging for faculty roster views and grade submission
- advisor login path to `/advisor/dashboard`
- advisor-scoped advisee listing based on active advisor assignments
- advisor advisee overview and private advisor notes
- audit logging for advisor advisee views and note creation

These changes establish the first real institutional workflow slice. They do **not** complete the faculty/advisor domain.

The repo now also includes the first real governance workflow slice:

- `StudentHold` with real hold types: `REGISTRATION`, `ACADEMIC`, `FINANCIAL`
- admin-governed hold creation and resolution APIs
- admin holds UI for creating, filtering, and resolving holds
- registration enforcement that blocks self-service add/enroll/precheck/submit/swap when active blocking holds exist
- `AcademicRequest` for `CREDIT_OVERLOAD`
- student overload request submission for a specific term
- advisor-owned overload request review and approve/reject decisions
- durable single-pending-request invariant for overload requests per student+term
- credit-limit enforcement that respects an approved overload limit
- student cart UI that shows active holds and overload request status and surfaces governance load failures honestly
- advisor request review page for assigned advisee overload requests

This establishes the first policy-driven academic workflow. It does **not** complete the broader approvals/holds domain.

The governance implementation now also has a Phase 1 workflow-engine foundation:

- explicit academic request lifecycle transition rules
- separation between generic workflow handling and request-type-specific policy logic
- request-type policy ownership/routing isolated from controller flow
- request-effect handling isolated from registration service call sites

That foundation is still intentionally narrow, but it changes the shape of future work:
adding a second governed request type should extend a policy surface, not duplicate the current overload logic.

The engine now proves that extension path with a second implemented request type:

- `AcademicRequest` for `PREREQ_OVERRIDE`
- student prerequisite-override submission for a specific target section
- faculty-owned review for sections they teach
- registration prerequisite enforcement that honors an approved override for that specific section only
- student cart visibility for prerequisite-override request status
- faculty request review page for owned prerequisite overrides

## Still Missing After This Slice

- faculty grade-change workflow or registrar correction approval
- faculty attendance, assignment, or LMS-facing instructional tools
- faculty instructor-consent workflow
- registrar finalization step for multi-actor approvals
- advisor standing review workflow beyond notes and read-only enrollment visibility
- programs, majors, minors, catalog years, and degree requirements
- degree audit and graduation clearance
- finance/bursar integration and hold synchronization
