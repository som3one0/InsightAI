import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from loguru import logger
from scipy import stats


def distribution_analysis(
    df: pd.DataFrame, numeric_cols: List[str]
) -> List[Dict[str, Any]]:
    """
    Analyze distribution of numeric columns.
    For each numeric column:
    - mean, median, std
    - skewness (if possible)
    - Detect if data is skewed
    - Detect if distribution is normal
    """
    results = []

    for col in numeric_cols:
        try:
            series = df[col].dropna()
            if len(series) < 5:
                continue

            mean_val = float(series.mean())
            median_val = float(series.median())
            std_val = float(series.std())

            skewness = None
            is_normal = False
            is_skewed = False
            skew_direction = None

            try:
                skewness = float(stats.skew(series))
                is_skewed = abs(skewness) > 0.5
                skew_direction = "right" if skewness > 0 else "left"

                if len(series) >= 8:
                    _, p_value = stats.normaltest(series)
                    is_normal = p_value > 0.05
            except:
                pass

            results.append(
                {
                    "column": col,
                    "mean": round(mean_val, 2),
                    "median": round(median_val, 2),
                    "std": round(std_val, 2),
                    "min": float(series.min()),
                    "max": float(series.max()),
                    "skewness": round(skewness, 3) if skewness is not None else None,
                    "is_skewed": is_skewed,
                    "skew_direction": skew_direction,
                    "is_normal": is_normal,
                    "count": len(series),
                }
            )
        except Exception as e:
            logger.warning(f"Distribution analysis failed for {col}: {e}")
            continue

    return results


def outlier_detector(
    df: pd.DataFrame, numeric_cols: List[str], method: str = "IQR"
) -> List[Dict[str, Any]]:
    """
    Detect outliers in numeric columns using IQR or Z-score.
    Returns:
    - column name
    - outlier count
    - outlier percentage
    - extreme values
    - sample unusual records
    """
    outliers = []

    for col in numeric_cols:
        try:
            series = df[col].dropna()
            if len(series) < 10:
                continue

            if method == "IQR":
                Q1 = series.quantile(0.25)
                Q3 = series.quantile(0.75)
                IQR = Q3 - Q1
                lower = Q1 - 1.5 * IQR
                upper = Q3 + 1.5 * IQR
                outlier_mask = (series < lower) | (series > upper)

                extreme_lower = Q1 - 3 * IQR
                extreme_upper = Q3 + 3 * IQR
                extreme_mask = (series < extreme_lower) | (series > extreme_upper)
            else:
                mean_val = series.mean()
                std_val = series.std()
                z_scores = np.abs((series - mean_val) / (std_val + 1e-9))
                outlier_mask = z_scores > 3
                extreme_mask = z_scores > 4

            outlier_count = int(outlier_mask.sum())
            extreme_count = int(extreme_mask.sum())

            if outlier_count == 0:
                continue

            outlier_pct = (outlier_count / len(series)) * 100

            outlier_values = series[outlier_mask].head(5).tolist()

            outlier_rows = df[outlier_mask].head(3)
            sample_records = (
                outlier_rows.to_dict(orient="records") if not outlier_rows.empty else []
            )

            outliers.append(
                {
                    "column": col,
                    "method": method,
                    "outlier_count": outlier_count,
                    "outlier_percentage": round(outlier_pct, 2),
                    "extreme_count": extreme_count,
                    "outlier_values": outlier_values[:5],
                    "sample_records": sample_records,
                    "lower_bound": round(float(lower), 2) if method == "IQR" else None,
                    "upper_bound": round(float(upper), 2) if method == "IQR" else None,
                }
            )
        except Exception as e:
            logger.warning(f"Outlier detection failed for {col}: {e}")
            continue

    return outliers


