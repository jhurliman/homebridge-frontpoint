# Releasing homebridge-frontpoint

1. Validate and publish the [Frontpoint 2.0 client](https://github.com/jhurliman/node-frontpoint/pull/4). The client’s login HTTP 403 report remains unresolved until verified on an authorized account.
2. Set the plugin dependency to `frontpoint: ^2.0.0` and regenerate the lockfile. The temporary compatibility range allows 1.2 and 2.0; the currently locked 1.2 version retains an obsolete `node-fetch` advisory and must not be used for the new release.
3. Repeat `npm ci`, `npm test`, and `npm pack` with the published client.
4. Verify read-only login and state retrieval. Command validation must be deliberate and supervised.
5. Confirm Homebridge/Node compatibility and package contents, then publish with migration notes.

Do not publish until the dependency and live-service requirements are satisfied.
