import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from loguru import logger
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CleaningLog:
    """Log entry for each cleaning/transform action"""

    timestamp: str
    action: str
    column: str
    details: str
    rows_affected: int
    severity: str  # info, warning, error


@dataclass
class DataQualityReport:
    """Final quality report after processing"""

    overall_score: float  # 0-100
    cleanliness_score: float
    transformation_score: float
    enrichment_score: float
    issues_found: int
    recommendations: List[str]


@dataclass
class ProcessedData:
    """Container for processed data and metadata"""

    df: pd.DataFrame
    original_df: pd.DataFrame
    cleaning_log: List[CleaningLog]
    quality_report: DataQualityReport
    transformations_applied: List[str]
    new_columns_created: List[str]
    column_mappings: Dict[str, str]  # original -> cleaned name


class DataCleaner:
    """
    Self-Cleaning Data Engine
    Ensures all data is cleaned, transformed, and enriched before any analysis.
    """

    def __init__(self, mode: str = "balanced"):
        """
        Initialize with cleaning mode.

        Modes:
        - conservative: Minimal cleaning, preserve as much data as possible
        - balanced: Moderate cleaning with intelligent defaults
        - aggressive: Thorough cleaning, remove all anomalies
        """
        self.mode = mode
        self.cleaning_log: List[CleaningLog] = []
        self.transformations_applied: List[str] = []
        self.new_columns_created: List[str] = []
        self._timestamp = datetime.now().isoformat()

        # Mode configurations
        self._mode_config = {
            "conservative": {
                "missing_threshold": 0.5,  # Drop columns with >50% missing
                "outlier_z_threshold": 4.0,  # Only flag extreme outliers
                "duplicate_action": "keep_first",
                "outlier_action": "flag",
            },
            "balanced": {
                "missing_threshold": 0.3,  # Drop columns with >30% missing
                "outlier_z_threshold": 3.0,  # Standard outlier threshold
                "duplicate_action": "remove",
                "outlier_action": "cap",
            },
            "aggressive": {
                "missing_threshold": 0.2,  # Drop columns with >20% missing
                "outlier_z_threshold": 2.5,  # Sensitive outlier threshold
                "duplicate_action": "remove",
                "outlier_action": "remove",
            },
        }

    def _log_action(
        self,
        action: str,
        column: str,
        details: str,
        rows: int = 0,
        severity: str = "info",
    ):
        """Add an action to the cleaning log"""
        self.cleaning_log.append(
            CleaningLog(
                timestamp=datetime.now().isoformat(),
                action=action,
                column=column,
                details=details,
                rows_affected=rows,
                severity=severity,
            )
        )
        logger.info(f"[{action}] {column}: {details} ({rows} rows)")

    def _get_mode_config(self) -> Dict[str, Any]:
        """Get configuration based on mode"""
        return self._mode_config.get(self.mode, self._mode_config["balanced"])

    def process(self, df: pd.DataFrame) -> ProcessedData:
        """
        Main entry point - process raw data through complete pipeline.
        Returns ProcessedData with cleaned/transformed data and metadata.
        """
        logger.info(f"Starting data cleaning in '{self.mode}' mode with {len(df)} rows")

        original_df = df.copy()
        working_df = df.copy()

        # === PHASE 1: DATA CLEANING ===
        working_df = self._clean_data(working_df)

        # === PHASE 2: DATA TRANSFORMATION ===
        working_df = self._transform_data(working_df)

        # === PHASE 3: FEATURE ENGINEERING ===
        working_df = self._engineer_features(working_df)

        # === PHASE 4: QUALITY ASSESSMENT ===
        quality_report = self._assess_quality(working_df, original_df)

        # Create final column mappings
        column_mappings = {}
        for col in working_df.columns:
            if col in original_df.columns:
                column_mappings[col] = col
            else:
                column_mappings[col] = f"generated_{col}"

        logger.info(
            f"Data processing complete. Score: {quality_report.overall_score:.1f}/100"
        )

        return ProcessedData(
            df=working_df,
            original_df=original_df,
            cleaning_log=self.cleaning_log,
            quality_report=quality_report,
            transformations_applied=self.transformations_applied,
            new_columns_created=self.new_columns_created,
            column_mappings=column_mappings,
        )

    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Phase 1: Clean raw data"""
        config = self._get_mode_config()

        # 1.1 Handle duplicates
        initial_rows = len(df)
        df = df.drop_duplicates()
        dup_count = initial_rows - len(df)
        if dup_count > 0:
            self._log_action(
                "REMOVE_DUPLICATES",
                "ALL",
                f"Removed {dup_count} duplicate rows",
                dup_count,
                "warning",
            )
            self.transformations_applied.append(f"Removed {dup_count} duplicates")

        # 1.2 Fix data types
        for col in df.columns:
            df = self._fix_column_type(df, col)

        # 1.3 Handle missing values
        df = self._handle_missing_values(df, config)

        # 1.4 Handle outliers
        df = self._handle_outliers(df, config)

        # 1.5 Remove columns with too many missing values
        df = self._remove_sparse_columns(df, config)

        return df

    def _fix_column_type(self, df: pd.DataFrame, col: str) -> pd.DataFrame:
        """Detect and fix incorrect data types"""
        if df[col].dtype == object:
            # Try to convert to numeric
            numeric_converted = pd.to_numeric(
                df[col].str.replace(",", "").str.replace("%", ""), errors="coerce"
            )
            if numeric_converted.notna().sum() > len(df) * 0.5:
                # More than 50% can be converted to numeric
                original_nulls = df[col].isna().sum()
                df[col] = numeric_converted
                self._log_action(
                    "TYPE_CONVERSION",
                    col,
                    f"Converted {col} from string to numeric",
                    0,
                    "info",
                )
                self.transformations_applied.append(f"Converted {col} to numeric")
                return df

            # Try to parse dates
            date_parsed = pd.to_datetime(df[col], errors="coerce")
            if date_parsed.notna().sum() > len(df) * 0.5:
                original_nulls = df[col].isna().sum()
                df[col] = date_parsed
                self._log_action(
                    "TYPE_CONVERSION", col, f"Converted {col} to datetime", 0, "info"
                )
                self.transformations_applied.append(f"Parsed {col} as date")
                return df

        return df

    def _handle_missing_values(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Intelligently handle missing values based on column type"""
        for col in df.columns:
            missing_count = df[col].isna().sum()
            missing_pct = missing_count / len(df)

            if missing_count == 0:
                continue

            if pd.api.types.is_numeric_dtype(df[col]):
                # For numeric: use mean/median based on distribution
                col_std = df[col].std()
                if col_std is not None and col_std > 0 and missing_pct < 0.3:
                    # Use median for skewed data, mean otherwise
                    if df[col].skew() > 1:
                        fill_value = df[col].median()
                        method = "median"
                    else:
                        fill_value = df[col].mean()
                        method = "mean"

                    df[col] = df[col].fillna(fill_value)
                    self._log_action(
                        "IMPUTE_MISSING",
                        col,
                        f"Filled {missing_count} missing values using {method}",
                        missing_count,
                        "info",
                    )
                    self.transformations_applied.append(f"Imputed {col} with {method}")
                else:
                    # Too many missing or no variance - flag as 0
                    df[col] = df[col].fillna(0)
                    self._log_action(
                        "IMPUTE_MISSING",
                        col,
                        f"Filled {missing_count} missing with 0 (high missing rate)",
                        missing_count,
                        "warning",
                    )
            else:
                # For categorical: use mode or "Unknown"
                if missing_pct < 0.2:
                    mode_value = (
                        df[col].mode().iloc[0]
                        if not df[col].mode().empty
                        else "Unknown"
                    )
                    df[col] = df[col].fillna(mode_value)
                    self._log_action(
                        "IMPUTE_MISSING",
                        col,
                        f"Filled {missing_count} missing with mode '{mode_value}'",
                        missing_count,
                        "info",
                    )
                else:
                    df[col] = df[col].fillna("Unknown")
                    self._log_action(
                        "IMPUTE_MISSING",
                        col,
                        f"Filled {missing_count} missing with 'Unknown'",
                        missing_count,
                        "warning",
                    )

        return df

    def _handle_outliers(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Detect and handle outliers using IQR or Z-score"""
        outlier_threshold = config["outlier_z_threshold"]
        action = config["outlier_action"]

        numeric_cols = df.select_dtypes(include=[np.number]).columns

        for col in numeric_cols:
            if df[col].std() is None or df[col].std() == 0:
                continue

            # Z-score method
            z_scores = np.abs((df[col] - df[col].mean()) / (df[col].std() + 1e-9))
            outlier_mask = z_scores > outlier_threshold
            outlier_count = outlier_mask.sum()

            if outlier_count == 0:
                continue

            if action == "cap":
                # Cap outliers at threshold
                lower = round(df[col].mean() - outlier_threshold * df[col].std(), 2)
                upper = round(df[col].mean() + outlier_threshold * df[col].std(), 2)
                df[col] = df[col].clip(lower, upper)
                self._log_action(
                    "OUTLIER_HANDLING",
                    col,
                    f"Capped {outlier_count} outliers to bounds [{lower:.2f}, {upper:.2f}]",
                    outlier_count,
                    "info",
                )
                self.transformations_applied.append(f"Capped outliers in {col}")
            elif action == "flag":
                # Create flag column
                df[f"{col}_outlier"] = outlier_mask.astype(int)
                self._log_action(
                    "OUTLIER_DETECTION",
                    col,
                    f"Flagged {outlier_count} potential outliers",
                    outlier_count,
                    "warning",
                )
                self.new_columns_created.append(f"{col}_outlier")
            elif action == "remove":
                # Remove rows with outliers
                df = df[~outlier_mask]
                self._log_action(
                    "OUTLIER_REMOVAL",
                    col,
                    f"Removed {outlier_count} rows with outliers",
                    outlier_count,
                    "warning",
                )
                self.transformations_applied.append(
                    f"Removed {outlier_count} outlier rows from {col}"
                )

        return df

    def _remove_sparse_columns(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        """Remove columns with too many missing values"""
        threshold = config["missing_threshold"]
        cols_to_drop = []

        for col in df.columns:
            missing_pct = df[col].isna().sum() / len(df)
            if missing_pct > threshold:
                cols_to_drop.append(col)

        if cols_to_drop:
            df = df.drop(columns=cols_to_drop)
            for col in cols_to_drop:
                self._log_action(
                    "DROP_COLUMN",
                    col,
                    f"Dropped column with {missing_pct * 100:.1f}% missing values",
                    0,
                    "warning",
                )

        return df

    def _transform_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Phase 2: Transform data for better analysis"""

        # 2.1 Parse and standardize date columns
        for col in df.columns:
            if "date" in col.lower() or "time" in col.lower():
                if df[col].dtype == object:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                    if df[col].notna().sum() > len(df) * 0.5:
                        self.transformations_applied.append(
                            f"Standardized dates in {col}"
                        )

        # 2.2 Create readable number formats
        for col in df.select_dtypes(include=[np.number]).columns:
            if df[col].abs().max() > 1e9:
                # Convert to billions
                df[f"{col}_formatted"] = df[col] / 1e9
                df[f"{col}_formatted"] = (
                    df[f"{col}_formatted"].round(2).astype(str) + "B"
                )
                self.new_columns_created.append(f"{col}_formatted")
                self.transformations_applied.append(f"Created billion-format for {col}")
            elif df[col].abs().max() > 1e6:
                # Convert to millions
                df[f"{col}_formatted"] = df[col] / 1e6
                df[f"{col}_formatted"] = (
                    df[f"{col}_formatted"].round(2).astype(str) + "M"
                )
                self.new_columns_created.append(f"{col}_formatted")
                self.transformations_applied.append(f"Created million-format for {col}")

        # 2.3 Create categorical bins for numeric columns
        for col in df.select_dtypes(include=[np.number]).columns:
            if df[col].nunique() > 10:  # Only for columns with many unique values
                try:
                    df[f"{col}_bin"] = pd.qcut(
                        df[col],
                        q=4,
                        labels=["Low", "Medium", "High", "Very High"],
                        duplicates="drop",
                    )
                    self.new_columns_created.append(f"{col}_bin")
                    self.transformations_applied.append(f"Created bins for {col}")
                except:
                    pass

        # 2.4 Normalize/scale numeric columns for comparison
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            if df[col].std() > 0:
                df[f"{col}_normalized"] = (df[col] - df[col].mean()) / (
                    df[col].std() + 1e-9
                )
                df[f"{col}_normalized"] = df[f"{col}_normalized"].round(3)
                self.new_columns_created.append(f"{col}_normalized")

        self.transformations_applied.append(
            "Added normalized versions of numeric columns"
        )

        return df

    def _engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Phase 3: Create new useful features"""

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        # 3.1 Calculate growth rates if numeric columns exist
        if len(numeric_cols) >= 2:
            # Try to find potential growth columns (values over time-like columns)
            for col in numeric_cols[:3]:
                # Create YoY-style change indicator
                col_mean = df[col].mean()
                df[f"{col}_above_avg"] = (df[col] > col_mean).astype(int)
                self.new_columns_created.append(f"{col}_above_avg")

        # 3.2 Create rankings
        for col in numeric_cols[:3]:
            df[f"{col}_rank"] = df[col].rank(ascending=False, method="dense")
            self.new_columns_created.append(f"{col}_rank")

        self.transformations_applied.append("Added rank columns for top numeric values")

        # 3.3 Create aggregations by category
        cat_cols = df.select_dtypes(include=["object", "category"]).columns
        for cat_col in cat_cols[:2]:
            if df[cat_col].nunique() < 20:  # Only for manageable categories
                for num_col in numeric_cols[:2]:
                    agg_col_name = f"{cat_col}_{num_col}_mean"
                    df[agg_col_name] = df.groupby(cat_col)[num_col].transform("mean")
                    self.new_columns_created.append(agg_col_name)

        if len(cat_cols) > 0:
            self.transformations_applied.append(
                f"Created category aggregations for {len(cat_cols)} columns"
            )

        # 3.4 Detect relationships - create correlation indicators
        if len(numeric_cols) >= 2:
            corr_matrix = df[numeric_cols].corr()
            strong_corrs = []
            for i, col_a in enumerate(numeric_cols):
                for j, col_b in enumerate(numeric_cols):
                    if i < j:
                        corr = corr_matrix.loc[col_a, col_b]
                        if abs(corr) > 0.7:
                            strong_corrs.append((col_a, col_b, corr))

            if strong_corrs:
                self._log_action(
                    "RELATIONSHIP_DETECTED",
                    "MULTIPLE",
                    f"Found {len(strong_corrs)} strongly correlated column pairs",
                    0,
                    "info",
                )

        return df

    def _assess_quality(
        self, df: pd.DataFrame, original_df: pd.DataFrame
    ) -> DataQualityReport:
        """Phase 4: Calculate data quality scores"""

        # Cleanliness score
        missing_pct = df.isna().sum().sum() / (df.shape[0] * df.shape[1])
        cleanliness_score = max(0, 100 - missing_pct * 100)

        # Transformation score
        transformation_count = len(self.transformations_applied)
        transformation_score = min(100, transformation_count * 5)

        # Enrichment score
        enrichment_count = len(self.new_columns_created)
        enrichment_score = min(100, enrichment_count * 10)

        # Overall score (weighted)
        overall_score = (
            cleanliness_score * 0.4
            + transformation_score * 0.3
            + enrichment_score * 0.3
        )

        # Issues and recommendations
        issues = []
        recommendations = []

        if cleanliness_score < 70:
            issues.append("High missing value rate")
            recommendations.append("Consider collecting more complete data")

        if transformation_count < 3:
            issues.append("Limited transformations applied")
            recommendations.append("Enable aggressive mode for more transformations")

        if len(self.new_columns_created) < 2:
            issues.append("Few derived features created")
            recommendations.append(
                "Add more contextual information for feature engineering"
            )

        if overall_score >= 80:
            recommendations.append("Data is well-prepared for analysis")
        elif overall_score >= 60:
            recommendations.append(
                "Data is usable but could benefit from more cleaning"
            )
        else:
            recommendations.append("Consider re-collecting or supplementing data")

        return DataQualityReport(
            overall_score=round(overall_score, 1),
            cleanliness_score=round(cleanliness_score, 1),
            transformation_score=round(transformation_score, 1),
            enrichment_score=round(enrichment_score, 1),
            issues_found=len(issues),
            recommendations=recommendations,
        )

    def get_processing_summary(self) -> Dict[str, Any]:
        """Get summary of all processing actions"""
        return {
            "total_actions": len(self.cleaning_log),
            "transformations": self.transformations_applied,
            "new_columns": self.new_columns_created,
            "mode": self.mode,
        }


def clean_data(df: pd.DataFrame, mode: str = "balanced") -> ProcessedData:
    """
    Convenience function to clean and transform data.

    Args:
        df: Raw pandas DataFrame
        mode: Cleaning mode - 'conservative', 'balanced', or 'aggressive'

    Returns:
        ProcessedData object containing cleaned data and metadata
    """
    cleaner = DataCleaner(mode=mode)
    return cleaner.process(df)


def get_cleaning_report(processed_data: ProcessedData) -> Dict[str, Any]:
    """Get formatted cleaning report from processed data"""
    return {
        "quality_score": processed_data.quality_report.overall_score,
        "cleanliness": processed_data.quality_report.cleanliness_score,
        "transformations": processed_data.quality_report.transformation_score,
        "enrichment": processed_data.quality_report.enrichment_score,
        "actions_log": [
            {
                "action": log.action,
                "column": log.column,
                "details": log.details,
                "affected": log.rows_affected,
            }
            for log in processed_data.cleaning_log
        ],
        "new_features": processed_data.new_columns_created,
        "recommendations": processed_data.quality_report.recommendations,
    }
