# Document Control

| Item | Value |
|---|---|
| Project title | University Academic Management and Instructor Performance Evaluation System (UAMIPES) |
| Institution | Mizan-Tepi University (MTU) |
| Prepared by | Dawit Mamo |
| Document type | Complete system, user, deployment, and maintenance documentation |
| Version | 1.0 |
| Publication date | July 2026 |
| Application stack | MongoDB, Express.js, React, Node.js (MERN) |
| Repository folder | mtu_instructors_performance_evaluation_systems |
| Institutional email domain | mtu.edu.et |

## Purpose of this document

This document is the authoritative technical and operational guide for the MTU Academic Management and Instructor Performance Evaluation System. It explains why the system exists, how it is designed, how each user role operates it, how evaluation scores are calculated, how the database is structured, how the API is secured, how to install and deploy the application, and how another authorized team can duplicate and maintain the project.

The document is based on the implemented source code in the repository as of July 2026. Where a feature is intentionally limited or requires future work, the limitation is stated explicitly rather than represented as complete.

## Intended audience

- University management and project evaluators.
- System administrators and department heads.
- Course and Exam Committee members.
- Instructors, students, and academic support staff.
- Software developers, database administrators, testers, and deployment engineers.
- Researchers or institutions authorized to reproduce the project.

## Document conventions

- **HOD** means Head of Department.
- **Course and Exam Committee** is one unified delegated responsibility assigned to instructors. It is not two separate roles.
- **MTU email** means an address ending in `@mtu.edu.et`.
- API paths are relative to the backend base URL, normally `http://localhost:5000`.
- Commands are shown for a terminal. On Windows PowerShell, `npm.cmd` may be used if script execution policy blocks `npm.ps1`.

# Table of Contents

1. Executive Summary
2. Background, Problem, and Objectives
3. Scope and Stakeholders
4. Requirements Analysis
5. System Architecture and Technology
6. Roles and Authorization
7. Functional Workflows
8. Evaluation Design and Scoring
9. ECE Academic Streams and Allocation
10. Database Design
11. REST API Reference
12. User Interface and User Guide
13. Data Import, Export, and Schedules
14. Installation and Local Development
15. Docker and Production Deployment
16. Security, Privacy, and Auditability
17. Testing and Quality Assurance
18. Backup, Recovery, and Maintenance
19. Troubleshooting
20. Limitations and Future Development
21. Duplication and Publication Checklist
22. Appendices

# 1. Executive Summary

The University Academic Management and Instructor Performance Evaluation System is a responsive web application developed for Mizan-Tepi University. It combines departmental academic administration—users, semesters, courses, assignments, committees, schedules, reports, and ECE stream allocation—with semester-based instructor evaluation by students, peer instructors, and department heads. It replaces fragmented paper and spreadsheet processes with role-aware workflows backed by a structured MongoDB database.

The system manages departments, semesters, users, courses, instructor assignments, enrolled student lists, peer evaluation tasks, evaluation windows, configurable evaluation templates, reports, notifications, class and examination schedules, and Electrical and Computer Engineering stream allocation.

Four primary account roles are implemented: Super Admin, HOD, Instructor, and Student. An instructor may additionally receive the unified `COURSE_EXAM_COMMITTEE` duty. The HOD appoints exactly three active instructors from the department to this committee for a semester and selects one of the three as chair. Committee members retain instructor accounts while receiving department-scoped permissions for course, assignment, schedule, roster lookup, report, and stream-selection operations.

Evaluation results use a five-point rating scale. Student evaluation contributes 50 percent, peer evaluation contributes 20 percent, and HOD evaluation contributes 30 percent when all sources are available. If one or more sources are unavailable, the application normalizes the total using only the weights of the available sources. Final reports contain source scores, category scores, strengths, weaknesses, recommendations, comments, and an official final summary published by the HOD or Course and Exam Committee.

The project uses the MERN stack: React and Vite in the browser, Express.js and Node.js for the API, and MongoDB with Mongoose for persistence. JSON Web Tokens provide access and refresh sessions. Zod validates API input, bcrypt protects passwords, and middleware provides rate limiting, security headers, MongoDB query sanitization, CORS enforcement, and audit logging.

The application includes an idempotent Electrical and Computer Engineering demonstration dataset with ten students in each of Years 2 through 5, four academic streams, sample instructors, courses, assignments, a three-instructor committee, a schedule, and a stream-selection round. Automated backend tests verify authentication, academic rules, permissions, evaluations, schedules, stream allocation, file import security, scoring, and seed integrity.

## 1.1 Key outcomes

- A single institutional source of truth for instructor evaluation data.
- Department-scoped access that reduces unauthorized cross-department activity.
- Enforced evaluation periods and duplicate-submission protection.
- Student, peer, and HOD instruments aligned to separate evaluation purposes.
- Authenticated enrollment checks and one-submission-per-assignment enforcement.
- Instructor dashboards limited to assigned courses, assigned students and streams, assigned peer tasks, reports, and notifications.
- GPA-priority stream allocation with capacity control for ECE Year 3 students.
- CSV and readable-text PDF account imports for up to 1,000 students or instructors per file.
- Class and examination schedule publication to department students and instructors.
- PDF and CSV performance report export.

## 1.2 System boundary

UAMIPES is an academic evaluation and departmental workflow system. It is not a student information system, payroll system, learning management system, grading platform, email server, or identity provider. Integration with those platforms is possible future work.

# 2. Background, Problem, and Objectives

## 2.1 Background

Instructor performance evaluation supports teaching quality, staff development, accountability, and evidence-based academic management. A balanced evaluation should combine the learner perspective, professional peer observation, and supervisory review. When these processes rely on disconnected paper forms or spreadsheets, it becomes difficult to ensure eligibility, prevent duplicate responses, calculate consistent scores, protect privacy, and deliver useful feedback on time.

Mizan-Tepi University also requires department-specific academic administration. In Electrical and Computer Engineering, students proceed through a common program before joining one of four streams. The system therefore connects evaluation administration with course assignments, student cohorts, instructor specialization, stream selection, schedules, and department notifications.

## 2.2 Problem statement

The project addresses the following operational problems:

- Evaluation records may be dispersed across paper forms, files, and individual computers.
- Students may not have a reliable way to identify only their assigned instructors and courses.
- Peer evaluators may see instructors they were not assigned to review.
- HOD and committee responsibilities may overlap or be interpreted inconsistently.
- Manual score aggregation is slow and susceptible to formula errors.
- Course assignments may include students or instructors from the wrong department, year, or stream.
- Department users may lack timely access to class and examination schedules.
- Bulk registration of students and instructors is inefficient when each account must be entered manually.
- ECE stream placement requires consistent ranking by GPA, student preference, and capacity.
- Administrators need auditable records of successful state-changing operations.

## 2.3 General objective

To design and implement a secure, database-backed, role-aware web system for evaluating MTU instructor performance using student, peer, and HOD input while supporting the related departmental academic workflows required to administer those evaluations.

## 2.4 Specific objectives

1. Provide authenticated access for Super Admin, HOD, Instructor, Student, and appointed Course and Exam Committee users.
2. Manage departments, semesters, courses, academic streams, users, and instructor assignments.
3. Restrict every user to information and actions permitted by role and department.
4. Allow students to evaluate only instructors for published course assignments in which they are enrolled.
5. Allow instructors to complete only explicitly assigned peer evaluation tasks.
6. Allow HOD users to evaluate instructors in their own departments.
7. prevent self-evaluation and duplicate evaluation submissions.
8. Authorize student evaluations from authenticated enrollment in published assignments.
9. Calculate weighted source and category scores consistently.
10. Publish final summaries and notify the evaluated instructor.
11. Appoint exactly three instructors to one unified Course and Exam Committee per department and semester.
12. Allow HOD and committee members to manage ECE stream selection by ranked preferences, GPA, and capacity.
13. Support CSV and readable-text PDF import of student and instructor accounts.
14. Publish class and examination schedules as text, PDF, or CSV.
15. Provide sample data, tests, migrations, integrity audits, and deployment instructions.

## 2.5 Success criteria

The implementation is considered operational when authenticated users can complete their role workflows, invalid department and academic relationships are rejected, duplicate evaluations are prevented, reports reproduce the configured scoring rules, the application builds successfully, the automated test suite passes, and the database integrity audit reports no invalid MTU email, ECE profile, assignment, or committee records.

# 3. Scope and Stakeholders

## 3.1 In scope

- Institutional account registration and authentication.
- Role- and department-based authorization.
- Department and semester administration.
- Course definition by semester, year, and optional stream.
- Instructor assignment with student rosters and peer evaluators.
- Student, peer, and HOD evaluation instruments.
- Evaluation windows and assignment publication status.
- Authenticated, enrollment-scoped student evaluations with duplicate prevention.
- Weighted score aggregation and category analysis.
- Instructor and department reports.
- Final report summary publication and notification.
- Unified Course and Exam Committee appointment.
- User, department, and university notifications.
- ECE stream choices, capacities, and allocation.
- Student and instructor bulk import from CSV and text-readable PDF.
- Class, exam, or combined schedule creation and file publication.
- Demo and ECE sample data.
- Docker and local development deployment.
- Audit logs for successful state-changing operations.

## 3.2 Out of scope in the current release

- University single sign-on, LDAP, OAuth, or external identity federation.
- Automatic delivery of password-reset emails.
- Image OCR for scanned PDF imports.
- Native Android or iOS applications.
- Automatic synchronization with a registrar or learning management system.
- Formal digital signatures on final summaries.
- Advanced statistical significance, bias detection, or natural-language sentiment analysis.
- Multi-university tenancy.
- Direct spreadsheet `.xlsx` generation; the current “Excel” report endpoint returns CSV.
- A frontend automated test suite.