def correlation_engine(
    df: pd.DataFrame, numeric_cols: List[str], threshold: float = 0.6
) -> Dict[str, Any]:
    """
    Compute correlation matrix between numeric columns.
    Find strong correlations (>threshold).
    """
    if len(numeric_cols) < 2:
        return {"correlations": [], "matrix": None}

    try:
        numeric_cols_for_corr = [
            c for c in numeric_cols if "_normalized" not in c.lower()
        ]
        if len(numeric_cols_for_corr) < 2:
            return {"correlations": [], "matrix": None}

        corr_matrix = df[numeric_cols_for_corr].corr()

        strong_correlations = []
        for i, col_a in enumerate(numeric_cols_for_corr):
            for j, col_b in enumerate(numeric_cols_for_corr):
                if i >= j:
                    continue
                corr_val = corr_matrix.loc[col_a, col_b]
                if pd.isna(corr_val):
                    continue
                abs_corr = abs(corr_val)
                if abs_corr >= threshold:
                    strong_correlations.append(
                        {
                            "column_a": col_a,
                            "column_b": col_b,
                            "correlation": round(float(corr_val), 3),
                            "strength": "strong" if abs_corr >= 0.8 else "moderate",
                            "direction": "positive" if corr_val > 0 else "negative",
                        }
                    )

        strong_correlations.sort(key=lambda x: abs(x["correlation"]), reverse=True)

        matrix_dict = (
            corr_matrix.round(3).to_dict() if corr_matrix is not None else None
        )

        return {
            "correlations": strong_correlations,
            "matrix": matrix_dict,
            "all_pairs": len(strong_correlations),
        }
    except Exception as e:
        logger.error(f"Correlation analysis failed: {e}")
        return {"correlations": [], "matrix": None}


def group_analysis(
    df: pd.DataFrame, categorical_cols: List[str], numeric_cols: List[str]
) -> List[Dict[str, Any]]:
    """
    Analyze categorical columns.
    For each category:
    - group by category
    - compute averages / counts
    - find best / worst performing category
    """
    results = []

    for cat_col in categorical_cols:
        if df[cat_col].nunique() < 2 or df[cat_col].nunique() > 50:
            continue

        for num_col in numeric_cols[:2]:
            try:
                grouped = (
                    df.groupby(cat_col)[num_col]
                    .agg(["mean", "sum", "count"])
                    .reset_index()
                )
                grouped.columns = [cat_col, "avg_value", "total_value", "count"]

                grouped = grouped.dropna()
                if len(grouped) < 2:
                    continue

                best_idx = grouped["avg_value"].idxmax()
                worst_idx = grouped["avg_value"].idxmin()

                best = grouped.loc[best_idx]
                worst = grouped.loc[worst_idx]

                results.append(
                    {
                        "category_column": cat_col,
                        "value_column": num_col,
                        "total_categories": len(grouped),
                        "best_category": str(best[cat_col]),
                        "best_avg": round(float(best["avg_value"]), 2),
                        "worst_category": str(worst[cat_col]),
                        "worst_avg": round(float(worst["avg_value"]), 2),
                        "grouped_data": grouped.head(10).to_dict(orient="records"),
                    }
                )
            except Exception as e:
                logger.warning(f"Group analysis failed for {cat_col}/{num_col}: {e}")
                continue

    return results


def top_patterns(df: pd.DataFrame, categorical_cols: List[str]) -> List[Dict[str, Any]]:
    """
    Identify dominant values and concentration.
    For each categorical column:
    - most frequent category
    - value concentration (top %)
    - distribution analysis
    """
    patterns = []

    for col in categorical_cols:
        try:
            value_counts = df[col].value_counts()
            total = len(df)

            if total == 0:
                continue

            top_1_pct = (
                (value_counts.iloc[0] / total) * 100 if len(value_counts) > 0 else 0
            )
            top_3_pct = (
                (value_counts.head(3).sum() / total) * 100
                if len(value_counts) >= 3
                else top_1_pct
            )
            top_5_pct = (
                (value_counts.head(5).sum() / total) * 100
                if len(value_counts) >= 5
                else top_3_pct
            )

            entropy = stats.entropy(value_counts) if len(value_counts) > 1 else 0

            is_concentrated = top_1_pct > 30 or top_3_pct > 60

            patterns.append(
                {
                    "column": col,
                    "unique_values": int(value_counts.count()),
                    "top_value": str(value_counts.index[0]),
                    "top_count": int(value_counts.iloc[0]),
                    "top_1_pct": round(top_1_pct, 2),
                    "top_3_pct": round(top_3_pct, 2),
                    "top_5_pct": round(top_5_pct, 2),
                    "is_concentrated": is_concentrated,
                    "entropy": round(float(entropy), 3),
                    "top_values": value_counts.head(5).to_dict(),
                }
            )
        except Exception as e:
            logger.warning(f"Top patterns analysis failed for {col}: {e}")
            continue

    return patterns


