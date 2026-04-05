from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class FileUploadMetadata(BaseModel):
    columns: List[str]
    total_rows: int
    column_stats: Optional[list] = None
    numeric_cols: Optional[List[str]] = None
    categorical_cols: Optional[List[str]] = None
    datetime_cols: Optional[List[str]] = None


class UploadResponse(BaseModel):
    message: str
    session_id: str
    metadata: FileUploadMetadata
    insights: str


class AskRequest(BaseModel):
    question: str
    session_id: str


class ChartDataPoint(BaseModel):
    name: str
    value: float


class ChartConfig(BaseModel):
    """Structured chart configuration for premium visualization"""

    type: str = "none"  # bar, line, pie, scatter, histogram
    title: str = ""
    xAxis: str = ""
    yAxis: str = ""
    data: List[ChartDataPoint] = []
    colors: List[str] = ["#00E5FF", "#22D3EE"]
    showDataLabels: bool = True


class LLMResponse(BaseModel):
    id: Optional[str] = None
    answer: str
    chart_suggestion: str = "none"
    chart_data: List[ChartDataPoint] = []
    charts: Optional[List[ChartConfig]] = None  # Multiple charts support
    chart_config: Optional[ChartConfig] = None  # Single chart with full config
    reasoning: Optional[str] = None
    reasoning_mode: bool = False
    follow_up_questions: Optional[List[str]] = None
    result_table: Optional[List[dict]] = None
    result_columns: Optional[List[str]] = None
    data_source: Optional[str] = "computed"  # 'computed' = backend calculations
    backend_calculations: bool = True  # Confirm calculations from backend
    ai_enhanced: Optional[bool] = False
    ai_insights: Optional[List[str]] = None
    ai_recommendations: Optional[List[Dict[str, Any]]] = None


class CompareRequest(BaseModel):
    session_id: str
    group_col: str
    group_a: str
    group_b: str


class HealthResponse(BaseModel):
    status: str
    api: str


class InsightCard(BaseModel):
    question: str
    type: str
    result_table: List[dict] = []
    result_columns: List[str] = []
    chart_data: List[ChartDataPoint] = []
    chart_type: str = "none"
    summary_value: Optional[str] = None


class InsightResponse(BaseModel):
    insights: List[InsightCard]
    total: int


class BulkDeleteRequest(BaseModel):
    session_ids: List[str]


class RenameSessionRequest(BaseModel):
    new_name: str