## 3.3 Stakeholder matrix

| Stakeholder | Primary interest | System interaction |
|---|---|---|
| University administration | Governance, institutional oversight, reliable data | Super Admin dashboard, departments, users, reports, university notifications |
| HOD | Department operation and evaluation quality | Users, semesters, courses, assignments, committee appointment, HOD evaluations, reports, stream allocation, schedules |
| Course and Exam Committee | Delegated semester administration | Courses, instructor evaluation assignments, department roster lookup, reports, stream selection, schedules |
| Instructor | Accurate workload and fair feedback | Assigned courses, student/stream lists, peer tasks, own report, schedules, notifications |
| Student | Simple and confidential participation | Assigned course evaluations, stream choices, published schedules |
| Software administrator | Availability, security, backup, deployment | Environment, database, logs, tests, migrations, backups |
| Project evaluator or researcher | Completeness and reproducibility | Documentation, source code, sample data, test evidence |

## 3.4 Assumptions

- Every operational user has a unique `@mtu.edu.et` address.
- Departments, semesters, and user accounts are configured before assignments.
- Only published assignments in an open semester are evaluable.
- Department users are linked to the correct department.
- ECE stream selection is currently limited to the department code `ECE` and Year 3 students.
- The HOD appoints committee members from active instructors in the same department.
- Production secrets and the production MongoDB connection are configured by an authorized administrator.

# 4. Requirements Analysis

## 4.1 Functional requirements

### Authentication and accounts

- The system shall authenticate users with MTU email and password.
- The system shall issue access and refresh tokens after successful authentication.
- The system shall reject disabled accounts and invalid credentials.
- The system shall allow an authenticated user to change the password by confirming the current password.
- The system shall allow a user who cannot sign in to request and complete a password reset with a hashed, single-use token valid for 30 minutes.
- The system shall invalidate previous access and refresh tokens after a password change or reset using `tokenVersion`, and shall issue a fresh token pair after an authenticated change.
- The system shall validate that new account passwords contain at least eight characters.
- The system shall restrict all account emails to the MTU domain.
- Every authenticated role shall edit its own first name, last name, phone number, and short biography.
- Every authenticated role shall upload, replace, retrieve, or remove its own JPEG, PNG, or WebP profile photo.
- Profile photos shall be limited to 2 MB and validated by extension, MIME type, and binary file signature.
- Self-service profile changes shall not modify role, committee duty, department, institutional email, student/employee number, GPA, year, or academic stream.

### Academic catalog

- Super Admin shall create and update departments.
- Super Admin and HOD shall create and update semesters.
- Super Admin, HOD, and committee members shall manage courses within their permitted department.
- Course code shall be unique within a semester.
- Courses may specify Year 2 through Year 5 and an ECE stream where applicable.

### Assignments

- Authorized staff shall connect one instructor, one course, one semester, zero or more enrolled students, and zero or more peer evaluators.
- The assignment semester shall match the course semester.
- The HOD or an appointed Course and Exam Committee member may create the instructor evaluation assignment.
- Student evaluators may be enrolled as an entire department year/stream cohort or selected individually for exceptional cases.
- Instructor, students, peer evaluators, and course shall belong to the correct department.
- Stream and year constraints shall be validated before saving.
- An instructor shall not be assigned as the evaluator of their own assignment.
- An assignment shall progress through `DRAFT`, `VERIFIED`, and `PUBLISHED` states.

### Course preferences

- An instructor shall rank between one and three different courses from the instructor's department and semester.
- The system shall send each new or updated submission to the department HOD and Course and Exam Committee members.
- HOD and committee members shall review submitted preferences within their own department.
- A manager shall confirm exactly one course from the instructor's submitted choices.
- A course already assigned or confirmed for another instructor shall not be available.
- Confirmation shall create a draft instructor assignment and a direct notification naming the confirmed course.
- A confirmed preference shall be final and unavailable for instructor editing.
### Evaluations

- Student evaluations shall require an authenticated student, enrollment, a published assignment, and an open semester.
- Peer evaluations shall require explicit assignment as a peer evaluator.
- HOD evaluations shall be limited to the HOD’s department.
- Each evaluator shall submit at most one evaluation for the same applicable target and semester.
- Every active template question shall be answered or marked not applicable when allowed.
- At least one response shall contain a numeric score.

### Reports and communication

- Authorized users shall view instructor reports within their scope.
- Instructors shall see only their own published final report.
- HOD and committee members shall publish a final summary of 10 to 4,000 characters.
- Publication shall generate an instructor notification.
- Reports shall be downloadable as PDF and CSV.
- Admin, HOD, and committee members shall send permitted staff notifications.

### Stream selection

- Eligible ECE Year 3 students shall rank exactly three different streams from four choices.
- HOD and committee members shall configure one capacity for each stream.
- Allocation shall run only after the round is closed and every eligible student has submitted.
- The system shall reject allocation when GPA is missing or total capacity is insufficient.
- Students shall be processed by descending GPA, then submission time, then user identifier.

### Imports and schedules

- Authorized staff shall import student or instructor records from CSV or readable-text PDF.
- A single import shall contain no more than 1,000 records.
- Import shall reject duplicate emails within the file and cross-department modification.
- Schedule files shall be limited to PDF or CSV and no more than 5 MB.
- Published schedules shall be visible to students and instructors in the department.

## 4.2 Non-functional requirements

| Category | Requirement |
|---|---|
| Security | Password hashing, JWT authentication, role authorization, input validation, query sanitization, security headers, rate limiting, and audit records |
| Usability | Responsive role-aware dashboard, clear empty/error states, dark mode, accessible labels, and grouped academic lists |
| Performance | Indexed MongoDB queries, pageless operational lists suitable for the current institutional scale, API request timeout of 15 seconds in the frontend |
| Reliability | Unique indexes, validation at API and model layers, idempotent seeds, health endpoint, database audit, and automated tests |
| Maintainability | Modular controllers, routes, models, services, utilities, reusable React components, workspace scripts, and Dockerfiles |
| Portability | Node.js application, web browser client, Docker Compose deployment, Windows/Linux-compatible npm workflow |
| Data integrity | Department, year, stream, semester, duplicate, status, and capacity constraints enforced before writes |
| Auditability | Successful protected state changes stored with action, actor, IP address, user agent, path, and method |

# 5. System Architecture and Technology

## 5.1 High-level architecture

```text
┌───────────────────────────────────────────────────────────────┐
│ Browser: React 18 + Vite + Axios + Recharts                  │
│ Login • role dashboard • forms • reports • schedules         │
└─────────────────────────────┬─────────────────────────────────┘
                              │ HTTPS / JSON / multipart files
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ Express API on Node.js                                       │
│ Authentication • authorization • validation • business rules │
│ evaluation • reporting • import • schedule • audit           │
└─────────────────────────────┬─────────────────────────────────┘
                              │ Mongoose ODM
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ MongoDB                                                      │
│ Users • departments • courses • assignments • evaluations    │
│ reports • committees • schedules • stream selection • audit  │
└───────────────────────────────────────────────────────────────┘
```

## 5.2 Frontend

The frontend is a single-page React application built by Vite. `AuthContext` restores a saved session, provides login and logout, and stores the dark-mode preference. Axios attaches the access token to requests. When a protected request returns HTTP 401, the client attempts one refresh-token exchange, saves the new session, and retries the original request. If refresh fails, local tokens are removed and the user returns to the login page.

Role-aware navigation is calculated in the sidebar. The application does not rely on hidden navigation alone for security; the backend independently authenticates and authorizes every protected endpoint.

Main frontend technologies:

| Technology | Purpose |
|---|---|
| React 18 | Component-based user interface |
| React Router | Application routing and protected route flow |
| Axios | API requests and token refresh interceptor |
| React Hook Form | Form state and client-side validation support |
| Recharts | Score and category visualizations |
| Lucide React | Interface icons |
| Vite | Development server and production bundling |
| Tailwind/PostCSS dependencies | Styling toolchain support; the main design is implemented in project CSS |

## 5.3 Backend

The backend is an ECMAScript module Node.js application. Express assembles middleware, health monitoring, and route modules. Controllers implement business rules, while Mongoose models enforce document schemas and indexes. Zod schemas validate route parameters, query strings, and request bodies before controllers execute.

Main backend technologies:

| Technology | Purpose |
|---|---|
| Express 4 | REST API and middleware pipeline |
| Mongoose 8 | MongoDB object modeling, validation, relations, and indexes |
| Zod | Request validation and coercion |
| JSON Web Token | Access and refresh session tokens |
| bcryptjs | Secure user password hashing and verification |
| Multer | In-memory multipart file upload handling |
| csv-parse | CSV and delimited-text record parsing |
| pdf-parse | Readable-text extraction from uploaded PDFs |
| PDFKit | Instructor report and project-document PDF generation |
| Helmet | Browser security headers |
| express-rate-limit | Global API request throttling |
| express-mongo-sanitize | MongoDB operator injection protection |
| Morgan | HTTP request logging |
| Jest and Supertest | Automated unit and API tests |
| mongodb-memory-server | Embedded local/test MongoDB support |

## 5.4 Request processing pipeline

```text
Request
  → Helmet security headers
  → CORS origin policy
  → 300 requests / 15-minute rate limit
  → JSON or URL-encoded parser
  → Cookie parser
  → MongoDB query sanitization
  → HTTP request log
  → Route authentication
  → Role/delegated-duty authorization
  → Zod validation
  → Audit listener for successful mutations
  → Controller and Mongoose business rules
  → JSON/file response
  → Central error handler
```

## 5.5 Project structure

