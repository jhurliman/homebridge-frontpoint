# homebridge-frontpoint

[![CI](https://github.com/jhurliman/homebridge-frontpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/jhurliman/homebridge-frontpoint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/homebridge-frontpoint.svg)](https://www.npmjs.com/package/homebridge-frontpoint)

Bring Frontpoint security partitions and contact, occupancy, and water-leak sensors into Apple Home through Homebridge. Select which accessories appear, keep existing accessory identities, and configure the arming options for HomeKit's Stay, Away, and Night modes.

**Cloud compatibility has not been verified.** The Frontpoint login endpoint has an unresolved [HTTP 403 report](https://github.com/jhurliman/node-frontpoint/issues/3). Local tests exercise the plugin with Homebridge's real accessory services and a simulated cloud client; they do not establish that today's Frontpoint service accepts this login flow. Do not upgrade a working alarm integration until read-only login and state retrieval have been checked for your account.

Requires Homebridge 2.4+ and Node 22, 24, or 26. See [CHANGELOG.md](CHANGELOG.md) for migration notes.

## Configuration

Install the plugin through Homebridge UI, then add one `FrontPoint` platform. The UI includes a configuration form. The equivalent entry in `config.json`'s `platforms` array is:

```json
{
  "platform": "FrontPoint",
  "name": "Security System",
  "username": "YOUR_FRONTPOINT_USERNAME",
  "password": "YOUR_FRONTPOINT_PASSWORD",
  "refreshSeconds": 60,
  "excludeIDs": [],
  "armingModes": {
    "away": { "noEntryDelay": false, "silentArming": false },
    "night": { "noEntryDelay": false, "silentArming": true },
    "stay": { "noEntryDelay": false, "silentArming": true }
  }
}
```

Keep credentials in your Homebridge configuration and out of issue reports. The plugin uses the Frontpoint cloud; it is not a local alarm-panel integration, and sensors update by polling.

| Setting | Behavior |
| --- | --- |
| `username`, `password` | Required Frontpoint credentials |
| `refreshSeconds` | Poll interval, default 60; valid range 10–86400 seconds. Prefer the default to avoid unnecessary account traffic. |
| `includeIDs` | Optional array of partition/sensor IDs to expose. Omit to include all; an empty array exposes none. |
| `excludeIDs` | Array of IDs to hide; takes precedence over `includeIDs`. Hidden cached accessories are unregistered on restart. |
| `armingModes` | Per-mode `noEntryDelay` and `silentArming` options; unknown mode names are rejected. |

Accessory IDs appear in the startup log and HomeKit's serial-number field. Filtering uses these exact strings, not display names. Exposing or hiding an accessory does not change the alarm panel's own configuration. HomeKit scenes involving removed accessories may need updating.

## Alarm and sensor behavior

- Stay and Night both use Frontpoint's arm-stay command, with separately configurable options. Away uses arm-away; Disarm uses disarm.
- Command completion follows the cloud response. Some calls take 20–30 seconds and can exceed Siri/HomeKit's response window ([#4](https://github.com/jhurliman/homebridge-frontpoint/issues/4)). A successful local queue insertion is not reported as a successfully armed or disarmed panel.
- Unknown panel states produce an unavailable reading and a fault, rather than being presented as disarmed. Cloud refresh failures mark security partitions as faulted; the next successful read restores their status.
- Contact, occupancy, and leak sensors are selected from their reported state. Low/critical battery flags map to HomeKit's low-battery characteristic.
- Concurrent refreshes share one request, concurrent logins share one authentication attempt, and polling stops on Homebridge shutdown.
- Locks are not implemented. They need authenticated endpoint fixtures, state mapping, and explicit device testing before command support can be added.

## Related community project

[homebridge-node-alarm-dot-com](https://github.com/node-alarm-dot-com/homebridge-node-alarm-dot-com) grew from this plugin and supports a broader Alarm.com feature set, including MFA and locks. It uses a different package, platform name, and configuration; it is not a drop-in upgrade. Its README currently describes maintenance mode. Review its compatibility information if you need features beyond this Frontpoint-specific integration.

## Development

```sh
npm ci
npm test
npm pack
```

The eight tests cover real Homebridge service registration, filtering and cached accessories, unknown alarm states, login/refresh coalescing, removal, shutdown, and command failure reporting. They never connect to an alarm account or arm/disarm a panel. Actions runs Node 22/24/26.

Maintainer release checks and client dependency updates are tracked in [RELEASING.md](RELEASING.md). The currently locked Frontpoint 1.2 client uses an obsolete `node-fetch` dependency with a known advisory; the dependency upgrade and live-account validation remain outstanding.

Existing partition/sensor UUIDs are preserved. Back up Homebridge before upgrading; the new filtering and stale-accessory reconciliation intentionally remove accessories that are no longer selected or present in a successful cloud listing.

## License

MIT. See [LICENSE](LICENSE).
