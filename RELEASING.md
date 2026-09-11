# Releasing homebridge-frontpoint

The maintainer no longer has the required account or hardware. Releases may proceed after automated checks, with the README and release notes explicitly stating that live compatibility is unverified. Do not describe simulated tests as hardware or service validation. Invite active users to test and take over maintenance.

- Publish `frontpoint` first, require `^2.0.0`, and regenerate the lockfile.
- Run `npm ci`, `npm test`, and `npm pack` against the published dependencies. Confirm supported Node/Homebridge versions, entry points, UI schema, documentation, and license.
- Review migration notes and publish. Keep known compatibility issues open until an active user verifies a fix.

## Community validation

Verify read-only login and sensor/partition retrieval first. The client’s HTTP 403 report remains unresolved; any command checks must target a deliberately selected partition.