```text
mtu_instructors_performance_evaluation_systems/
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── config/          database and environment configuration
│       ├── constants/       academic stream constants
│       ├── controllers/     request and business workflows
│       ├── middleware/      auth, validation, audit, error handling
│       ├── models/          Mongoose schemas and indexes
│       ├── routes/          REST endpoint definitions
│       ├── services/        demo data and import parsing
│       ├── tests/           Jest and Supertest test suites
│       ├── utils/           scoring, tokens, academic rules
│       ├── validators/      Zod schemas
│       ├── app.js           Express application factory
│       └── server.js        database connection and HTTP startup
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── api/             Axios client and API functions
│       ├── assets/          MTU logo
│       ├── components/      shared interface components
│       ├── context/         authentication state
│       ├── pages/           role-aware application pages
│       ├── styles/          responsive application styling
│       └── utils/           stream labels and grouping
├── docs/                    generated documentation source and PDF
├── .env.example             environment template
├── docker-compose.yml       MongoDB, API, and web deployment
├── package.json             workspace commands
└── README.md                quick-start guide
```

## 5.6 Runtime topology

In local development, Vite runs at port 5173 and proxies `/api` to Express at port 5000. Express connects to the configured MongoDB server. If no `MONGO_URI` is provided and the fallback is enabled, the backend starts a persistent embedded MongoDB under `.data/mongodb`.

In Docker Compose, the `web` service uses Nginx on host port 5173, the `api` service exposes port 5000, and the `mongo` service exposes port 27017 with a named volume. The API connects internally to `mongodb://mongo:27017/instructor_evaluations`.

> The supplied Nginx image serves the frontend. A production deployment must also route browser `/api` requests to the backend or set `VITE_API_URL` at frontend build time. Without one of those configurations, an independently hosted static frontend will request `/api` from its own host.

# 6. Roles and Authorization

## 6.1 Role model

The primary `role` field accepts only `SUPER_ADMIN`, `HOD`, `INSTRUCTOR`, or `STUDENT`. Committee membership is stored separately in the instructor's `committeeRoles` array as `COURSE_EXAM_COMMITTEE`. This design preserves the instructor identity and dashboard while adding delegated permissions.

The HOD assigns committee membership through the semester committee page. Manual user creation or editing cannot add or remove the committee duty. Exactly three different active instructors from the HOD's department are required, and the chair must be one of them.

## 6.2 Permission matrix

| Capability | Super Admin | HOD | Instructor | Student | Course and Exam Committee |
|---|---|---|---|---|---|
| View dashboard | University | Own department | Own data | Own data | Instructor data plus management pages |
| Edit own profile/photo | Yes | Yes | Yes | Yes | Yes |
| Manage departments | Create/update | View | No | No | View |
| Manage semesters | Create/update | Create/update | View limited | No | View |
| Manage courses | All departments | Own department | No | View assigned | Own department |
| Manage assignments | All departments | Own department | View own | View enrolled | Own department |
| Submit/confirm course preferences | No | Confirm own department | Submit up to three | No | Submit own and confirm department |
| Appoint committee | No | Exactly three instructors | No | No | No |
| Build evaluation assignments | University-wide | Own department | No | No | Own department |
| Submit student evaluation | No | No | No | Assigned courses | No |
| Submit peer evaluation | No | No | Assigned tasks | No | Assigned tasks as instructor |
| Submit HOD evaluation | No | Own department | No | No | No |
| View instructor report | All | Own department | Own report | No | Own department |
| Publish final summary | No | Own department | No | No | Own department |
| Import accounts | All departments | Own department | No | No | Own department |
| Manage stream selection | No | ECE department | No | Submit choices | ECE department |
| Manage schedules | All departments | Own department | View published | View published | Own department |
| Send notifications | University/department/staff | Department/staff | No | No | Department/staff |

## 6.3 Department scoping

The API loads the authenticated user for every request and checks both the primary role and delegated committee duties. Non-admin catalog and management operations are restricted to the user's department. Course assignments validate the department of the course, instructor, enrolled students, and peer evaluators. Reports and schedule downloads use the same department boundary.

Super Admin can operate across departments where the endpoint permits it. HOD and committee accounts without a department are denied management access. Students and ordinary instructors see only assignments connected to their account.

## 6.4 Insufficient permissions behavior

The authorization middleware returns HTTP 403 with `Insufficient permissions` when neither the primary role nor a delegated duty matches the endpoint. A 401 response instead means authentication is missing or expired. Users should sign in using an account with the required role and verify that their account is active, assigned to the correct department, and, where applicable, appointed to the semester committee.

## 6.5 Session behavior

- Access token lifetime defaults to 15 minutes.
- Refresh token lifetime defaults to 7 days.
- Tokens contain the user identifier and token version.
- The frontend stores tokens in browser local storage.
- Access tokens are sent as `Authorization: Bearer <token>`.
- A failed protected request triggers one refresh attempt.
- Logout removes both tokens and the current user state.
- Password change increments the token version, invalidating old refresh sessions.

# 7. Functional Workflows

## 7.1 Initial university setup

1. Configure environment variables and start MongoDB, API, and frontend.
2. Run the main seed to create baseline university data and demonstration accounts.
3. Sign in as Super Admin.
4. Create or verify departments and assign HOD accounts.
5. Create the academic semester with start, end, evaluation opening, evaluation closing, and status.
6. Register or import department instructors and students.
7. Confirm every ECE instructor has one stream and every ECE student has the correct year/stream profile.
8. Create semester courses.
9. Create instructor assignments with student rosters and peer evaluators.
10. Verify assignments, then change them to `PUBLISHED` before evaluation begins.

## 7.2 Committee appointment

```text
HOD opens Course and Exam Committee page
  -> selects semester
  -> selects exactly three active department instructors
  -> selects one of those three as chair
  -> saves appointment
  -> system creates or updates the department-semester committee
  -> unified committee duty is added to all three instructor accounts
  -> removed members lose the duty only when not active elsewhere
```

The committee is unique per department and semester. The database records the department, semester, three members, chair, appointing HOD, and `ACTIVE` or `CLOSED` status.

## 7.3 Course and instructor assignments

The dashboard presents two separate assignment workflows to the HOD and Course and Exam Committee:

1. **Course Assignments** links a course and semester to the instructor who will teach it. It creates a draft teaching assignment without student evaluators.
2. **Evaluation Assignments** selects an existing course assignment, preserves its instructor/course pair, adds the student class and peer evaluators, and publishes it for evaluation.

The resulting assignment is the central link used by evaluation workflows. The normal enrollment mode selects an entire class by year and, where applicable, academic stream; the server resolves all active matching students automatically. Individual enrollment remains available for exceptional rosters. Creating the same course assignment again is rejected so an existing evaluation roster cannot be overwritten accidentally.

Before saving, the API validates that the instructor is active, belongs to the course department, and matches an ECE stream-specific course. Every student must be active, in the course department, in the course year, and in the stream where the course is stream-specific. Every peer evaluator must be a different active instructor in the department.

## 7.4 Instructor course preference and confirmation

1. An instructor opens **Course Preferences**, selects a semester, and ranks one to three available department courses.
2. The API validates the semester, department, distinct choices, and current course availability.
3. The submission is saved or updated and direct notifications are sent to the HOD and Course and Exam Committee reviewers.
4. The HOD or a committee member opens the same page, selects the semester, and reviews every instructor's ordered choices.
5. The reviewer selects one submitted course that is not assigned or confirmed for another instructor.
6. Confirmation is final, creates a `DRAFT` instructor assignment, and prevents that course from being allocated to another instructor.
7. The system sends a direct notification to the instructor naming the course and semester; the confirmed result also appears on the preference page.

Committee members keep both views because they are instructors and delegated reviewers: they may submit their own preferences and review other department submissions.
## 7.5 Evaluation opening

An evaluation is available only when all of the following are true:

- The assignment status is `PUBLISHED`.
- The linked semester status is `OPEN`.
- Current time is not before `evaluationOpensAt`, when specified.
- Current time is not after `evaluationClosesAt`, when specified.

No separate evaluation key is required. The authenticated account, published assignment roster, evaluation window, and unique student/assignment constraint provide authorization and duplicate prevention.

## 7.6 Student evaluation

1. The student signs in with an MTU account.
2. The dashboard lists only published, currently evaluable assignments containing that student.
3. The student opens a course evaluation and the system loads the latest active Student template.
4. Every question receives a 1-5 score or `NA`; at least one must be scored.
5. The optional anonymous comment is limited to 2,000 characters.
6. The API verifies the authenticated account, enrollment, availability, template identity, and duplicate status.
7. The evaluation is created and the dashboard shows that the assignment has been submitted.

The student identifier is retained in the database to enforce eligibility and duplicate protection but is excluded by default from normal evaluation queries.

## 7.7 Peer evaluation

An instructor sees only published assignments where their identifier appears in `peerEvaluators`, the target is another instructor, the semester is open, and no evaluation by that evaluator for the target and semester already exists. Self-evaluation is rejected. The peer form uses the active Peer template and accepts an optional 2,000-character comment.

## 7.8 HOD evaluation

The HOD evaluation list contains unique, open instructor targets from courses in the HOD's department. The HOD cannot evaluate themself and can submit only once for the same instructor and semester. The active HOD template is used.

## 7.9 Report generation and publication

Report generation loads student, peer, and HOD evaluations for the selected instructor and semester. It calculates source averages, weighted overall score, and category averages. Categories with scores of at least 4 become strengths; categories below 3.2 become weaknesses. A recommendation is selected from the overall score band.

HOD and committee users may publish a final summary for an instructor in the same department. Publication changes the report status to `PUBLISHED`, stores the author and date, and creates or updates an instructor notification. The instructor dashboard then displays the signed final summary, source scores, category visualization, recommendations, publication details, and department/university notifications.

## 7.10 Instructor dashboard

The instructor dashboard intentionally contains only instructor-relevant information:

