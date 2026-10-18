IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetRoles] (
        [Id] nvarchar(450) NOT NULL,
        [Name] nvarchar(256) NULL,
        [NormalizedName] nvarchar(256) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoles] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetUsers] (
        [Id] nvarchar(450) NOT NULL,
        [IsActive] bit NOT NULL,
        [UserName] nvarchar(256) NULL,
        [NormalizedUserName] nvarchar(256) NULL,
        [Email] nvarchar(256) NULL,
        [NormalizedEmail] nvarchar(256) NULL,
        [EmailConfirmed] bit NOT NULL,
        [PasswordHash] nvarchar(max) NULL,
        [SecurityStamp] nvarchar(max) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        [PhoneNumber] nvarchar(max) NULL,
        [PhoneNumberConfirmed] bit NOT NULL,
        [TwoFactorEnabled] bit NOT NULL,
        [LockoutEnd] datetimeoffset NULL,
        [LockoutEnabled] bit NOT NULL,
        [AccessFailedCount] int NOT NULL,
        CONSTRAINT [PK_AspNetUsers] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Audit] (
        [Id] bigint NOT NULL IDENTITY,
        [OccurredAt] datetimeoffset NOT NULL,
        [ActorId] nvarchar(450) NOT NULL,
        [Action] nvarchar(160) NOT NULL,
        [EntityId] nvarchar(100) NOT NULL,
        CONSTRAINT [PK_Audit] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Branches] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Branches] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Organizations] (
        [Id] uniqueidentifier NOT NULL,
        [Singleton] int NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [TimeZone] nvarchar(100) NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Organizations] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Organization_Singleton] CHECK ([Singleton] = 1)
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetRoleClaims] (
        [Id] int NOT NULL IDENTITY,
        [RoleId] nvarchar(450) NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoleClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetRoleClaims_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetUserClaims] (
        [Id] int NOT NULL IDENTITY,
        [UserId] nvarchar(450) NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetUserClaims_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetUserLogins] (
        [LoginProvider] nvarchar(450) NOT NULL,
        [ProviderKey] nvarchar(450) NOT NULL,
        [ProviderDisplayName] nvarchar(max) NULL,
        [UserId] nvarchar(450) NOT NULL,
        CONSTRAINT [PK_AspNetUserLogins] PRIMARY KEY ([LoginProvider], [ProviderKey]),
        CONSTRAINT [FK_AspNetUserLogins_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetUserRoles] (
        [UserId] nvarchar(450) NOT NULL,
        [RoleId] nvarchar(450) NOT NULL,
        CONSTRAINT [PK_AspNetUserRoles] PRIMARY KEY ([UserId], [RoleId]),
        CONSTRAINT [FK_AspNetUserRoles_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AspNetUserRoles_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [AspNetUserTokens] (
        [UserId] nvarchar(450) NOT NULL,
        [LoginProvider] nvarchar(450) NOT NULL,
        [Name] nvarchar(450) NOT NULL,
        [Value] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserTokens] PRIMARY KEY ([UserId], [LoginProvider], [Name]),
        CONSTRAINT [FK_AspNetUserTokens_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Departments] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [BranchId] uniqueidentifier NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Departments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Departments_Branches_BranchId] FOREIGN KEY ([BranchId]) REFERENCES [Branches] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Jobs] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [DepartmentId] uniqueidentifier NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Jobs] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Jobs_Departments_DepartmentId] FOREIGN KEY ([DepartmentId]) REFERENCES [Departments] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Employees] (
        [Id] uniqueidentifier NOT NULL,
        [Number] nvarchar(30) NOT NULL,
        [FullName] nvarchar(160) NOT NULL,
        [Email] nvarchar(254) NOT NULL,
        [Phone] nvarchar(30) NOT NULL,
        [JoinDate] date NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [ContractType] nvarchar(20) NOT NULL,
        [JobPositionId] uniqueidentifier NOT NULL,
        [ManagerId] uniqueidentifier NULL,
        [UserId] nvarchar(450) NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Employees] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Employee_Contract] CHECK ([ContractType] IN ('FixedTerm','Indefinite')),
        CONSTRAINT [CK_Employee_Status] CHECK ([Status] IN ('Active','Inactive','Terminated')),
        CONSTRAINT [FK_Employees_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Employees_Employees_ManagerId] FOREIGN KEY ([ManagerId]) REFERENCES [Employees] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Employees_Jobs_JobPositionId] FOREIGN KEY ([JobPositionId]) REFERENCES [Jobs] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Attachments] (
        [Id] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [StorageKey] nvarchar(100) NOT NULL,
        [FileName] nvarchar(200) NOT NULL,
        [MediaType] nvarchar(100) NOT NULL,
        [Size] bigint NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Attachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Attachments_Employees_EmployeeId] FOREIGN KEY ([EmployeeId]) REFERENCES [Employees] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE TABLE [Financials] (
        [Id] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [BaseSalary] decimal(18,2) NOT NULL,
        [Bank] nvarchar(120) NOT NULL,
        [Iban] nvarchar(24) NOT NULL,
        [EffectiveFrom] date NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Financials] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Financial_Salary] CHECK ([BaseSalary] >= 0),
        CONSTRAINT [FK_Financials_Employees_EmployeeId] FOREIGN KEY ([EmployeeId]) REFERENCES [Employees] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_AspNetRoleClaims_RoleId] ON [AspNetRoleClaims] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [RoleNameIndex] ON [AspNetRoles] ([NormalizedName]) WHERE [NormalizedName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_AspNetUserClaims_UserId] ON [AspNetUserClaims] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_AspNetUserLogins_UserId] ON [AspNetUserLogins] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_AspNetUserRoles_RoleId] ON [AspNetUserRoles] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [EmailIndex] ON [AspNetUsers] ([NormalizedEmail]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UserNameIndex] ON [AspNetUsers] ([NormalizedUserName]) WHERE [NormalizedUserName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_Attachments_EmployeeId] ON [Attachments] ([EmployeeId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_Audit_OccurredAt] ON [Audit] ([OccurredAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Branches_Name] ON [Branches] ([Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Departments_BranchId_Name] ON [Departments] ([BranchId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_Employees_JobPositionId_Status] ON [Employees] ([JobPositionId], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE INDEX [IX_Employees_ManagerId] ON [Employees] ([ManagerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Employees_Number] ON [Employees] ([Number]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Employees_UserId] ON [Employees] ([UserId]) WHERE [UserId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Financials_EmployeeId] ON [Financials] ([EmployeeId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Jobs_DepartmentId_Name] ON [Jobs] ([DepartmentId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Organizations_Singleton] ON [Organizations] ([Singleton]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015094525_InitialFoundation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015094525_InitialFoundation', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [AttendanceHolidays] (
        [Id] uniqueidentifier NOT NULL,
        [Date] date NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AttendanceHolidays] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [AttendancePolicies] (
        [Id] uniqueidentifier NOT NULL,
        [Singleton] int NOT NULL,
        [PortalEnabled] bit NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AttendancePolicies] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_AttendancePolicy_Singleton] CHECK ([Singleton] = 1)
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [AttendancePunches] (
        [Id] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [OccurredAtUtc] datetime2 NOT NULL,
        [Kind] nvarchar(10) NOT NULL,
        [Source] nvarchar(50) NOT NULL,
        [RecordedAtUtc] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AttendancePunches] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_AttendancePunch_Kind] CHECK ([Kind] IN ('In','Out')),
        CONSTRAINT [FK_AttendancePunches_Employees_EmployeeId] FOREIGN KEY ([EmployeeId]) REFERENCES [Employees] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [WorkShifts] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(100) NOT NULL,
        [StartMinute] int NOT NULL,
        [EndMinute] int NOT NULL,
        [EndsNextDay] bit NOT NULL,
        [BreakOffsetMinutes] int NOT NULL,
        [BreakMinutes] int NOT NULL,
        [ArrivalGraceMinutes] int NOT NULL,
        [DepartureGraceMinutes] int NOT NULL,
        [CaptureBeforeMinutes] int NOT NULL,
        [CaptureAfterMinutes] int NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_WorkShifts] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [WorkSchedules] (
        [Id] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [WorkDate] date NOT NULL,
        [ShiftId] uniqueidentifier NULL,
        [IsRestDay] bit NOT NULL,
        [TimeZone] nvarchar(100) NOT NULL,
        [LastChangeReason] nvarchar(500) NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_WorkSchedules] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_WorkSchedule_Shift] CHECK (([IsRestDay] = 1 AND [ShiftId] IS NULL) OR ([IsRestDay] = 0 AND [ShiftId] IS NOT NULL)),
        CONSTRAINT [FK_WorkSchedules_Employees_EmployeeId] FOREIGN KEY ([EmployeeId]) REFERENCES [Employees] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WorkSchedules_WorkShifts_ShiftId] FOREIGN KEY ([ShiftId]) REFERENCES [WorkShifts] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE TABLE [AttendanceCorrections] (
        [Id] uniqueidentifier NOT NULL,
        [ScheduleId] uniqueidentifier NOT NULL,
        [ScheduleVersion] uniqueidentifier NOT NULL,
        [ActiveScheduleId] uniqueidentifier NULL,
        [FirstInUtc] datetime2 NOT NULL,
        [LastOutUtc] datetime2 NOT NULL,
        [Reason] nvarchar(500) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [RequestedBy] nvarchar(450) NOT NULL,
        [RequestedAtUtc] datetime2 NOT NULL,
        [ReviewedBy] nvarchar(450) NULL,
        [ReviewedAtUtc] datetime2 NULL,
        [ReviewNote] nvarchar(500) NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AttendanceCorrections] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_AttendanceCorrection_Status] CHECK ([Status] IN ('Pending','Approved','Rejected','Cancelled')),
        CONSTRAINT [FK_AttendanceCorrections_WorkSchedules_ScheduleId] FOREIGN KEY ([ScheduleId]) REFERENCES [WorkSchedules] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_AttendanceCorrections_ActiveScheduleId] ON [AttendanceCorrections] ([ActiveScheduleId]) WHERE [ActiveScheduleId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE INDEX [IX_AttendanceCorrections_ScheduleId] ON [AttendanceCorrections] ([ScheduleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AttendanceHolidays_Date] ON [AttendanceHolidays] ([Date]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AttendancePolicies_Singleton] ON [AttendancePolicies] ([Singleton]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AttendancePunches_EmployeeId_OccurredAtUtc_Kind] ON [AttendancePunches] ([EmployeeId], [OccurredAtUtc], [Kind]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WorkSchedules_EmployeeId_WorkDate] ON [WorkSchedules] ([EmployeeId], [WorkDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE INDEX [IX_WorkSchedules_ShiftId] ON [WorkSchedules] ([ShiftId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WorkShifts_Name] ON [WorkShifts] ([Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018073539_AttendanceFoundation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261018073539_AttendanceFoundation', N'10.0.13');
END;

COMMIT;
GO

