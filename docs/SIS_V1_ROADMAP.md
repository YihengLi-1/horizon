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

## Immediate Foundation Already Added

This repo now includes:

- `FACULTY` and `ADVISOR` roles in the domain model
- `FacultyProfile`
- `AdvisorProfile`
- `AdvisorAssignment`
- `Section.instructorUserId`
- admin APIs to create faculty, create advisors, and assign advisors

These changes are scaffolding, not a completed faculty/advisor portal.