- Assigned course count and enrolled student count.
- Assigned and pending peer-review tasks.
- Final report status and score.
- Consolidated students grouped by year and stream, with student number and course codes.
- Individual assigned course cards with grouped student rosters.
- The peer evaluation form for eligible tasks.
- The instructor's own live results and published final summary.
- Direct, department, and university notifications.
- Published class and examination schedules for the department.

## 7.11 Notification workflow

Super Admin can publish to the entire university, one department, or one HOD/instructor. HOD and committee members can publish to their department or a staff member in that department. University and department notifications are visible to HOD users; instructor notifications combine user, department, and university audiences.

## 7.12 Schedule workflow

Super Admin, HOD, and committee members can create a `CLASS`, `EXAM`, or `COMBINED` schedule. They select a semester and department, enter text details or attach PDF/CSV, and save as `DRAFT` or `PUBLISHED`. Department managers can see drafts and published schedules. Students and ordinary instructors see only published schedules from their own department.


## 7.13 Self-service profile and password workflow

1. Any authenticated user opens **My Profile** from the sidebar or dashboard header.
2. The user may update first name, last name, phone number, and a biography of up to 500 characters.
3. The API strips unrecognized fields and does not accept self-service changes to institutional identity or academic placement.
4. The user may upload or replace one `.jpg`, `.jpeg`, `.png`, or `.webp` photo no larger than 2 MB.
5. The upload layer validates extension and MIME type, while the controller validates JPEG, PNG, or WebP binary signatures before storing the image.
6. Photo retrieval requires an authenticated access token. The frontend requests the photo as a blob and displays it in the dashboard header and profile page.
7. Removing a photo restores the initials-based avatar. Successful profile and photo mutations are audit logged.
8. In **Password security**, the user supplies the current password and matching new password fields. A successful change rotates the browser session and invalidates all older access and refresh tokens.
9. A user who cannot sign in selects **Forgot your password?**, requests a token using an MTU email, and supplies that token with matching new-password fields. The token expires after 30 minutes and cannot be reused.
# 8. Evaluation Design and Scoring

## 8.1 Rating scale

| Numeric value | Label | Meaning |
|---|---|---|
| 1 | VL | Very Low |
| 2 | L | Low |
| 3 | A | Average |
| 4 | H | High |
| 5 | VH | Very High |
| Not scored | NA | Not Applicable; excluded from averages |

## 8.2 Source weights

| Evaluation source | Weight |
|---|---|
| Student | 40% |
| Peer/colleague | 30% |
| HOD/immediate supervisor | 30% |

For each evaluation, the application averages all numeric responses and excludes `NA`. It then averages evaluation scores within each source.

```text
StudentScore = average(all student evaluation scores)
PeerScore    = average(all peer evaluation scores)
HODScore     = average(all HOD evaluation scores)

Overall = (StudentScore * 0.40) + (PeerScore * 0.30) + (HODScore * 0.30)
```

The approved weights remain fixed. A source that has not submitted contributes zero until its evaluation is completed, so the displayed final result always shows the same 40/30/30 policy.

## 8.3 Category scores

Category scores combine every numeric response under the same category across the selected evaluations. They are rounded to two decimal places. These scores drive dashboard charts and the strengths/weaknesses section of an instructor report.

## 8.4 Recommendation bands

| Overall score | System recommendation |
|---|---|
| 4.50 or above | Sustain excellent teaching practice and mentor peers. |
| 3.80-4.49 | Maintain strengths while refining lower scoring categories. |
| 3.00-3.79 | Create a focused improvement plan with peer coaching. |
| Below 3.00 | Schedule HOD support, teaching observation, and follow-up development actions. |

## 8.5 Student instrument

The Student Instructor Performance Evaluation contains 18 questions across four categories.

### Core Competency

- Preparation and organization for class.
- Clarity of course explanations.
- Subject matter knowledge.
- Use of practical examples.
- Relevance of teaching materials and resources.

### Teaching Methodology

- Encouragement of student participation.
- Suitability of teaching methods.
- Effective use of class time.
- Useful feedback on learning progress.
- Respectful and clear handling of questions.

### Assessment and Feedback

- Alignment of assessments with course objectives.
- Fair and transparent grading.
- Timely feedback.
- Clear communication of assessment expectations.

### Professional and Ethical Competency

- Respectful treatment of students.
- Punctuality and dependability.
- Availability for academic support.
- Compliance with university rules and professional conduct.

## 8.6 Peer instrument

The Colleague Instructor Performance Evaluation contains 20 questions across four categories.

- **Core Competency and Subject Matter Contribution:** teaching materials, seminars or presentations, and subject expertise.
- **Research and Community Services:** community service, institutional participation, research, publication, and colleague support.
- **Professional Competency:** student guidance, constructive contribution, problem solving, professional development, cooperative learning, team teaching, and department participation.
- **Ethical Competency:** committee responsibility, resource sharing, collegiality, attitude to teaching, compliance, discipline, and commitment.

## 8.7 HOD instrument

The Immediate Supervisor Instructor Performance Evaluation contains 20 questions across three categories.

- **Core Competency:** specialization development, subject knowledge, teaching methodology, additional duties, cooperative and practical learning, academic review, committees, regular teaching, research, and academic advising.
- **Professional Competency:** institutional problem solving, CPD/HDP/ELIP, timely academic documents, staff cooperation, and response to supervision.
- **Ethical Competency:** policy compliance, punctuality, fair treatment, responsible resource use, and professional integrity.

## 8.8 Template versioning

Evaluation templates have a kind, description, version, active flag, scale, and ordered categories/questions. A unique index prevents two templates with the same kind and version. Submission validates that the incoming question order and text exactly match the selected active template, preventing clients from changing the questionnaire or omitting questions.

# 9. ECE Academic Streams and Allocation

## 9.1 Supported streams

1. Electronics Communication Engineering.
2. Computer Engineering.
3. Power Engineering.
4. Control Engineering.

## 9.2 Academic profile rules

- ECE instructors must belong to exactly one supported stream.
- ECE students must have a year level from 2 through 5.
- Year 2 and Year 3 ECE students must not yet have a stream.
- Year 4 and Year 5 ECE students must have a stream.
- Year 4-5 ECE courses must specify a stream.
- Year 2-3 ECE courses cannot specify a stream.
- Academic streams are rejected for non-ECE departments in the current release.

## 9.3 Student preference workflow

The stream-selection form is available to ECE Year 3 students. An open round displays all four streams and capacity information. A student ranks exactly three different choices. A saved submission captures the current GPA for later audit, but final allocation requires the current user GPA to be present.

## 9.4 Allocation prerequisites

- The round must be `CLOSED`.
- At least one preference must exist.
- Every active ECE Year 3 student must submit.
- Every submitted student must have a numeric GPA.
- Total stream capacity must be at least the number of submitted students.
- Capacity must be supplied exactly once for all four streams.

## 9.5 Allocation algorithm

```text
1. Sort submissions by:
   a. GPA descending
   b. submission time ascending
   c. student database identifier ascending

2. For each student in that order:
   a. assign the first ranked choice with remaining capacity
   b. if all three ranked choices are full, choose an unranked stream
      with the most remaining seats
   c. resolve equal remaining capacity using the configured stream order
   d. decrement the selected stream capacity
   e. store allocation rank 1, 2, 3, or 4 and the GPA snapshot

3. Mark every preference ALLOCATED.
4. Mark the round ALLOCATED and record allocator and date.
5. Display the result to each student.
```

## 9.6 Fairness and audit notes

The deterministic tie-breakers ensure that the same dataset produces the same allocation. GPA is the primary priority, while submission time is used only when GPA is equal. Allocation rank 4 indicates that none of the three ranked streams had capacity and the student received the best available unranked stream. Any future policy change should be approved and documented before a new round.

# 10. Database Design

## 10.1 Database overview

MongoDB stores application data, while Mongoose defines schemas, references, validation, timestamps, and indexes. Documents use ObjectId references to preserve clear domain relationships. The default database name is `instructor_evaluations`.

## 10.2 Relationship overview

```text
Department --< User
Department --< Course >-- Semester
User(INSTRUCTOR) --< InstructorAssignment >-- Course
User(INSTRUCTOR) -- one CoursePreference per Semester --< ranked Course choices
InstructorAssignment --< enrolledStudents(User)
InstructorAssignment --< peerEvaluators(User)
InstructorAssignment --< Evaluation >-- EvaluationTemplate
User(INSTRUCTOR) --< Report >-- Semester
Department + Semester -- one CourseAndExamCommittee -- three instructors
Department + Semester --< Schedule
Department + Semester -- one StreamSelectionRound --< StreamPreference
User --< Notification
User --< AuditLog
```

## 10.3 Collection reference

| Model/collection | Purpose | Important constraints |
|---|---|---|
| User | Authentication and academic identity | Unique MTU email; primary role; committee duty; hidden password hash |
| Department | Academic department | Unique uppercase code; optional HOD reference |
| Semester | Academic and evaluation period | Dates, evaluation window, and status lifecycle |
| Course | Semester course | Unique code per semester; department, year, optional stream |
| InstructorAssignment | Teaching and evaluation eligibility | Unique instructor/course/semester; students, peers, status |
| CoursePreference | Ranked instructor course choices and confirmation | Unique instructor/semester; one confirmed owner per course/semester |
| Evaluation | Shared evaluation fields | Instructor, semester, department, template, responses, comment |
| StudentEvaluation | Student discriminator | Unique student/assignment; student hidden by default |
| PeerEvaluation | Peer discriminator | Unique evaluator/assignment |
| HodEvaluation | HOD discriminator | Unique evaluator/assignment |
| EvaluationTemplate | Questionnaire versions | Unique kind/version; active flag; ordered categories |
| Report | Aggregated instructor result | Unique instructor/semester; draft/published; final summary |
| ExamCommittee | Unified Course and Exam Committee record | Exactly three instructors; unique department/semester; chair |
| Notification | Staff communication | User/department/university audience; report notification unique |
| Schedule | Department class/exam schedule | Type/status indexes; optional PDF/CSV buffer |
| StreamSelectionRound | ECE allocation configuration | Unique department/semester; four capacities |
| StreamPreference | Student choices and result | Unique round/student; exactly three choices |
| AuditLog | Successful mutation history | Action, actor, IP, agent, method, path |
| University | Optional institution/campus metadata | Unique code; campus list; active flag |
| Student | Optional extended student record | One-to-one user; registered courses |

