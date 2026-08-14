# University Academic Management and Instructor Performance Evaluation System

A production-oriented MERN system for academic administration, semester workflows, and instructor evaluation by students, peers, and department heads.

## Features

- JWT access and refresh token authentication
- Self-service student and instructor registration with department-aware HOD or Super Admin approval before sign-in
- Durable email and in-app notifications for evaluations, results, stream selection, course assignments, schedules, and HOD announcements
- Self-service password change plus single-use, 30-minute forgot/reset password tokens
- Self-service profiles for every role with editable name, phone, bio, and authenticated JPEG/PNG/WebP profile photos
- Role-based authorization for Super Admin, HOD, Instructor, and Student, with one HOD-appointed Course and Exam Committee duty for instructor accounts
- Separate course-to-instructor assignments and instructor evaluation assignments, with whole-class or individual student enrollment
- Instructor course preferences: rank up to three courses without first-come-first-served reservation, Course and Exam Committee recommendation, HOD finalization, safe semester reset, draft assignment creation, and direct instructor notification
- Student, peer, and HOD evaluation workflows with weighted scoring
- Year 3, second-semester ECE stream selection: three ranked choices, four stream capacities, GPA-priority allocation, and HOD/Course and Exam Committee controls
- Enrollment authorization and duplicate-submission prevention for student evaluations
- CSV and readable-text PDF imports for student and instructor account registration
- Department class/exam schedule preparation and PDF/CSV publishing by HOD and Course and Exam Committee members
- Responsive React dashboard with dark mode, role-aware navigation, charts, forms, skeletons, and toast notifications
- API validation, rate limiting, XSS and MongoDB query protection, helmet security headers, CORS, and cookie-aware CSRF posture
- Seed data for local demos
- Docker Compose for MongoDB, API, and frontend

## Quick Start

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000/api/health`

MongoDB: `mongodb://127.0.0.1:27017/instructor_evaluations`

Google OAuth placeholders are included in `.env.example`. Add the Google client ID and secret to your local `.env`, and register `http://localhost:5000/api/auth/google/callback` as an authorized redirect URI in Google Cloud. The secret must remain backend-only; `VITE_GOOGLE_CLIENT_ID` is safe for the browser.

Students and instructors can register from the sign-in page without choosing a password. A new account remains pending until its department HOD or a Super Admin approves it, then the system emails a single-use 24-hour link for the user to create a private password. The Users page marks setup as pending only until that link is used, then displays `Registered / setup completed`. On the user's first successful login, the system sends a one-time congratulations and welcome email. Super Admins manage every role across the university; HODs can approve, create, and update only instructors and students in their own department. Neither role assigns or sees user passwords; both can send a new setup/reset link within their permitted scope.

### Email Notifications

