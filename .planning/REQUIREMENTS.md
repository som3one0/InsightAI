# Requirements: InsightAI

## Core Objectives
1.  **Efficiency**: Allow users to manage large volumes of datasets with bulk actions.
2.  **Accessibility**: Ensure the platform is usable on tablets and mobile devices with a premium feel.
3.  **Discovery**: Surface AI insights directly within the data exploration interface.

## Target Audience
Data Analysts and Business Intelligence users who need rapid, AI-assisted data profiling.

## Functional Requirements

### 1. Bulk Data Management
- [MUST] Multiple selection of datasets in the sidebar.
- [MUST] "Select All" and "Deselect All" options.
- [MUST] Bulk delete confirmation modal.
- [SHOULD] Batch export (CSV/Markdown) of selected sessions.

### 2. Premium UI/UX & Mobile
- [MUST] Fully responsive Sidebar (collapsible on mobile).
- [MUST] Responsive Data Grid (horizontal scroll/optimized view).
- [MUST] Touch-friendly action buttons.
- [SHOULD] Accessible ARIA labels for all interactive elements.

### 3. Advanced Data Explorer
- [MUST] In-cell highlighting for detected outliers.
- [MUST] Sentiment or signal indicators for numeric columns.
- [SHOULD] Enhanced "Try Asking" chips that update based on selected dataset features.

## Non-Functional Requirements
- **Performance**: Bulk deletion must be completed in < 2 seconds for up to 50 datasets.
- **Privacy**: All data remains local in `insightai.db`.
- **Aesthetics**: Maintain the glassmorphism design language throughout.
