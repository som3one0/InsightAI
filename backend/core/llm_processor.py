import json
import re
from typing import Optional
from openai import AsyncOpenAI
from loguru import logger
from core.config import settings
from core.schemas import LLMResponse

# Initialize async clients using Nvidia API integration
kimi_client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1", api_key=settings.NVIDIA_API_KEY
)

safety_client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=settings.NVIDIA_SAFETY_API_KEY,
)


# Deepseek client with key rotation
_deepseek_keys = []
_deepseek_key_index = 0


def _init_deepseek_keys():
    """Initialize Deepseek API keys from settings."""
    global _deepseek_keys
    if not _deepseek_keys:
        _deepseek_keys = settings.deepseek_keys
    return _deepseek_keys


def get_deepseek_client():
    """Get Deepseek client with rotated API key."""
    global _deepseek_key_index
    keys = _init_deepseek_keys()

    if not keys:
        logger.warning("No Deepseek API keys configured, using Kimi as fallback")
        return kimi_client

    key = keys[_deepseek_key_index % len(keys)]
    _deepseek_key_index = (_deepseek_key_index + 1) % len(keys)

    return AsyncOpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=key,
    )


deepseek_client = None  # Legacy - use get_deepseek_client() instead


def detect_reasoning_mode(question: str) -> bool:
    """
    Detect if the user wants an explanation or just the data.

    Returns True when question contains explanation-seeking keywords:
    why, how, explain, reason, insight, trend, what happened, what means

    Returns False for simple data queries like "top 5", "average", "show X".
    """
    q = question.lower().strip()

    # Explanation-seeking patterns
    explanation_patterns = [
        r"\bwhy\b",
        r"\bhow\b(?!\s*(many|much|long|often))",  # "how" but not "how many/much"
        r"\bexplain\b",
        r"\breason\b",
        r"\binsight\b",
        r"\binsights\b",
        r"\btrend\b",
        r"\btrends\b",
        r"\bwhat\s+(happen|cause|mean|caus|driv|differ)",
        r"\bcompare\b",
        r"\bversus\b",
        r"\bvs\b",
        r"\bimpact\b",
        r"\baffect\b",
        r"\bcould\s+(be|this|that|it)",
        r"\binterpret\b",
        r"\bsignifican",
    ]

    for pattern in explanation_patterns:
        if re.search(pattern, q):
            return True

    return False


async def check_safety(text: str) -> bool:
    """Uses Nemotron Safety Guard to verify if the text is safe to process."""
    if not text.strip():
        return True

    try:
        completion = await safety_client.chat.completions.create(
            model="nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
            messages=[{"role": "user", "content": text}],
            max_tokens=50,
            stream=False,
        )
        response = completion.choices[0].message.content or ""
        is_safe = "unsafe" not in response.lower()
        if not is_safe:
            logger.warning(f"Safety guard triggered! Content flagged.")
        return is_safe
    except Exception as e:
        logger.error(f"Safety check error: {e}")
        return True


async def generate_explanation(
    result_table: str,
    question: str,
    history: Optional[list] = None,
    reasoning_mode: bool = False,
) -> dict:
    """Uses LLM to format data results. Only explains when reasoning_mode is True."""

    # Format conversational history into a readable string
    history_context = ""
    if history and len(history) > 0:
        history_context = "PREVIOUS CONVERSATION:\n"
        for idx, turn in enumerate(history[-3:]):
            history_context += f"Q: {turn.get('q')}\nA: {turn.get('a')}\n\n"

    if reasoning_mode:
        # Explanation mode: brief answer + short explanation
        prompt = f"""You are a smart data assistant.

{history_context}
Computed Data:
{result_table}

Question: {question}

RULES:
- Give a short intro line first
- Then explain the result briefly in 2-4 sentences max
- Be clear and conversational
- Do NOT use headers or sections
- Do NOT over-explain
- Focus on the "why" or "how" behind the numbers

Return your response as JSON:
{{
  "answer": "your answer with brief explanation here",
  "follow_up_questions": ["follow-up 1", "follow-up 2", "follow-up 3"]
}}"""
    else:
        # Data mode: answer only, no explanation
        prompt = f"""You are a smart data assistant.

{history_context}
Computed Data:
{result_table}

Question: {question}

RULES:
- Give ONLY a one-line intro (the table/chart will be shown separately)
- Do NOT explain, analyze, or add commentary
- Do NOT say "here are the results" if the question is direct (like "what is X")
- Just answer directly or give a short setup line like "Top 10 by revenue:"
- Keep it to ONE sentence

Return your response as JSON:
{{
  "answer": "your one-line answer here",
  "follow_up_questions": ["follow-up 1", "follow-up 2", "follow-up 3"]
}}"""
    try:
        logger.info(f"Sending prompt to Kimi K2 for question: '{question[:30]}...'")
        completion = await kimi_client.chat.completions.create(
            model="moonshotai/kimi-k2-thinking",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            stream=False,
        )
        message = completion.choices[0].message
        content = message.content or ""
        reasoning = getattr(message, "reasoning_content", None)

        if not content:
            logger.warning("Empty response from LLM")
            raise ValueError("Empty response from LLM")

        # Clean up JSON formatting
        content = content.replace("```json", "").replace("```", "").strip()

        parsed = json.loads(content)
        if reasoning:
            parsed["reasoning"] = reasoning

        # Ensure required fields exist
        if "answer" not in parsed:
            parsed["answer"] = "Here are the results."
        if "follow_up_questions" not in parsed:
            parsed["follow_up_questions"] = []

        logger.success("Successfully processed LLM logic.")
        return parsed
    except json.JSONDecodeError as e:
        logger.error(
            f"JSON decode error from LLM response: {e}, content: {content[:200] if 'content' in dir() else 'N/A'}"
        )
        return {
            "answer": "I processed your query but couldn't format the response. Here are the results from your data.",
            "follow_up_questions": [
                "What columns are in your dataset?",
                "How many rows do you have?",
                "Show me the first 10 rows.",
            ],
        }
    except Exception as e:
        logger.error(f"LLM logic error: {e}")
        import traceback

        logger.error(f"Stack trace: {traceback.format_exc()}")
        return {
            "answer": "I ran into an issue generating a response. The backend calculations are complete - you can view them in the table or chart above.",
            "follow_up_questions": [
                "What columns are in your dataset?",
                "How many rows do you have?",
                "Show me the first 10 rows.",
            ],
        }


async def auto_insights_with_kimi(dataframe_head: str, data_info: str) -> str:
    """Generates an async summary of the dataset upon upload."""
    prompt = f"""
You are a professional Data Analyst. Look at this dataset context and provide a friendly 2-3 sentence high-level summary of what this dataset is about and what kind of questions the user could ask you about it.

Dataset Schema Info:
{data_info}

Sample Data (First 10 Rows):
{dataframe_head}
"""
    try:
        logger.info("Generating automatic insights using Kimi K2...")
        completion = await kimi_client.chat.completions.create(
            model="moonshotai/kimi-k2-thinking",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            stream=False,
        )
        logger.success("Auto insights successfully generated.")
        return completion.choices[0].message.content or "No insights generated."
    except Exception as e:
        logger.error(f"Kimi auto-insights error: {e}")
        return "Unable to generate automatic insights at this time."
