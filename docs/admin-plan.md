# Developer Console Plan

## Goal

Build an independent desktop-first Web console for the single developer to operate the lipstick try-on Mini Program. The console supports operational visibility, lipstick library maintenance, troubleshooting, and narrow exception handling.

## Confirmed Boundaries

- The console is an independent Web app under `admin/`.
- The console is for the developer only; no registration, multi-admin roles, or role-based permissions in the first version.
- The console deploys to CloudBase static hosting or CloudBase Web Apps.
- The backend API is a single `cloudfunctions/admin` cloud function that dispatches by `action`.
- The Web frontend never stores CloudBase management credentials.
- Actual WeChat refunds stay in the WeChat Pay merchant platform; the console only records handling status and reason.
- User images can be inspected in report details for troubleshooting, but the console is not an image gallery and does not support bulk image downloads.
- The console is desktop-first and does not need mobile adaptation.

## Modules

1. Operations Overview
   - Show today, yesterday, last 7 days, and last 30 days.
   - Summarize visits, tests, generation success/failure, paid orders, revenue, report views, share visits, recent generation failures, and exception orders.
   - Use real-time aggregation, not a precomputed metrics table.

2. Lipstick Library
   - Search by brand, shade, skin tone tags, budget range, and status.
   - Create, edit, activate, and deactivate lipstick records.
   - Import and export CSV.
   - Reject the entire CSV import when any row fails validation.

3. Test Records
   - Read-only list and detail views for `try_on_tests`.
   - Filter by openid, status, and date range.

4. Report Records
   - List and detail views for `reports`.
   - Inspect preview and paid image links in detail view.
   - Hide reports or mark reports as exceptional.

5. Orders and Refund Handling
   - List and detail views for `orders`.
   - Record refund handling status, refund reason, and developer note.
   - Do not initiate WeChat refunds from the console.

6. Generation and Event Logs
   - View `provider_runs` and `events`.
   - Export `events` by date range as CSV.

## Implementation Slices

### Slice 1: Admin App Shell

- Create `admin/` React + Vite app.
- Add desktop layout with left navigation and top filter area.
- Add login page and authenticated route shell.
- Add a small API client for calling `cloudfunctions/admin`.

### Slice 2: Admin Cloud Function Skeleton

- Create `cloudfunctions/admin`.
- Implement `action` dispatch.
- Implement shared response shape and error codes.
- Implement developer login with password hash and server-side session/token validation.
- Store secrets in CloudBase environment variables.

### Slice 3: Operations Overview

- Implement `getOverview`.
- Aggregate data from `events`, `orders`, `try_on_tests`, `reports`, and `provider_runs`.
- Add required date-range filters.
- Add indexes for `createdAt`, status fields, and common filters.

### Slice 4: Lipstick Library

- Implement `listLipsticks`, `saveLipstick`, `setLipstickStatus`, `importLipsticksCsv`, and `exportLipsticksCsv`.
- Add all-or-nothing CSV validation.
- Record write operations in `admin_actions`.

### Slice 5: Troubleshooting Modules

- Implement `listTests`, `listReports`, `updateReportFlag`, `listOrders`, `updateOrderHandling`, `listProviderRuns`, `listEvents`, and `exportEventsCsv`.
- Keep `users`, `try_on_tests`, `provider_runs`, and `events` read-only.
- Record report and order write operations in `admin_actions`.

### Slice 6: Deployment and Hardening

- Configure CloudBase deployment for `admin/`.
- Configure environment variables for admin password hash and session secret.
- Verify no management credentials are bundled into the frontend.
- Verify openid masking in lists and full openid availability only in details, copy actions, and CSV exports.

## First-Version Non-Goals

- Multi-admin accounts.
- Role-based access control.
- Full audit log UI.
- Direct WeChat refund initiation.
- Mobile-specific UI.
- Complex BI, retention, attribution, or user-profile analytics.
- Bulk image download.
- Editing users, tests, provider runs, or event records.
