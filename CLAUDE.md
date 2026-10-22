# acezilla — project instructions for Claude Code

- The design references are in `design_handoff_acezilla/`. Read `README.md` there before building any UI. Match its tokens, type scale and layouts exactly.
- Stack and build order are in `BUILD_PLAN.md`. Follow the build order.
- **Suggest-only:** nothing may write to an ad platform without an approved `approval` row. Never bypass this.
- **Platform code:** each platform's code lives in `packages/connectors/<platform>` behind the shared Connector interface.
- **Components:** use shadcn/ui primitives, styled with the CSS variables from README (`--bg`, `--surface`, `--ink`, `--accent` and the rest). Do not use any other colours.
- **Numbers:** show figures with `tabular-nums`. Show modeled ROAS next to platform ROAS wherever ROAS appears.
- **Language:** TypeScript strict mode.
- **Tests:** write tests for connectors (mock the HTTP layer), the rule engine and the attribution maths.
- **Architecture:** `ARCHITECTURE.md` describes how the repo is structured and how each platform connects. Read it first, and keep it up to date when the structure changes.