Copy the SMTP settings from `.env.example` into `.env` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` for the university mail provider. Set `SMTP_SECURE=true` when the provider requires implicit TLS (normally port 465); port 587 normally uses `false` and upgrades with STARTTLS.

Approved students and instructors receive email at their registered address when an evaluation is published, a final evaluation result is available, an ECE stream-selection round opens or allocation result is released, a course is assigned or finalized, a department schedule is published or updated, or an HOD/Super Admin sends a direct, department, or university announcement. Password-reset requests also send a secure, single-use link that expires after 30 minutes. Messages are retained in the in-app notification center where applicable. Task email delivery uses a persistent queue with retries, so a temporary SMTP outage does not cancel the academic action; pending messages are retried after the service restarts.

The seeded Super Admin uses `admin12345`; other seeded accounts use `Password123!`. Sign in with the username shown below (the part before `@mtu.edu.et`):

- `admin@mtu.edu.et` Super Admin
- `hod.cs@mtu.edu.et` Department Head
- `committee.cs@mtu.edu.et` Course and Exam Committee
- `instructor.ada@mtu.edu.et` Instructor
- `instructor.kojo@mtu.edu.et` Instructor / Course and Exam Committee
- `student.alex@mtu.edu.et` Student

### ECE Sample Dataset

Run the non-destructive, idempotent ECE seed at any time:

```bash
npm run seed:ece
```

It creates or updates the Electrical and Computer Engineering 2026/2027 dataset with ten students in each of Years 2, 3, 4, and 5, twelve year-matched courses and assignments, four sample instructors, peer-review assignments, and one three-instructor Course and Exam Committee per semester. Years 4-5 are divided among Electronics Communication Engineering, Computer Engineering, Power Engineering, and Control Engineering; every ECE instructor also belongs to one of these streams. Year 3 students receive sample GPA values and an open Second Semester stream-selection round with capacities of 3, 3, 2, and 2. Sample ECE accounts use password `Password123!`.

### Student and Instructor Imports

Super Admins and HODs can import accounts from the Users page. HOD imports are restricted to instructors and students in the HOD's own department. Upload a CSV or readable-text PDF of up to 5 MB; downloadable templates are provided in the form.

Student columns are `firstName,lastName,email,studentNumber,yearLevel,gpa,academicStream`. Instructor columns are `firstName,lastName,email,employeeNumber,academicStream`. A `department` column may be included; otherwise the department selected in the form is used. The MTU email is the login username. New imported accounts receive a one-time password setup link; importing an existing account never changes its password.

All user accounts must use the institutional `@mtu.edu.et` email domain. To update accounts created with an older domain, run `npm run migrate:emails` once.

PDFs can use the same comma/pipe-separated table format or repeated labeled fields such as `First Name:`, `Last Name:`, `Email:`, and `Student Number:`/`Employee Number:`. Scanned image-only PDFs must first be converted with OCR.

## Docker

```bash
cp .env.example .env
# Set NODE_ENV=production, strong distinct JWT secrets, the public CLIENT_ORIGIN,
# and the production Google callback URL before starting the containers.
docker compose up --build
```

The frontend container proxies `/api` to the backend container and serves `index.html` as the SPA fallback. Production startup rejects placeholder, short, or identical JWT secrets.

Before release, run:

```bash
npm test
npm run build
npm run audit:data
npm run smoke:deployment
```

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `POST /api/users/:id/setup-link`
- `PUT /api/auth/profile`
- `POST /api/auth/profile/photo`
- `DELETE /api/auth/profile/photo`
- `GET /api/auth/profile/photo/:userId`
- `GET /api/dashboard/summary`
- `GET /api/departments`
- `POST /api/departments`
- `GET /api/courses`
- `POST /api/courses`
- `POST /api/assignments`
- `GET /api/course-preferences/instructor`
- `POST /api/course-preferences`
- `GET /api/course-preferences/manage`
- `POST /api/course-preferences/:id/recommend`
- `POST /api/course-preferences/:id/finalize`
- `POST /api/course-preferences/reset`
- `GET /api/stream-selection/student`
- `POST /api/stream-selection/preferences`
- `GET /api/stream-selection/manage`
- `POST /api/stream-selection/rounds`
- `POST /api/stream-selection/rounds/:id/allocate`
- `POST /api/evaluations/student`
- `POST /api/evaluations/peer`
- `POST /api/evaluations/hod`
- `GET /api/reports/instructor/:instructorId`
- `GET /api/reports/instructor/:instructorId/pdf`
- `GET /api/reports/department/:departmentId`
- `POST /api/uploads/students`
- `POST /api/uploads/users`
- `GET /api/schedules`
- `POST /api/schedules`
- `GET /api/schedules/:id/file`

## Project Layout

```text
backend/
  src/
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
    utils/
    tests/
frontend/
  src/
    api/
    components/
    context/
    data/
    pages/
    styles/
```

## Notes

This MVP is intentionally modular so the future roadmap can add AI insights, sentiment analysis, QR-code evaluation, SSO, mobile clients, multi-campus support, and accreditation reporting without rewriting the core domain.
