# Changelog

## 2.0.0 — unreleased

- Add include/exclude accessory ID filters and Homebridge UI schema (#6).
- Coalesce login/refresh work, stop polling on shutdown, and reconcile stale accessories after successful discovery.
- Fix object-backed accessory removal and report unknown alarm states as unavailable instead of disarmed.
- Sanitize cloud errors and preserve cloud-confirmed command completion; the Siri delay in #4 remains unresolved.
- Add eight tests against Homebridge 2.4 services, Node 22/24/26 Actions, package allowlist, and a rewritten README.
- Require Homebridge 2.4+ on Node 22, 24, or 26. Publication is blocked on Frontpoint 2.0 publication/dependency refresh and live read-only cloud validation; see README.
