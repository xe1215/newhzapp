# Issue #33 acceptance status (development environment)

Target environment: `newhzapp-d4g8fk4yiaa3fa679` (confirmed by the owner).

## Completed and verified

- Before deletion, exported all 10 existing NoSQL collections (10 non-empty JSON files, 3,381,298 bytes) and all 163 storage objects (187,663,165 bytes, exactly matching the cloud listing) to `D:\newhzapp-issue33-backup-20260927`, outside the repository. The backup also contains the seven original cloud-function code trees and their environment-variable snapshots. Treat this directory as sensitive: it contains selfies, business records, and secrets.
- Registered only the nine replacement mini-program pages. Removed the retired pages, report/share services and functions, old test-service actions, three-image generation modules, and retired cleanup function source. No replacement page styling was edited for issue #33.
- Deployed the retained `test`, `admin`, and `payment` function code without changing their runtime configuration. Cloud invocations confirmed that the old three-image, report-list, and report-order actions reject requests, while new single-try-on, admin, and credit-product actions respond.
- Previewed and then removed the deployed `report`, `share`, and `cleanupExpiredData` functions. Cloud listing now contains only `admin`, `user`, `test`, and `payment`.
- After explicit owner approval, dry-run previewed all 113 old `tryon-results/` objects. The wildcard deletion failed without deleting any object, so the files were deleted individually and re-listed: only 40 `product-images/` and 10 `selfies/` objects remain. The 113 deleted images are recoverable from the local backup.
- Changed server-only sensitive NoSQL collections (`admin_actions`, `admin_sessions`, `events`, `provider_runs`, `reports`, and `try_on_tests`) from public-read to `PRIVATE`, and re-read all 10 collection ACLs. `lipsticks` remains public-read; `orders`, `recommendation_rules`, and `users` were already private.
- Tests #22–#33 pass; `admin` production build succeeds. The issue #28 test was migrated from its old coexistence requirement to the issue #33 retirement contract.

## Not yet accepted

- After the owner explicitly approved the no-dry-run exception, re-exported and re-counted the old collections (`orders`: 49, `reports`: 65, `recommendation_rules`: 48), then deleted exactly those three through the FlexDB `DeleteTable` API. `DescribeTable` now reports all three absent; `try_on_tests`, `lipsticks`, and `users` remain present. The backup retains both the original and immediate pre-delete exports.
- The old `test` function environment still has `IMAGE_PROVIDER_*`, `JIMENG_*`, and `TRYON_PROMPT_VERSION` variables. The CLI provides a read-only pull but no dry-run removal; do not replace the entire environment map without a separate reviewed change.
- Storage ACL remains globally `READONLY` (public read). A blanket private rule would also change product-image access. Selfies are retained because the single-try-on code reads them; the old try-on assets were removed after backup and explicit approval.
- `try_on_tests` and its referenced selfies are retained: the new `createSingleTryOn` action still reads `try_on_tests.selfieFileId`. The nine-page UI currently uses `miniprogram/ui/design-page.js`'s local-only prototype state and is not wired to the cloud single-try-on API, so end-to-end real-device acceptance cannot be claimed.
- Historical tests for retired business flows were removed. Eight remaining legacy/administrative tests still fail (`issue15`, `issue17`, `issue20`, `admin-preview-lipsticks`, `admin-cloudbase-default-mode`, `admin-cloudbase-access-key-required`, `admin-chinese-navigation`, and `admin-auth-disabled`); the entire repository suite is therefore not green. Real-device, multi-size, payment-callback, and upload-domain checks remain unverified.