def trend_analysis(
    df: pd.DataFrame, datetime_cols: List[str], numeric_cols: List[str]
) -> List[Dict[str, Any]]:
    """
    Detect trends in numeric columns over time.
    For each datetime + numeric pair:
    - detect increasing / decreasing trend
    - compute trend slope
    - identify seasonality if possible
    """
    trends = []

    for time_col in datetime_cols:
        try:
            df_sorted = df.sort_values(by=time_col)

            for num_col in numeric_cols[:3]:
                series = df_sorted[num_col].dropna()
                if len(series) < 10:
                    continue

                x = np.arange(len(series))
                try:
                    slope, intercept, r_value, p_value, std_err = stats.linregress(
                        x, series.values
                    )
                except:
                    continue

                if p_value > 0.05:
                    trend_direction = "stable"
                elif slope > 0:
                    trend_direction = "increasing"
                else:
                    trend_direction = "decreasing"

                r_squared = r_value**2

                if len(series) >= 20:
                    recent = series.tail(10)
                    older = series.head(10)
                    if trend_direction == "increasing":
                        pct_change = (
                            (recent.mean() - older.mean()) / (older.mean() + 1e-9)
                        ) * 100
                    else:
                        pct_change = (
                            (older.mean() - recent.mean()) / (older.mean() + 1e-9)
                        ) * 100
                else:
                    pct_change = None

                trends.append(
                    {
                        "time_column": time_col,
                        "value_column": num_col,
                        "trend_direction": trend_direction,
                        "slope": round(float(slope), 4),
                        "r_squared": round(float(r_squared), 3),
                        "p_value": round(float(p_value), 4),
                        "percentage_change": round(float(pct_change), 2)
                        if pct_change
                        else None,
                        "start_value": round(float(series.iloc[0]), 2),
                        "end_value": round(float(series.iloc[-1]), 2),
                        "data_points": len(series),
                    }
                )
        except Exception as e:
            logger.warning(f"Trend analysis failed for {time_col}/{num_col}: {e}")
            continue

    return trends


