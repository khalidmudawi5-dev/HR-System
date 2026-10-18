# Data model

Organization (single row): display name, timezone, locale. Branch → Department → JobPosition, with explicit branch/department foreign keys. Employee references each structural level, optional direct manager and unique Identity user. Employment number is unique, normalized; dates use DateOnly. Employee status and contract type validated by server.

EmployeeFinancial: employee PK/FK, decimal(18,2) base salary, bank and Saudi IBAN, effective-from date, concurrency token. Current phase stores current terms; historical salary periods and payroll snapshots are required in payroll phase.

ApplicationUser/Identity roles: optional one-to-one employee account link. AuditEvent: UTC timestamp, actor ID, action, entity ID; excludes passwords, salary and identity values. Attachment: private generated storage key, original display filename, media type and byte length.

Attendance: WorkShift is an immutable template of local start/end, next-day flag, unpaid break interval, grace and capture windows. WorkSchedule has a unique employee/date and snapshots the timezone, with a nullable shift only for rest days. AttendanceHoliday is an explicit organization date. AttendancePolicy is a singleton; portal registration defaults off. AttendancePunch is append-only with UTC timestamps, source and a unique employee/time/kind key; its ID also supports idempotent portal commands. AttendanceCorrection reserves a day through a filtered unique active-schedule key while Pending or Approved; stores proposed UTC times, schedule version, reason, actor/time and review decision. Results are derived on each read, not persisted or payroll snapshots. Rejected/cancelled requests release the reservation without deleting history.

Future modules: LeavePolicyVersion/LeaveLedger/Reservation/Request/ApprovalStep; PayrollRun/InputSnapshot/Line/Adjustment; Device/EmployeeDeviceMapping/SyncCheckpoint. Raw punches append-only; ledger and payroll finalization transactional and idempotent. These future entities are not yet implemented.