## 10.4 User fields

| Field | Type | Notes |
|---|---|---|
| firstName, lastName | String | Required and trimmed |
| email | String | Required, unique, normalized, MTU domain only |
| passwordHash | String | bcrypt cost 12; excluded by default |
| role | Enum | Super Admin, HOD, Instructor, or Student |
| committeeRoles | Array | Zero or one unified committee duty |
| department | ObjectId | Required by API for non-admin roles |
| studentNumber | String | Required by API for students |
| yearLevel | Number | 2-5, student only |
| gpa | Number | 0-4, student only |
| academicStream | Enum | ECE instructor and Year 4-5 student stream |
| employeeNumber | String | Instructor/staff identifier |
| phone | String | Optional self-editable contact number; maximum 30 characters |
| bio | String | Optional self-editable biography; maximum 500 characters |
| profilePhoto | Embedded object | Private image buffer, validated content type/name, and update timestamp |
| isEmailVerified | Boolean | Imported accounts set true |
| isActive | Boolean | Disabled accounts cannot authenticate |
| tokenVersion | Number | Refresh-session invalidation counter |
| resetPasswordTokenHash | String | Reserved reset token hash |
| resetPasswordExpiresAt | Date | Reset token expiry, currently 30 minutes |

## 10.5 Evaluation response storage

Each response stores category name, exact question text, optional score from 1 to 5, and `notApplicable`. Storing the question text preserves historical meaning when a later template changes. The evaluation also records instructor, course, assignment, semester, department, template, optional comment, and submission date.

## 10.6 Index and integrity strategy

Unique indexes enforce course code per semester, assignment identity, one student response per assignment, one peer/HOD response per evaluator-target-semester, one report per instructor-semester, one committee per department-semester, one stream round per department-semester, one preference per round-student, one course preference per instructor-semester, and one confirmed course owner per semester.

The `audit:data` command checks MTU email domains, ECE year/stream profiles, instructor streams, assignment department/year/stream relationships, unified committee accounts, exactly three valid committee members, schedules, and selection-round capacity summaries.

# 11. REST API Reference

## 11.1 General conventions

- Default API origin: `http://localhost:5000`; JSON prefix: `/api`.
- Protected requests require `Authorization: Bearer <accessToken>`.
- JSON bodies use `application/json`; uploads use `multipart/form-data`.
- MongoDB identifiers are 24-character hexadecimal ObjectId strings.
- Errors normally contain a `message` field.

## 11.2 Authentication endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/health` | Public | API/database health; 200 connected or 503 degraded |
| POST `/api/auth/login` | Public | Authenticate and return user plus access/refresh tokens |
| POST `/api/auth/refresh` | Refresh token | Issue a new valid token pair |
| POST `/api/auth/forgot-password` | Public | Create a hashed, single-use reset token with a 30-minute expiry and return a non-enumerating response |
| POST `/api/auth/reset-password` | Public | Validate an unexpired reset token, replace the password, invalidate old sessions, and consume the token |
| POST `/api/auth/register` | Admin, HOD, Committee | Create account within department policy |
| POST `/api/auth/change-password` | Authenticated | Confirm current password, change it, invalidate old sessions, and issue a fresh token pair |
| GET `/api/auth/me` | Authenticated | Return current public user profile |
| PUT `/api/auth/profile` | Authenticated | Edit safe self-profile fields |
| POST `/api/auth/profile/photo` | Authenticated | Upload/replace validated photo up to 2 MB |
| DELETE `/api/auth/profile/photo` | Authenticated | Remove own profile photo |
| GET `/api/auth/profile/photo/:userId` | Authenticated | Retrieve an active user profile photo |

```json
{ email: instructor.ada@mtu.edu.et, password: Password123! }
```

## 11.3 Catalog and account endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/departments` | Authenticated | List departments and HOD |
| POST `/api/departments` | Super Admin | Create department |
| PUT `/api/departments/:id` | Super Admin | Update department |
| GET `/api/semesters` | Authenticated | List semesters |
| POST `/api/semesters` | Admin, HOD | Create semester |
| PUT `/api/semesters/:id` | Admin, HOD | Update semester/evaluation window |
| GET `/api/courses` | Authenticated | List role-scoped courses |
| POST `/api/courses` | Admin, HOD, Committee | Create valid course |
| PUT `/api/courses/:id` | Admin, HOD, Committee | Update permitted course |
| GET `/api/users` | Admin, HOD, Committee | List scoped users; optional role query |
| PUT `/api/users/:id` | Admin, HOD, Committee | Update permitted user |
| GET `/api/assignments` | Authenticated | List scoped assignments |
| POST `/api/assignments` | Admin, HOD, Committee | Create a new course-to-instructor assignment |
| PUT `/api/assignments/:id` | Admin, HOD, Committee | Validate and update assignment |
| GET `/api/course-preferences/instructor` | Instructor | List own preferences, department courses, and occupied courses |
| POST `/api/course-preferences` | Instructor | Submit/update one to three ranked choices |
| GET `/api/course-preferences/manage` | HOD, Committee | Review scoped submissions and course occupancy |
| POST `/api/course-preferences/:id/confirm` | HOD, Committee | Confirm one submitted choice, create assignment, notify instructor |
| GET `/api/exam-committees` | HOD | List unified department committees |
| POST `/api/exam-committees` | HOD | Appoint/update exactly three members |
| POST `/api/exam-committee` | HOD | Compatibility alias |

> The internal model and compatibility route retain the historical ExamCommittee name. The UI and authorization model use one unified Course and Exam Committee.

## 11.4 Evaluation endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/evaluation-templates/:kind` | Authenticated | Latest active Student, Peer, or HOD template |
| GET `/api/evaluations/targets/:kind` | Instructor/HOD | Open assigned Peer/HOD targets |
| POST `/api/evaluations/student` | Student | Submit an authenticated, enrolled assignment evaluation |
| POST `/api/evaluations/peer` | Instructor | Submit assigned peer evaluation |
| POST `/api/evaluations/hod` | HOD | Submit department supervisor evaluation |
| GET `/api/evaluations/student/status` | Student | List evaluable assignments/submission state |

Each evaluation response contains the exact category and question from the active template, a score from 1 to 5 or `notApplicable: true`, and an optional submission-level comment.

## 11.5 Dashboard and notification endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/dashboard/summary` | Admin, HOD, Committee | Totals, completion, averages, notifications |
| GET `/api/dashboard/instructor` | Instructor | Own courses, students, peer tasks, report, notices |
| GET `/api/dashboard/instructor/:instructorId` | Admin, HOD | View permitted instructor data |
| POST `/api/notifications` | Admin, HOD, Committee | Publish permitted notification |

## 11.6 Report endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/reports/instructor/:instructorId` | Scoped staff/own instructor | Build and return report |
| GET `/api/reports/instructor/:instructorId/pdf` | Same | Download PDF |
| GET `/api/reports/instructor/:instructorId/excel` | Same | Download UTF-8 CSV |
| POST `/api/reports/instructor/:instructorId/publish` | HOD, Committee | Publish final summary |
| GET `/api/reports/department/:departmentId` | Admin, scoped HOD | Department summary |

## 11.7 Stream-selection endpoints

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/stream-selection/student` | Student | Eligibility, round, choices, result |
| POST `/api/stream-selection/preferences` | Student | Submit three ranked choices |
| GET `/api/stream-selection/manage` | HOD, Committee | Rounds, students, preferences |
| POST `/api/stream-selection/rounds` | HOD, Committee | Save capacities and status |
| POST `/api/stream-selection/rounds/:id/allocate` | HOD, Committee | Run GPA-priority allocation |

## 11.8 Import and schedule endpoints

| Method and path | Access | Purpose |
|---|---|---|
| POST `/api/uploads/users` | Admin, HOD, Committee | Import Student/Instructor CSV or PDF |
| POST `/api/uploads/students` | Admin, HOD, Committee | Student-only compatibility import |
| GET `/api/schedules` | Authenticated | List visible schedules |
| POST `/api/schedules` | Admin, HOD, Committee | Create schedule and optional file |
| PUT `/api/schedules/:id` | Admin, HOD, Committee | Update schedule/file |
| GET `/api/schedules/:id/file` | Authenticated/scoped | Download permitted attachment |

## 11.9 Common status codes

| Code | Meaning |
|---|---|
| 200 | Successful read/update or existing upsert |
| 201 | Resource created or submission/import completed |
| 400 | Invalid input, relation, profile, capacity, date, or file |
| 401 | Missing, invalid, or expired session |
| 403 | Outside role, duty, department, enrollment, or task |
| 404 | Resource absent or hidden outside scope |
| 409 | Duplicate, already submitted/used, or unavailable workflow |
| 429 | Request rate exceeded |
| 500 | Unexpected server error |
| 503 | Database disconnected at health endpoint |

# 12. User Interface and User Guide

## 12.1 Login page

The login page presents role shortcuts for Admin, Student, Instructor, HOD, and Course and Exam Committee. A shortcut fills the demonstration email and password; it does not change the role of an account. Authorization always comes from the database user loaded by the backend.

To sign in:

1. Open the frontend URL, normally `http://localhost:5173`.
2. Select a role shortcut or type another registered MTU email.
3. Enter the account password.
4. Select **Sign in**.
5. If authentication succeeds, the role-aware dashboard opens.

