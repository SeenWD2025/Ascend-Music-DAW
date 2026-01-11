---
path: devtools
owner: platform-engineering
status: active
summary: Developer tooling scripts and automation helpers.
last_updated: 2026-01-10
key_artifacts:
	- update-root-mapfile.js (generates root-mapfile.md from directory mapfiles)
processes:
	- Run node devtools/update-root-mapfile.js to refresh the root mapfile
dependencies:
	- Node 18+
risks:
	- Keep script paths aligned with mapfile locations; exclude generated files from inputs
todo:
	- Add lint/test tooling scripts as they are introduced
tags: [tooling, automation]
---

Directory notes:
- Place shared scripts and automation utilities here.