# Lipstick Try-On

This context describes the product language for a WeChat Mini Program that lets a user preview lipstick try-on results, pay to unlock a report, and lets the developer operate the service.

## Language

**Developer Console**:
A single-person web operations surface used by the developer to maintain product data and inspect operational records. It is not a multi-admin operations platform and is separate from the WeChat Mini Program.
_Avoid_: Admin system, operator portal, back office

**Developer**:
The only person expected to use the Developer Console in the first version.
_Avoid_: Admin, operator, staff

**Operational Data View**:
Read-only visibility into Mini Program activity and business records, including tests, reports, orders, image-generation runs, shares, and tracked events. It supports inspection and troubleshooting, not arbitrary editing of every record.
_Avoid_: Full database editor, analytics platform

**Report Inspection**:
Developer-only viewing of report details and related image links for troubleshooting generation, watermarking, payment unlock, and delivery issues. It is not a media library and does not support bulk image download.
_Avoid_: Asset browser, image gallery

**Managed Lipstick**:
A lipstick shade record that the Developer can create, edit, activate, or deactivate from the Developer Console.
_Avoid_: Product SKU, merchandise item

**Exception Order**:
An order that needs developer review because payment, report delivery, or refund handling did not complete cleanly. The Developer Console may update its handling status and reason, but it does not directly initiate a WeChat refund in the first version.
_Avoid_: Support ticket, transaction

**Operations Overview**:
The Developer Console home view that summarizes recent Mini Program activity, generation health, payment results, report views, share visits, and current exceptions over a chosen date range.
_Avoid_: Analytics dashboard, BI dashboard

**Developer Login**:
The single-password authentication gate for the Developer Console. It identifies only the Developer and does not create user accounts, registration, roles, or staff permissions.
_Avoid_: Admin account system, role-based access control

## Example Dialogue

Developer: "I need to adjust the lipstick library and inspect failed image generations."

Domain expert: "Those belong in the Developer Console because they are developer-only operational tasks, not user-facing Mini Program features."

Developer: "Should I put this inside the Mini Program as a hidden page?"

Domain expert: "No. The Developer Console is an independent web surface because its work is table-heavy and developer-only."

Developer: "Can I change production data from the console?"

Domain expert: "Only narrow operational records: Managed Lipsticks, Exception Orders, and report visibility or exception markers. Other Operational Data Views are for inspection."

Developer: "Can I inspect the generated try-on images?"

Domain expert: "Yes, through Report Inspection for troubleshooting. The console should not turn those user images into a browsable or downloadable media library."

Developer: "Can the console refund an order?"

Domain expert: "No. The Developer handles the money movement in the WeChat Pay merchant platform, then records the handling result on the Exception Order."

Developer: "What should I see first when I open the console?"

Domain expert: "The Operations Overview should show whether users are arriving, tests are being generated, payments are working, reports are being viewed, and exceptions need attention."

Developer: "Do I need user accounts for the console?"

Domain expert: "No. The Developer Login protects the Developer Console as a single-person tool."
