# Prisma Schema Reference

## User
- Core identity and auth record
- Key fields: `id`, `email`, `studentId`, `role`, `passwordHash`, `emailVerifiedAt`, `lastLoginAt`, `loginAttempts`, `lockedUntil`, `deletedAt`
- Relations: `studentProfile`, `enrollments`, `inviteCodes`, `auditLogs`, `refreshTokens`, `notificationLogs`
- Indexes: role-specific lookups are handled through relation queries and email uniqueness

## StudentProfile
- Extended student-facing profile
- Key fields: `legalName`, `dob`, `address`, `emergencyContact`, `programMajor`, `enrollmentStatus`, `academicStatus`
- Relation: one-to-one with `User`

## Term
- Academic term and registration windows
- Key fields: `name`, `startDate`, `endDate`, `registrationOpenAt`, `registrationCloseAt`, `dropDeadline`, `maxCredits`, `registrationOpen`
- Relations: `sections`, `enrollments`, `cartItems`

## Course
- Course catalog master record
- Key fields: `code`, `title`, `description`, `credits`, `dept`, `deletedAt`
- Relations: `sections`, `prerequisiteLinks`, `requiredByLinks`

## CoursePrerequisite
- Join model for prerequisite chains
- Key fields: `courseId`, `prerequisiteCourseId`
- Relations: both sides reference `Course`

## Section
- Term-scoped offering of a course
- Key fields: `courseId`, `termId`, `sectionCode`, `capacity`, `modality`, `location`, `instructorName`, `requireApproval`, `deletedAt`
- Relations: `course`, `term`, `meetingTimes`, `enrollments`, `cartItems`, `ratings`
- Indexes: `courseId`, `termId`

## MeetingTime
- Weekly meeting slot for a section
- Key fields: `weekday`, `startMinutes`, `endMinutes`, `sectionId`
- Relation: belongs to `Section`

## Enrollment
- Final registration record for a student and section
- Key fields: `studentId`, `sectionId`, `termId`, `status`, `finalGrade`, `waitlistPosition`, `droppedAt`, `deletedAt`
- Relations: `student`, `section`, `term`
- Indexes: `studentId`, `sectionId`, `status`, `[studentId, status]`

## CartItem
- Pending registration intent before submit
- Key fields: `studentId`, `termId`, `sectionId`
- Relations: `student`, `term`, `section`

## InviteCode
- Registration invite or bootstrap code
- Key fields: `code`, `role`, `active`, `maxUses`, `usedCount`, `usedAt`, `expiresAt`
- Relation: optional `createdBy`

## AuditLog
- Immutable audit trail with integrity hashing
- Key fields: `actorUserId`, `action`, `entityType`, `entityId`, `metadata`, `ip`, `userAgent`, `createdAt`, `integrityHash`, `prevIntegrityHash`
- Relation: optional actor `user`
- Indexes: `createdAt`, `userId`, `action`

## Announcement
- Admin-authored announcement feed
- Key fields: `title`, `body`, `audience`, `pinned`, `expiresAt`
- Indexes: `expiresAt`, `audience`

## CourseRating
- Student feedback for sections
- Key fields: `studentId`, `sectionId`, `rating`, `comment`
- Relations: `student`, `section`
- Indexes: `sectionId`

## RefreshToken
- Long-lived refresh-token persistence
- Key fields: `userId`, `token`, `expiresAt`, `createdAt`
- Relation: belongs to `User`
- Indexes: `userId`, `expiresAt`

## PasswordResetToken
- One-time password reset token
- Key fields: `userId`, `token`, `expiresAt`, `usedAt`
- Relation: belongs to `User`
- Indexes: `expiresAt`

## EmailVerificationToken
- One-time email verification token
- Key fields: `userId`, `token`, `expiresAt`, `usedAt`
- Relation: belongs to `User`

## SystemSetting
- Small DB-backed config store
- Key fields: `key`, `value`, `updatedAt`

## NotificationLog
- Email and in-app notification ledger
- Key fields: `userId`, `type`, `subject`, `body`, `sentAt`
- Relation: belongs to `User`
- Indexes: `userId`, `sentAt`