def generate_data_scientist_insights(
    df: pd.DataFrame, profile: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Generate deep, meaningful insights like a data scientist.

    Runs complete analysis pipeline:
    1. Distribution Analysis
    2. Outlier Detection
    3. Correlation Analysis
    4. Group Analysis
    5. Top Patterns
    6. Trend Analysis

    Returns max 10-15 insights with:
    - Title (clear finding)
    - Data (table or values)
    - Chart type
    - Explanation (short, under 2 lines)
    """
    numeric_cols = profile.get("numeric_cols", [])
    categorical_cols = profile.get("categorical_cols", [])
    datetime_cols = profile.get("datetime_cols", [])

    insights = []

    dist_results = distribution_analysis(df, numeric_cols)
    for dist in dist_results[:3]:
        insight_type = "distribution"
        title = f"{dist['column']} Distribution"

        value_str = f"μ={dist['mean']}, MED={dist['median']}, σ={dist['std']}"

        if dist.get("is_skewed"):
            title = f"{dist['column']} Right-Skewed Distribution"
            value_str += f", Skew={dist['skewness']}"

        explanation = ""
        if dist.get("skew_direction"):
            explanation = (
                f"Data is {dist['skew_direction']}-skewed with {dist['count']} values."
            )
        if dist.get("is_normal"):
            explanation = "Distribution is approximately normal."

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "column": dist["column"],
                    "mean": dist["mean"],
                    "median": dist["median"],
                    "std": dist["std"],
                    "min": dist["min"],
                    "max": dist["max"],
                },
                "chart_type": "histogram",
                "explanation": explanation,
            }
        )

    outlier_results = outlier_detector(df, numeric_cols)
    for out in outlier_results[:2]:
        if out["outlier_count"] < 2:
            continue
        insight_type = "outlier"
        title = f"Outliers in {out['column']}"
        value_str = f"{out['outlier_count']} outliers ({out['outlier_percentage']}%)"

        explanation = f"Found {out['extreme_count']} extreme values outside {out['method']} bounds."

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "column": out["column"],
                    "outlier_count": out["outlier_count"],
                    "outlier_percentage": out["outlier_percentage"],
                    "extreme_count": out["extreme_count"],
                    "bounds": f"{out['lower_bound']} - {out['upper_bound']}",
                },
                "chart_type": "none",
                "explanation": explanation,
            }
        )

    corr_results = correlation_engine(df, numeric_cols)
    for corr in corr_results.get("correlations", [])[:3]:
        insight_type = "correlation"
        title = f"{corr['direction'].title()} Correlation: {corr['column_a']} & {corr['column_b']}"
        value_str = f"r = {corr['correlation']}"

        explanation = (
            f"These columns have a {corr['strength']} {corr['direction']} relationship."
        )

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "column_a": corr["column_a"],
                    "column_b": corr["column_b"],
                    "correlation": corr["correlation"],
                    "strength": corr["strength"],
                },
                "chart_type": "scatter",
                "explanation": explanation,
            }
        )

    group_results = group_analysis(df, categorical_cols, numeric_cols)
    for group in group_results[:3]:
        insight_type = "group"
        title = f"Best {group['category_column']}: {group['best_category']}"
        value_str = f"Avg {group['value_column']} = {group['best_avg']}"

        explanation = f"{group['best_category']} outperforms {group['worst_category']} by {group['best_avg'] - group['worst_avg']:.2f}."

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "category": group["category_column"],
                    "best": group["best_category"],
                    "worst": group["worst_category"],
                    "best_avg": group["best_avg"],
                    "worst_avg": group["worst_avg"],
                },
                "chart_type": "bar",
                "explanation": explanation,
            }
        )

    pattern_results = top_patterns(df, categorical_cols)
    for pat in pattern_results[:2]:
        if not pat.get("is_concentrated"):
            continue
        insight_type = "pattern"
        title = f"{pat['column']} Dominance"
        value_str = f"{pat['top_1_pct']}% is '{pat['top_value']}'"

        explanation = (
            f"{pat['unique_values']} unique values with {pat['top_3_pct']}% in top 3."
        )

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "column": pat["column"],
                    "top_value": pat["top_value"],
                    "top_1_pct": pat["top_1_pct"],
                    "top_3_pct": pat["top_3_pct"],
                },
                "chart_type": "bar",
                "explanation": explanation,
            }
        )

    trend_results = trend_analysis(df, datetime_cols, numeric_cols)
    for trend in trend_results[:2]:
        if trend["p_value"] > 0.05:
            continue
        insight_type = "trend"
        title = f"{trend['value_column']} {trend['trend_direction'].title()} Trend"
        value_str = f"Slope: {trend['slope']}, R²={trend['r_squared']}"

        pct = trend.get("percentage_change")
        if pct:
            explanation = (
                f"{trend['trend_direction']} by {abs(pct):.1f}% over time period."
            )
        else:
            explanation = f"Trend is statistically significant (p={trend['p_value']})."

        insights.append(
            {
                "title": title,
                "type": insight_type,
                "value": value_str,
                "data": {
                    "column": trend["value_column"],
                    "direction": trend["trend_direction"],
                    "slope": trend["slope"],
                    "r_squared": trend["r_squared"],
                    "p_value": trend["p_value"],
                },
                "chart_type": "line",
                "explanation": explanation,
            }
        )

    limited_insights = insights[:12]
    logger.info(f"Generated {len(limited_insights)} data scientist insights")
    return limited_insights