If login fails, confirm the backend and database are running, the email ends in `@mtu.edu.et`, and the account is active. Demonstration accounts use `Password123!` only in development and must be changed in real use.

A user who cannot sign in can select **Forgot your password?** below the sign-in form. Enter the MTU email, then follow the institutional message link or paste the provided reset token and choose a new password of at least eight characters. Reset tokens expire after 30 minutes and are single-use. In development/test, the API displays the token because SMTP is not configured; production never returns it in the response.

## 12.2 Shared navigation

**My Profile** is available to Super Admin, HOD, Instructor, Student, and Course and Exam Committee accounts. Users can also open it by selecting their avatar in the dashboard header. The page supports safe personal-field editing, authenticated photo upload/replacement/removal, and password change after confirming the current password; institutional identity and academic fields remain administrator-controlled. A successful password change stores the newly issued access and refresh tokens so the current browser session continues securely.

The sidebar includes only pages allowed for the signed-in account. It also displays MongoDB connection status, a light/dark mode switch, and a **Sign out** button. Signing out removes access and refresh tokens from browser storage and works from every dashboard page because the sidebar wraps all pages.

## 12.3 Super Admin guide

Recommended first-use sequence:

1. Open **Departments** and create all academic units with name, code, and faculty.
2. Register HOD accounts from **Users** and assign each to a department.
3. Return to **Departments** and link the appropriate HOD.
4. Open **Semesters** and define academic/evaluation dates.
5. Register users manually or import Student/Instructor records.
6. Review **Courses** and **Assignments** across departments.
7. Use **Schedules** to publish institutionally prepared department schedules.
8. Use the dashboard notification composer for university, department, or direct staff announcements.
9. Use **Reports** to review permitted instructor and department results.

Super Admin cannot submit instructor evaluations or appoint department committees. Committee appointment belongs to the HOD.

## 12.4 HOD guide

1. Verify the dashboard shows only the HOD's department totals and admin notifications.
2. Create or update semesters and evaluation windows as authorized.
3. Register/import department students and instructors.
4. Create semester courses and validate year/stream information.
5. Assign each instructor for evaluation by selecting the course and a whole student class (or an individual exception roster), then add peer reviewers.
6. Appoint exactly three instructors in **Course and Exam Committee** and choose the chair.
7. Set verified assignments to `PUBLISHED`.
8. Complete HOD evaluation forms for eligible instructors.
9. Review reports, write the final summary, and publish it to the instructor.
10. Prepare schedules, send department notifications, and manage ECE stream rounds where applicable.

## 12.5 Course and Exam Committee guide

Committee members sign in using their instructor accounts. The header displays both `INSTRUCTOR` and `COURSE_EXAM_COMMITTEE`. Their dashboard combines department management information, assigned peer tasks, and department notifications.

Shared committee duties include:

- Assign department courses to instructors, then configure those teaching assignments separately for evaluation.
- Submit their own course preferences and confirm available choices for department instructors.
- Read department instructor and student rosters when building assignments; account management remains with the HOD and Super Admin.
- Review and publish permitted instructor reports.
- Create and publish class/examination schedules.
- Prepare and run ECE stream selection.
- Send department or direct staff notifications.

Committee members cannot appoint themselves, create Super Admin/HOD accounts, operate in another department, or submit the HOD evaluation instrument.

## 12.6 Instructor guide

The dashboard shows the instructor's own information only. Review the consolidated **My students and streams** section, then inspect each course card. A student who appears in more than one assigned course appears once in the consolidated list with all course codes.

For course preference:

1. Open **Course Preferences** and select the intended semester.
2. Rank one, two, or three different available department courses.
3. Submit or update the choices while the preference remains `SUBMITTED`.
4. After HOD/committee confirmation, read the direct notification and reopen the page to see the assigned course.
For peer evaluation:

1. Open the dashboard during the evaluation window.
2. Locate **Assigned peer evaluation tasks**.
3. Select an available target; unavailable, completed, or unassigned targets are not shown.
4. Answer every question or select NA where permitted.
5. Add an optional professional comment and submit once.

The final report area displays live source/category information and the signed final summary after publication. Schedules and notifications are available from their corresponding dashboard pages.

## 12.7 Student guide

For instructor evaluation:

1. Sign in and open the dashboard during an open evaluation window.
2. Select an assigned course that is not already submitted.
3. Score each question from Very Low to Very High or choose NA.
4. Add an optional comment.
5. Review and submit. The same course assignment cannot be submitted twice.

For ECE stream selection:

1. The student must be active, in ECE, and currently Year 3.
2. Open **Stream Selection** while the round is `OPEN`.
3. Rank three different streams as first, second, and third choice.
4. Submit before the HOD/committee closes the round.
5. After allocation, reopen the page to see the assigned stream and allocation rank.

Students can also view published department class/exam schedules.

## 12.8 Status terminology

| Area | Status | Meaning |
|---|---|---|
| Semester | DRAFT | Setup is incomplete |
| Semester | SCHEDULED | Prepared for a future period |
| Semester | OPEN | Evaluation workflows may operate within dates |
| Semester | CLOSED | Evaluation submissions unavailable |
| Semester | ARCHIVED | Historical semester |
| Assignment | DRAFT | Not yet operational |
| Assignment | VERIFIED | Academic data reviewed |
| Assignment | PUBLISHED | Eligible for evaluation when semester is open |
| Report | DRAFT | Generated but not officially published |
| Report | PUBLISHED | Final summary visible to instructor |
| Schedule | DRAFT | Manager-only preview |
| Schedule | PUBLISHED | Visible to department students/instructors |
| Stream round | DRAFT | Setup in progress |
| Stream round | OPEN | Students may submit preferences |
| Stream round | CLOSED | Submissions closed; allocation may run |
| Stream round | ALLOCATED | Final results recorded |

# 13. Data Import, Export, and Schedules

## 13.1 Import permissions and limits

Super Admin can import into any department. HOD and committee members can import only Student or Instructor accounts into their own department. Files may contain no more than 1,000 records. The upload limit is 5 MB at the multipart layer.

Imports validate all rows before database writes begin. Existing accounts with the same role are updated; existing accounts with a different role cause HTTP 409. An omitted password preserves an existing password or assigns `Password123!` to a new account.

## 13.2 Student CSV format

```csv
firstName,lastName,email,studentNumber,yearLevel,gpa,academicStream,password
Abel,Tesfaye,abel.tesfaye@mtu.edu.et,ECE-2026-001,3,3.72,,Password123!
Marta,Kebede,marta.kebede@mtu.edu.et,ECE-2026-002,4,3.58,COMPUTER_ENGINEERING,Password123!
```

The department may be selected in the form or included as a `department` column containing the department ObjectId. Year must be an integer from 2 to 5 and GPA must be 0 to 4. Year 2-3 ECE students leave stream blank; Year 4-5 students provide a supported stream constant.

## 13.3 Instructor CSV format

```csv
firstName,lastName,email,employeeNumber,academicStream,password
Sara,Mulu,sara.mulu@mtu.edu.et,INS-ECE-101,POWER_ENGINEERING,Password123!
```

Every ECE instructor must provide one academic stream. Instructor imports do not accept student year or GPA.

## 13.4 PDF import format

PDF import works only when text is selectable/readable. It accepts a comma-, pipe-, or tab-separated table beginning with a header containing first name and email, or repeated labeled records:

```text
First Name: Abel
Last Name: Tesfaye
Email: abel.tesfaye@mtu.edu.et
Student Number: ECE-2026-001
Year Level: 3
GPA: 3.72

First Name: Marta
Last Name: Kebede
Email: marta.kebede@mtu.edu.et
Student Number: ECE-2026-002
Year Level: 4
GPA: 3.58
Academic Stream: COMPUTER_ENGINEERING
```

Scanned image-only or encrypted PDFs are rejected. Run OCR externally, verify the extracted data, then import the resulting readable document.

## 13.5 Accepted aliases

The parser recognizes common header variants such as `First`, `First Name`, `Email Address`, `Student ID`, `Employee ID`, `Staff ID`, `Year`, `Stream`, and `Branch`. Headers are normalized without spaces, punctuation, or case differences.

## 13.6 Import safety checks

- Required names, email, department, and role-specific identifier.
- MTU email domain and duplicate email detection inside the file.
- Correct account role when updating.
- Department ownership for non-admin importers.
- Password minimum of eight characters when provided.
- ECE year/stream rules and numeric GPA range.
- Maximum 1,000 records per import.

## 13.7 Report export

Instructor report PDF includes instructor, department, semester, overall score, source scores, category scores, final summary when published, and recommendations. The `/excel` endpoint returns a UTF-8 CSV file containing the same summary values; this opens in spreadsheet software but is not a native `.xlsx` workbook.

## 13.8 Schedule file behavior

Schedule attachments are stored in MongoDB as a buffer with original filename and content type. Accepted attachments are `.pdf` with `application/pdf` or `.csv` with a permitted CSV/text MIME type. Filename line breaks and quotes are removed before download headers are created. A schedule may omit the file only when a non-empty text description is provided.

# 14. Installation and Local Development

## 14.1 Prerequisites

- Node.js 20.19 or newer; the Docker images use Node.js 22.
- npm, supplied with Node.js.
- MongoDB 7 or a reachable MongoDB-compatible service for a conventional setup.
- Docker Engine with Docker Compose for the containerized setup.

MongoDB is optional for simple local development because the backend can launch a persistent embedded instance through `mongodb-memory-server`. This fallback is not used in production.

## 14.2 Repository setup

