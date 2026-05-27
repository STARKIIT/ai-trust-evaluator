# Project Workspace Artifacts Tracker

This file documents the key source code modules, configuration files, and active schemas within the project repository.

## Active Artifacts

### Configuration & Base Environment
* [.gitignore](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/.gitignore): Standard git ignore file preventing leak of `.env` or node packages.
* [execution.log](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/execution.log): Unified runtime and development log.
* [workspace_artifacts.md](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/workspace_artifacts.md): This tracking registry file.

### Chrome Extension (Phase 1)
* [manifest.json](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/manifest.json): Chrome Manifest V3 descriptor mapping target sites and background files.
* [content.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/content.js): Content script for page observation, DOM scraping, selection capturing, and sidebar container injection.
* [background.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/background.js): Service worker proxying API evaluations and handling caching.
* [sidebar.html](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/sidebar.html): The interactive evaluation sidebar interface skeleton.
* [sidebar.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/sidebar.js): Controller script binding results structure to sidebar panels.
* [sidebar.css](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/extension/sidebar.css): Dark mode HSL stylesheet for sidebar presentation.

### Backend Orchestration (Phase 2)
* [config.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/config.js): Backend environment loading and validation using `zod`.
* [server.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/server.js): Entry point exposing Express API endpoint `/api/evaluate` and routing live/mock pipelines.

### Preprocessing, Segmentation & Evaluators (Phase 3)
* [segmenter.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/engines/segmenter.js): Splits content into typed segments (citations, reasoning chains, numerical estimates, code blocks).
* [evaluators.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/engines/evaluators.js): Independent evaluator modules for Assumptions, Hallucinations, Logic, and LLM-as-a-Judge using schema-enforced Gemini calls.

### Aggregation & Scoring (Phase 4)
* [aggregator.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/engines/aggregator.js): Combines independent evaluation streams into a unified qualitative score, confidence levels, dimension detail cards, and maps attention segments.

### Verification & Testing
* [run_tests.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/run_tests.js): Master test suite orchestration runner.
* [phase1.test.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/phase1.test.js): Chrome extension mock test validating host recognition and selection actions.
* [phase2.test.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/phase2.test.js): Backend endpoint integration test verifying Express routing and rejection pathways.
* [phase3.test.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/phase3.test.js): Schema validation tests for individual evaluator outputs and segmentation categories.
* [phase4.test.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/phase4.test.js): Score logic unit tests and integration tests checking the aggregated endpoint payload keys.
* [phase5.test.js](file:///c:/Users/ADGTS/OneDrive/Desktop/Vibe-coding/backend/tests/phase5.test.js): Advanced UX and inline DOM highlighting validation.
