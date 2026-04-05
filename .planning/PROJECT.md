# Project: InsightAI

## Purpose
InsightAI is a premium, AI-powered data analysis platform that allows users to upload datasets (CSV, Excel), perform automated cleaning and enrichment, and explore data through natural language queries and interactive visualizations.

## Core Value
One-click data intelligence: from raw file to AI-driven insights in seconds.

## Tech Stack
### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Database**: SQLite (`insightai.db`)
- **Analysis Engine**: Pandas, Scikit-learn
- **AI Integration**: Gemini (via `llm_processor.py`)

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Styling**: TailwindCSS (Custom Premium Glassmorphism)
- **Icons**: Lucide React
- **State Management**: Zustand (`chatStore.ts`)

## Context
The project is currently in the late-beta stage. Core upload, cleaning, and basic Q&A are functional. Recent updates added a premium "Try with Sample Data" feature.

## Requirements
### Validated
- ✓ [Dataset Upload] — CSV/XLSX support with specialized cleaning modes.
- ✓ [AI-Enrichment] — Automated column normalization and ranking.
- ✓ [Insight Engine] — Correlation matrix and outlier detection.
- ✓ [Sample Data] — One-click retail sales demo environment.

### Active
- [ ] [Bulk Management] — Batch selection and deletion of datasets.
- [ ] [Mobile UI] — Fully responsive dashboard for tablet/mobile.
- [ ] [Advanced Explorer] — In-grid AI signaling for data anomalies.

### Out of Scope
- [Streaming Data] — Real-time sensor data is not planned for MVPs.
- [Multi-user Auth] — Local-first focus for now.

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Glassmorphism | Provides a modern "luxury" feel | Implemented |
| FormData standard | Unified API contract for all uploads | Implemented |

---
*Last updated: Apr 4, 2026 after GSD Initialization*