From the repository root:

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` and `npm.cmd` if execution policy blocks `npm.ps1`. The root package is an npm workspace containing `backend` and `frontend`, so the root install covers both. The ZIP files in the repository are distribution artifacts and are not runtime components.

## 14.3 Development URLs

| Service | Default address | Purpose |
|---|---|---|
| React frontend | `http://localhost:5173` | Browser interface |
| Backend health | `http://localhost:5000/api/health` | API/database readiness |
| API base | `http://localhost:5000/api` | REST endpoints |
| Local MongoDB | `mongodb://127.0.0.1:27017/instructor_evaluations` | Optional external database |

Vite proxies `/api` to the backend during development. For a separately hosted frontend, set `VITE_API_URL` at build time.

## 14.4 Environment configuration

Copy `.env.example` to `.env` and replace placeholder secrets before any shared deployment.

| Variable | Default/example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode; use `production` in production |
| `PORT` | `5000` | Backend port |
| `MONGO_URI` | blank | External MongoDB connection string |
| `MONGO_MEMORY_FALLBACK` | `true` | Allows embedded MongoDB outside production |
| `MONGO_DATA_PATH` | `.data/mongodb` | Embedded database directory |
| `SEED_DEMO_DATA` | `true` | Creates demo data at development startup |
| `JWT_ACCESS_SECRET` | placeholder | Access-token signing secret |
| `JWT_REFRESH_SECRET` | placeholder | Refresh-token signing secret |
| `ACCESS_TOKEN_TTL` | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | Refresh-token lifetime |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `SMTP_*`, `MAIL_FROM` | blank/placeholders | Reserved mail settings; sending is not implemented |
| `VITE_API_URL` | `/api` | Frontend build-time API base |

If `MONGO_URI` is blank in development and fallback is enabled, data is stored under `.data/mongodb`. In production, a valid `MONGO_URI` is mandatory.

## 14.5 Commands

| Command | Function |
|---|---|
| `npm run dev` | Starts API and frontend development servers |
| `npm run build` | Builds the frontend |
| `npm test` | Runs backend tests |
| `npm run seed` | Creates main demonstration data |
| `npm run seed:templates` | Creates or updates evaluation templates |
| `npm run seed:samples` | Creates general samples |
| `npm run seed:ece` | Idempotently creates the ECE sample dataset |
| `npm run audit:data` | Runs the data-audit utility |
| `npm run migrate:emails` | Migrates legacy email domains |
| `npm run migrate:committees` | Migrates the unified committee role |
| `npm run docs:pdf` | Generates this documentation as PDF |

Back up real data before any migration. A normal change should finish with `npm test`, `npm run build`, and a health check.

# 15. Docker and Production Deployment

## 15.1 Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Compose starts MongoDB 7, Express on port 5000, and an Nginx-served frontend on port 5173. MongoDB uses the named `mongo_data` volume. The API receives `mongodb://mongo:27017/instructor_evaluations` and disables embedded fallback.

Verify with `docker compose ps` and `curl http://localhost:5000/api/health`. Stop with `docker compose down`; do not add `--volumes` unless deleting the database is intentional and a verified backup exists.

## 15.2 Recommended production topology

