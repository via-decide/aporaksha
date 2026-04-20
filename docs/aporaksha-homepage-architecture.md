# Aporaksha Homepage Architecture

## Ecosystem Gateway Role
Aporaksha homepage is the central gateway for the ViaDecide ecosystem. It gives users one clear start point to:

- open workspace execution (`daxini.xyz`)
- build tools (`logichub.app`)
- publish and install assets (`daxini.space`)
- review security telemetry (`hanuman.solutions`)
- access organization context (`viadecide.com`)
- manage sovereign identity (`/passport`)

The homepage is intentionally structured so users understand the ecosystem in seconds: hero statement, module map, passport identity layer, and immediate action links.

## Module Structure
Homepage modules are split into focused browser scripts:

- `components/ecosystem/ecosystem-card.js`
  - renders a single ecosystem module card with icon, name, description, and open action.
- `components/ecosystem/ecosystem-grid.js`
  - defines module registry and renders the Ecosystem Modules grid.
- `components/capabilities/capabilities-grid.js`
  - renders the "What You Can Do Here" capabilities list.
- `components/activity/activity-feed.js`
  - renders mock live activity entries.

`script.js` initializes these modules and preserves existing stack-interaction, security telemetry load, and passport binding behaviors.

## Navigation Flow
1. User lands on homepage and sees ecosystem intent in hero.
2. Primary nav provides direct routes to Workspace, Build, Marketplace, Security, and Passport.
3. Ecosystem Modules section gives one-click entry to each connected system.
4. Passport section explains identity fields and routes users to `/passport`.
5. Capabilities and activity feed provide immediate context on platform actions and momentum.
6. Footer ecosystem map summarizes architecture relationships for quick orientation.

This creates a single-page routing layer that keeps existing functionality while clarifying where to start and what to do next.