```text
Browser
  |
  v
HTTPS reverse proxy / load balancer
  |-- /       -> frontend static service
  `-- /api/*  -> Express API -> protected MongoDB
```

Use TLS at the edge, keep MongoDB private, and expose only HTTPS. If the frontend and API have different origins, configure exact CORS and frontend API values.

## 15.3 Production checklist

- Set `NODE_ENV=production` and `SEED_DEMO_DATA=false`.
- Supply an authenticated, durable `MONGO_URI`; never use embedded MongoDB.
- Generate independent high-entropy JWT secrets.
- Build the frontend with the correct `VITE_API_URL`.
- Configure HTTPS, reverse-proxy routing/limits, monitoring, and log retention.
- Enable protected database backups and test restoration.
- Remove or disable demonstration accounts and default passwords.
- Run tests/build from the exact release commit and smoke-test every role.
- Document rollback and retain the previous deployable image.

## 15.4 Health and shutdown

`GET /api/health` returns 200 when Mongoose is connected and 503 when degraded. The response includes database name, host, and embedded status; restrict public exposure if this metadata is sensitive. On `SIGINT` or `SIGTERM`, the server closes HTTP, disconnects Mongoose, and stops the embedded database when used.

## 15.5 Deployment limitation

The supplied Compose file is for demonstration and local integration, not a hardened production stack. It publishes MongoDB to the host, has no TLS or container health checks, and the default Nginx image does not proxy `/api`. Production requires infrastructure-specific configuration for these items.

# 16. Security, Privacy, and Auditability

## 16.1 Implemented controls

- bcrypt password hashing and separately signed access/refresh JWTs.
- Bearer authentication that reloads and checks the active user.
- Backend role, delegated committee, and department authorization.
- Zod validation on schema-bound routes.
- Helmet, exact-origin CORS, Mongo query sanitization, and rate limiting.
- 1 MB JSON and 5 MB upload limits.
- Authenticated enrollment authorization and database-enforced duplicate protection.
- Audit records for successful sensitive actions.
- Reduced production error details.

## 16.2 Session posture

The browser stores both tokens in `localStorage`; Axios refreshes once after a protected request returns 401. Password change and reset increment `tokenVersion`, invalidating older access and refresh tokens. An authenticated password change returns and stores a fresh token pair, while account deactivation blocks later authenticated requests.

Local-storage tokens are exposed if malicious script runs in the origin. A higher-assurance release should use a Secure, HttpOnly, SameSite refresh cookie, short-lived in-memory access tokens, rotation, logout/revocation, and a tested Content Security Policy.

## 16.3 Password recovery and delivery limitation

The forgot-password endpoint uses a non-enumerating response and stores only a SHA-256 hash of a cryptographically random token valid for 30 minutes. The reset endpoint accepts an unexpired token once, replaces the password, clears the token fields, and increments `tokenVersion` to invalidate older sessions. Invalid, expired, and previously used tokens are rejected.

SMTP delivery is not implemented in this repository. Development and test responses expose the raw reset token so developers can verify the workflow locally. Production responses never expose the token; institutional deployment must connect the generated token to an approved email or messaging service and send a frontend link such as `/?resetToken=<token>`.

## 16.4 Confidentiality and audit limits

Student records retain evaluator references for eligibility and duplicate prevention. The system is not anonymous to privileged database operators. Institutional policy must define raw-data access, publication, retention, and small-cohort safeguards.

Audit writes occur after a successful response and failures are intentionally swallowed. Logs are normal MongoDB documents, not tamper-evident. Production governance should forward events to protected append-only storage and monitor failures.

## 16.5 Required operating practices

- Use named least-privilege production/database accounts and TLS.
- Never commit `.env`, dumps, real imports, tokens, keys, or confidential exports.
- Remove default passwords and avoid real personal data in development.
- Encrypt backups and test restoration.
- Define retention/deletion policy and raw-report access.
- Test invalid/expired tokens, disabled users, cross-department IDs, duplicates, reused keys, malicious imports, and unauthorized report access.
# 17. Testing and Quality Assurance

## 17.1 Automated checks

```bash
npm test
npm run build
```

Backend tests use Jest, Supertest, and `mongodb-memory-server`, running serially under `NODE_ENV=test`. The frontend currently has no unit-test script; its production build is the automated compile/bundle check.

## 17.2 Covered behavior

| Test file | Primary coverage |
|---|---|
| `auth.test.js` | Login, tokens, invalid refresh, disabled users |
| `password.test.js` | Authenticated change, fresh sessions, old-session invalidation, generic recovery responses, expiry, and single-use reset tokens |
| `profile.test.js` | All-role profile editing, controlled fields, photo validation/access/removal/size limit |
| `academicStreamRules.test.js` | ECE profiles and stream-matched assignments |
| `catalogPermissions.test.js` | Department scoping, dashboards, email domain, committee rights |
| `evaluationAuthorization.test.js` | Peer targets, templates, HOD scoping, published summaries |
| `schedule.test.js` | Manager rights, publication visibility, files |
| `streamSelection.test.js` | Preferences, GPA order, capacity, fallback |
| `uploadSecurity.test.js` | Cross-department imports, domain, passwords, CSV/PDF |
| `score.test.js` | Weighting, N/A values, normalization |
| `eceSampleData.test.js` | Idempotent ECE data and committee membership |

## 17.3 Manual role acceptance test

1. As Super Admin, review departments/users and university totals.
2. As HOD, create a semester and appoint exactly three department instructors, including one chair.
3. As HOD/committee, create courses, assign instructors for evaluation to whole student classes, add peer tasks, and create a schedule.
4. Open the semester and publish an assignment inside its evaluation window.
5. Confirm that only authenticated students in the assigned class can evaluate and that duplicate submissions are rejected.
6. Submit student, assigned-peer, and HOD evaluations; reject duplicates.
7. Generate a report and compare its weights with a hand calculation.
8. Publish a summary; confirm the subject instructor sees it and another instructor does not.
9. Submit three unique ECE Year 3 stream choices, close the round, and allocate.
10. Confirm descending GPA order, capacity limits, and schedule department visibility.
11. Change a signed-in user's password, verify the current session continues with new tokens, and verify the old password and token pair fail.
12. Request a reset token, prove invalid/expired/reused tokens fail, then reset and sign in with the new password.
13. Check keyboard use, narrow screens, dark mode, empty states, validation, and session expiry.

## 17.4 Score verification

For student 4.20, peer 3.80, and HOD 4.00:

```text
(4.20 x 0.40) + (3.80 x 0.30) + (4.00 x 0.30) = 4.02
```

If peer is absent, its fixed 30% contribution is zero:

```text
(4.20 x 0.40) + (0.00 x 0.30) + (4.00 x 0.30) = 2.88
```

Results are rounded to two decimals. Not-applicable responses are excluded from their evaluation average.

## 17.5 Defect reporting

Record release/commit, environment, role/department, sanitized IDs, exact steps, expected/actual behavior, HTTP response, timestamp, and impact. Never include passwords, JWTs, or confidential comments.

# 18. Backup, Recovery, and Maintenance

## 18.1 Protected data

MongoDB holds users, catalog, assignments, templates/responses, reports, notifications, stream choices/rounds, audit logs, and schedule attachments. Also protect source, private environment configuration, reverse-proxy configuration, images, and this documentation.

## 18.2 Backup and restore

Use provider snapshots or MongoDB Database Tools. Representative commands are:

```bash
mongodump --uri="<production-mongodb-uri>" --archive="uamipes-YYYY-MM-DD.archive" --gzip
mongorestore --uri="<isolated-mongodb-uri>" --archive="uamipes-YYYY-MM-DD.archive" --gzip --drop
```

Keep credentials out of shell history where possible. Encrypt and checksum backups, identify their application/database version, store them separately, and restore-test in isolation. A Compose volume is persistence, not backup.

Stop the API before copying a local `.data/mongodb` directory; copying live WiredTiger files is not a supported production backup method.

After restoration, check health, critical collection counts, login, a historical report, a schedule file, and representative audit/evaluation records. Record recovery time and manual steps.

## 18.3 Maintenance schedule

| Frequency | Activity |
|---|---|
| Daily | Availability, errors, capacity, and suspicious login/rate-limit patterns |
| Weekly | Backup freshness, audit/log anomalies, departed/disabled accounts |
| Monthly | Restore test, dependencies, storage/index growth, role assignments |
| Each semester | Close/archive prior term; verify templates, dates, committee, keys, reports |
| Each release | Tests/build, backup, migrations, deploy, role smoke test, rollback artifact |
| Annually | Retention, privacy, disaster recovery, secrets, access, roadmap |

## 18.4 Safe update procedure

1. Identify schema, environment, and dependency changes.
2. Back up and verify the database.
3. Test against a restored or representative non-production copy.
4. Run all automated checks and manual changed-workflow tests.
5. Schedule downtime for incompatible migrations.
6. Deploy versioned API/frontend artifacts and run required migrations.
7. Verify health, authentication, changed workflows, and logs.
8. Roll back application images on failure; restore data only when necessary.

Review `npm outdated` and `npm audit`, but do not apply major upgrades blindly. Test authentication, PDF handling, uploads, charts, and MongoDB behavior after dependency changes.

# 19. Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| API says `MONGO_URI` is required | Production/fallback-disabled mode without URI | Supply a valid URI and check network/authentication |
| Unexpected embedded database | External MongoDB is unreachable | Start MongoDB or correct `MONGO_URI` |
| Health returns 503 | Mongoose disconnected | Check DB availability, URI, credentials, TLS, and logs |
| Browser CORS/network failure | Origin or API URL mismatch | Set exact `CLIENT_ORIGIN`; rebuild with correct `VITE_API_URL` |
| Nginx returns 404/page for `/api` | Production proxy absent | Configure proxy or absolute API URL |
| Seed login fails | Seed absent, user disabled, or password changed | Seed development data and inspect user status |
| Session repeatedly expires | Secrets changed, token expired, user disabled/version changed | Keep secrets stable and sign in again |
| Evaluation target missing | Scope, status, dates, enrollment, or peer task | Inspect semester/assignment and relationships |
| Evaluation key rejected | Wrong target, expired, or used | Generate a fresh eligible key |
| Report is zero/incomplete | No evaluation for selected/latest semester | Select intended semester and confirm submissions |
| Committee rights absent | Appointment missing/inactive or legacy data | Reappoint or run migration after backup |
| ECE assignment rejected | Stream/profile mismatch | Correct academic stream/year data |
| Allocation blocked | Open round, missing GPA/preferences, low capacity | Close/fix prerequisites and capacity |
| Import fails | Format/MIME, scanned PDF, bad row/domain/role, row limit | Use template, OCR, and correct all rows |
| Schedule rejected | Over 5 MB or invalid extension/MIME | Use permitted PDF/CSV or text description |
| `npm.ps1` blocked | PowerShell execution policy | Use `npm.cmd` or approved policy |
| Documentation PDF cannot find `pdfkit` | Workspaces not installed | Run root `npm install`, then `npm run docs:pdf` |

Preserve logs and affected IDs before restarting a production service. Never delete the MongoDB volume or `.data` directory as a troubleshooting shortcut.
# 20. Limitations and Future Development

## 20.1 Current limitations

- Password reset completion is implemented, but production email/SMS delivery is not connected.
- Tokens use browser local storage; cookie-based refresh sessions are stronger.
- There is no logout/revocation endpoint, refresh rotation, MFA, or SSO.
- Audit logs are best-effort MongoDB records, not immutable.
- Evaluations are not anonymous to privileged database operators.
- Schedule attachments live in MongoDB rather than object storage.
- Spreadsheet export is CSV, not native XLSX.
- PDF imports require readable text and perform no OCR.
- The UI has no automated unit or end-to-end test suite.
- Compose lacks production TLS, health checks, secrets, backups, and API proxying.
- Notifications are in-app only; SMTP settings do not send messages.
- Accessibility and high-volume performance are not formally certified.
- Stream allocation has no appeal, lottery tie-break, or manual override workflow.

## 20.2 Recommended roadmap

### Priority 1: institutional launch

- Connect password-reset token generation to institutional email delivery and monitored background jobs.
- Add HttpOnly refresh cookies, rotation/revocation, CSP, SSO/MFA, and managed secrets.
- Add protected audit export, privacy/retention rules, TLS, monitoring, and tested backups.

### Priority 2: reliability and administration

- Add frontend unit, accessibility, and end-to-end tests.
- Add background jobs for reports, notifications, and retention.
- Move attachments to protected object storage with malware scanning.
- Add native XLSX, pagination, filters, and audit dashboards.

### Priority 3: academic enhancement

- Add approved, versioned configuration for weights and thresholds.
- Add stream tie-break, appeal, and controlled override workflows.
- Integrate identity, student information, and learning systems.
- Add accreditation, multi-campus, mobile, sentiment, and governed AI insights.

# 21. Duplication and Publication Checklist

## 21.1 Authorized duplication

1. Record the source commit/release and preserve licensing, authorship, and approval requirements.
2. Create a private `.env` with unique secrets and endpoints.
3. Use `npm ci` to reproduce an unchanged lock-file release.
4. Provision a new database and independent backup destination.
5. Replace branding, domain rules, seeds, departments, streams, and templates only with authorization.
6. Search backend/frontend for `mtu.edu.et`, `Mizan-Tepi`, default passwords, ECE constants, URLs, and role labels.
7. Re-run tests after domain or academic-rule customization.
8. Use non-sensitive seed data outside production.
9. Complete security/production checklists and user acceptance testing.
10. Regenerate and independently review the PDF.
11. Publish a versioned release with migration, backup, rollback, and support notes.

## 21.2 Common customization locations

| Area | Representative location |
|---|---|
| Branding | `frontend/src/assets`, login/dashboard, `frontend/index.html` |
| Email domain | `backend/src/utils/email.js`, validators, imports, seeds, tests |
| Streams/rules | backend constants/profile utility and frontend stream utility |
| Instruments | template seeds and evaluation-template utility |
| Demo catalog | backend seeds and sample-data services |
| Deployment | `.env.example`, Dockerfiles, Compose, reverse proxy |
| Documentation | this file and `docs/generateDocumentationPdf.js` |

## 21.3 Documentation publication

```bash
npm run docs:pdf
```

Review cover, contents, tables, code, page numbers, wrapping, names, dates, credentials, URLs, limitations, and branding. Publish Markdown with source and distribute PDF through an approved channel.

Retain release evidence: commit, lock file, image digests, sanitized configuration inventory, test/build output, migration log, backup identifier, acceptance sign-off, limitations, rollback instructions, and the PDF.

# 22. Appendices

## Appendix A: Demonstration accounts

After the documented seed, these local demonstration accounts use `Password123!`:

| Account | Role |
|---|---|
| `admin@mtu.edu.et` | Super Admin |
| `hod.cs@mtu.edu.et` | HOD |
| `committee.cs@mtu.edu.et` | Committee duty |
| `instructor.ada@mtu.edu.et` | Instructor |
| `instructor.kojo@mtu.edu.et` | Instructor with committee duty |
| `student.alex@mtu.edu.et` | Student |

Remove, disable, or change all demonstration credentials before shared deployment.

## Appendix B: Primary source directories

```text
backend/src/config       Environment and database
backend/src/controllers Request/domain workflows
backend/src/middleware  Auth, validation, audit, errors
backend/src/models      Mongoose schemas and indexes
backend/src/routes      REST declarations
backend/src/services    Seeds and imports
backend/src/tests       Backend automated tests
backend/src/utils       Scores, tokens, templates, academic rules
frontend/src/api        Axios client
frontend/src/components Shared UI
frontend/src/context    Authentication/UI state
frontend/src/pages      Role-aware workflows
frontend/src/styles     Global/Tailwind styles
docs                    Markdown and PDF generator
```

## Appendix C: Go-live acceptance record

| Item | Value |
|---|---|
| Release/version | |
| Source commit | |
| Deployment date/environment | |
| Backup identifier | |
| Migration result | |
| Test/build result | |
| Security review owner | |
| Role acceptance-test owner | |
| Documentation reviewer | |
| Rollback artifact | |
| Final approval | |

## Appendix D: Document maintenance

Update this document whenever roles, permissions, endpoints, schemas, scoring, environment variables, deployment, security, or operating procedures change. Increment its version/date, regenerate the PDF, review it independently, and align it to the corresponding source commit.
