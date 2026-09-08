import os
import json
import base64
import re
import asyncio
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv


backend_dir = Path(__file__).resolve().parent.parent
for env_candidate in (
    backend_dir / ".env",
    backend_dir.parent / ".env",
    Path.cwd() / ".env",
):
    if env_candidate.exists():
        load_dotenv(env_candidate, override=False)
        break
else:
    load_dotenv()


class EmergencyAIAgent:
    """
    EmergencySync backend AI agent.

    Provides AI-assisted clinical decision support.
    It does not replace a qualified medical professional.
    """

    def __init__(self):
        self.provider = (os.getenv("AI_PROVIDER") or "ollama").strip().lower()
        self.ollama_base_url = (
            os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434"
        ).rstrip("/")
        self.ollama_model = (os.getenv("OLLAMA_MODEL") or "qwen3:8b").strip()
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = None
        self.model_name = "gemini-3.6-flash"

        if self.provider == "gemini":
            if not self.api_key:
                raise RuntimeError(
                    "GEMINI_API_KEY is not configured in backend/.env"
                )
            from google import genai

            self.client = genai.Client(api_key=self.api_key)
        elif self.provider != "ollama":
            raise RuntimeError(
                f"Unsupported AI_PROVIDER '{self.provider}'. Use 'ollama' or 'gemini'."
            )

    # ---------------------------------------------------------
    # Existing patient/vitals analysis
    # ---------------------------------------------------------

    async def analyze_case(
        self,
        patient_data: Dict[str, Any],
    ) -> Dict[str, Any]:

        if not patient_data:
            raise ValueError("Patient data is required for AI analysis")

        prompt = f"""
You are the EmergencySync AI clinical decision-support agent.

Analyze the emergency patient information provided below.

IMPORTANT SAFETY REQUIREMENTS:
- This is clinical decision support, NOT a medical diagnosis.
- Never claim certainty.
- Do not invent symptoms, measurements, history, ECG findings, or reports.
- Base observations only on the information supplied.
- If information is insufficient, clearly state the limitation.
- Missing information must remain unknown or not provided. Do not guess it.
- possible_conditions must be AI-assessed likely conditions for clinician review, never a confirmed diagnosis.
- Do not choose or name a destination hospital. Hospital selection is application logic.
- A qualified healthcare professional must make the final clinical decision.
- For potentially life-threatening findings, clearly indicate that
  immediate professional assessment may be required.

Consider emergency categories such as:
- Cardiac
- Neurological
- Respiratory
- Trauma
- Metabolic
- Poisoning
- Environmental
- Other emergency conditions

Patient information:

{json.dumps(patient_data, indent=2)}

Return ONLY valid JSON in this exact structure:

{{
    "severity": "critical|high|moderate|low|undetermined",
    "emergency_category": "Cardiac|Neurological|Respiratory|Trauma|Metabolic|Poisoning|Environmental|Other|Undetermined",
    "observations": ["patient-specific finding and the supplied input that supports it"],
    "possible_conditions": ["possible condition for clinician review, never a confirmed diagnosis"],
    "confidence": 0.0,
    "recommended_department": "",
    "requires_immediate_attention": false,
    "clinical_review_required": true,
    "limitations": ["missing, uncertain, or non-diagnostic information"],
    "recommended_action": ""
}}
"""

        return await self._run_json_interaction(prompt)

    async def structure_clinical_handover(
        self,
        transcript: str,
    ) -> Dict[str, Any]:
        if not transcript.strip():
            raise ValueError("Clinical handover transcript is required")

        deterministic = self._extract_handover_values(transcript)
        prompt = f"""
You are structuring a nurse or paramedic clinical handover for EmergencySync.
This is data extraction, not diagnosis. Never invent missing information.
Use "Unknown / Not available" for information not spoken and
"Unclear - requires confirmation" when the transcript is ambiguous.
Preserve medical abbreviations and interpret common spoken vital-sign formats.

Transcript:
{transcript}

Return only valid JSON with these keys:
patient_name, age, gender, blood_group, symptoms, medical_history,
medications, allergies, current_state, heart_rate, systolic_bp,
diastolic_bp, spo2, respiratory_rate, temperature, treatments_given,
interventions, nurse_observations, ecg_report, missing_information,
uncertain_information.
"""
        try:
            structured = await self._run_json_interaction(prompt)
        except RuntimeError as exc:
            if self._is_quota_or_rate_limit_error(exc) or self._is_ai_service_unavailable_error(exc):
                return deterministic
            raise

        # Preserve values that were explicitly spoken; the LLM should enrich
        # symptoms and context, not replace measurements with guesses.
        merged = {**deterministic, **structured}
        for key, value in deterministic.items():
            if value not in (None, "", "Unknown / Not available"):
                merged[key] = value
        return merged

    @staticmethod
    def _is_quota_or_rate_limit_error(error: RuntimeError) -> bool:
        message = str(error).lower()
        return "429" in message or "quota exceeded" in message or "rate limit" in message

    @staticmethod
    def _is_ai_service_unavailable_error(error: RuntimeError) -> bool:
        message = str(error).lower()
        return any(
            token in message
            for token in (
                "ollama is unavailable",
                "connection refused",
                "failed to establish",
                "timed out",
                "timeout",
                "name or service not known",
                "winerror 10061",
            )
        )

    @staticmethod
    def _extract_handover_values(transcript: str) -> Dict[str, Any]:
        text = " ".join(transcript.split())
        lower = text.lower()
        unknown = "Unknown / Not available"

        def number(pattern: str) -> Optional[str]:
            match = re.search(pattern, lower, re.IGNORECASE)
            return match.group(1) if match else None

        result: Dict[str, Any] = {
            "patient_name": unknown,
            "age": (
                number(r"\b(\d{1,3})\s*(?:years?\s*old|year[-\s]?old|yo)\b")
                or number(r"^(?:i(?:'m| am)\s+)?(\d{1,3})\s+(?=(?:male|female)\b)")
                or unknown
            ),
            "gender": (
                "Male" if re.search(r"\bmale\b", lower) else
                "Female" if re.search(r"\bfemale\b", lower) else unknown
            ),
            "blood_group": unknown,
            "symptoms": unknown,
            "medical_history": unknown,
            "medications": unknown,
            "allergies": unknown,
            "current_state": (
                "Conscious and breathing"
                if re.search(r"\bconscious\s+and\s+breathing\b", lower)
                else unknown
            ),
            "heart_rate": number(r"\b(?:pulse|heart\s+rate|hr)\s*[:=]?\s*(\d{2,3})\b") or unknown,
            "systolic_bp": unknown,
            "diastolic_bp": unknown,
            "spo2": number(
                r"\b(?:spo2|spo\s*2|spo\s*to|oxygen\s+saturation)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\b"
            ) or unknown,
            "respiratory_rate": number(
                r"\b(?:respiratory\s+rate|respiratory|rr)\s*[:=]?\s*(\d{1,3})\b"
            ) or unknown,
            "temperature": number(
                r"\b(?:temperature|temp)\s*[:=]?\s*(\d{2}(?:\.\d+)?)\b"
            ) or unknown,
            "treatments_given": unknown,
            "interventions": unknown,
            "nurse_observations": unknown,
            "ecg_report": "Attached" if re.search(r"\becg\b.{0,20}\battached\b", lower) else unknown,
            "missing_information": [],
            "uncertain_information": [],
        }

        blood_pressure = re.search(
            r"\bbp\s*[:=]?\s*(\d{2,3})\s*(?:/|over|,|\s)\s*(\d{2,3})\b",
            lower,
        )
        if blood_pressure:
            result["systolic_bp"] = blood_pressure.group(1)
            result["diastolic_bp"] = blood_pressure.group(2)
        else:
            diastolic_only = re.search(r"\bbp\s+(?:out\s+of|over)\s+(\d{2,3})\b", lower)
            if diastolic_only:
                result["diastolic_bp"] = diastolic_only.group(1)
                result["uncertain_information"] = [
                    "Systolic blood pressure was not reliably captured."
                ]

        symptom_match = re.search(
            r"\b(?:symptoms?|complaining\s+of|with)\s*[:=]?\s*(.+?)(?=\s+\b(?:pulse|heart\s+rate|hr|bp|spo2|spo\s*2|respiratory|rr|temperature|temp)\b|$)",
            lower,
        )
        if symptom_match:
            result["symptoms"] = symptom_match.group(1).strip().capitalize()
        elif re.search(r"\bchest\s+pain\b", lower):
            result["symptoms"] = "Chest pain"

        treatments = []
        if re.search(r"\baspirin\b", lower):
            treatments.append("Aspirin")
        if re.search(r"\boxygen\b", lower):
            treatments.append("Oxygen")
        if treatments:
            result["treatments_given"] = ", ".join(treatments)
            result["interventions"] = result["treatments_given"]

        result["missing_information"] = [
            key for key, value in result.items()
            if key in {"age", "gender", "heart_rate", "systolic_bp", "diastolic_bp", "spo2", "respiratory_rate", "temperature"}
            and value == unknown
        ]
        return result

    # ---------------------------------------------------------
    # NEW: Multimodal ECG / Medical Report analysis
    # ---------------------------------------------------------

    async def analyze_case_with_file(
        self,
        patient_data: Dict[str, Any],
        file_path: str,
        mime_type: str,
    ) -> Dict[str, Any]:

        if not patient_data:
            raise ValueError("Patient data is required for AI analysis")

        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(
                f"Uploaded file not found: {file_path}"
            )

        file_bytes = path.read_bytes()
        file_base64 = base64.b64encode(file_bytes).decode("utf-8")
        visual_supported = self.provider == "gemini" or mime_type.startswith("image/")

        visual_note = ""
        if self.provider == "ollama" and not mime_type.startswith("image/"):
            visual_note = (
                "\nThe local model cannot visually inspect this uploaded file. "
                "Do not invent ECG waveform or report findings. "
                f"Record that a file named {path.name} ({mime_type}) was attached "
                "and include that limitation.\n"
            )

        prompt = f"""
You are the EmergencySync AI clinical decision-support agent.

You are analyzing an emergency patient together with an uploaded
medical image or document.

The uploaded file may be:
- A paper ECG image
- A digital ECG representation
- A medical report
- Another emergency medical document

IMPORTANT SAFETY REQUIREMENTS:

- This is clinical decision support, NOT a medical diagnosis.
- Never claim certainty.
- Do not invent ECG findings or medical information.
- Only describe findings that are actually visible or supported by
  the supplied patient information and uploaded file.
- If the image is unclear, incomplete, low quality, or does not contain
  enough information, explicitly state this limitation.
- Do not assume that an ECG image proves a particular diagnosis.
- Do not choose or name a destination hospital.
- A qualified healthcare professional must review the findings.
- For potentially life-threatening findings, clearly indicate that
  immediate professional assessment may be required.
{visual_note}
Patient information:

{json.dumps(patient_data, indent=2)}

Analyze the uploaded file together with the patient information.

For an ECG image, consider only visible/supportable features such as:
- Heart rhythm appearance
- Rate if reasonably readable
- Obvious waveform abnormalities
- ST-segment or T-wave abnormalities if clearly visible
- Whether the ECG appears incomplete or technically unclear

Do NOT invent measurements that cannot be read from the image.

Return ONLY valid JSON in this exact structure:

{{
    "severity": "critical|high|moderate|low|undetermined",
    "emergency_category": "Cardiac|Neurological|Respiratory|Trauma|Metabolic|Poisoning|Environmental|Other|Undetermined",
    "observations": [],
    "possible_conditions": [],
    "ecg_or_report_findings": [],
    "confidence": 0.0,
    "recommended_department": "",
    "requires_immediate_attention": false,
    "clinical_review_required": true,
    "limitations": [],
    "recommended_action": ""
}}
"""

        if self.provider == "ollama":
            images = [file_base64] if mime_type.startswith("image/") else None
            try:
                return await self._run_ollama_json(prompt, images=images)
            except RuntimeError as exc:
                if images and "does not support images" in str(exc).lower():
                    fallback_prompt = (
                        prompt
                        + "\nThe uploaded image could not be visually interpreted by the local model. "
                        "Do not invent ECG findings. State this limitation.\n"
                    )
                    return await self._run_ollama_json(fallback_prompt, images=None)
                raise

        if not visual_supported:
            raise RuntimeError("Gemini multimodal request is not available.")

        try:
            interaction = await self.client.aio.interactions.create(
                model=self.model_name,
                input=[
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image"
                        if mime_type.startswith("image/")
                        else "document",
                        "data": file_base64,
                        "mime_type": mime_type,
                    },
                ],
                generation_config={
                    "thinking_level": "medium"
                },
            )

        except Exception as exc:
            raise RuntimeError(
                f"Gemini multimodal request failed: {str(exc)}"
            ) from exc

        text = getattr(interaction, "output_text", None)

        if not text:
            raise RuntimeError(
                "Gemini multimodal AI returned an empty response."
            )

        return self._parse_json(text)

    # ---------------------------------------------------------
    # Shared JSON interaction
    # ---------------------------------------------------------

    async def _run_json_interaction(
        self,
        prompt: str,
    ) -> Dict[str, Any]:
        if self.provider == "ollama":
            return await self._run_ollama_json(prompt)
        return await self._run_gemini_json(prompt)

    async def _run_gemini_json(self, prompt: str) -> Dict[str, Any]:
        if self.client is None:
            raise RuntimeError(
                "Gemini AI is not configured. Set AI_PROVIDER=gemini and GEMINI_API_KEY."
            )
        try:
            interaction = await self.client.aio.interactions.create(
                model=self.model_name,
                input=prompt,
                generation_config={
                    "thinking_level": "medium"
                },
            )

        except Exception as exc:
            raise RuntimeError(
                f"Gemini AI request failed: {str(exc)}"
            ) from exc

        text = getattr(interaction, "output_text", None)

        if not text:
            raise RuntimeError(
                "Gemini AI returned an empty response."
            )

        return self._parse_json(text)

    async def _run_ollama_json(
        self,
        prompt: str,
        images: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": self.ollama_model,
            "stream": False,
            "format": "json",
            "think": False,
            "options": {
                "temperature": 0.1,
            },
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        }
        if images:
            payload["messages"][0]["images"] = images

        try:
            body = await asyncio.to_thread(self._ollama_chat, payload)
        except RuntimeError as exc:
            if "think" in str(exc).lower() and "think" in payload:
                payload.pop("think", None)
                body = await asyncio.to_thread(self._ollama_chat, payload)
            else:
                raise
        except Exception as exc:
            raise RuntimeError(
                f"Ollama is unavailable: {str(exc)}"
            ) from exc

        message = body.get("message") or {}
        text = message.get("content") or body.get("response")
        if not text:
            raise RuntimeError("Ollama AI returned an empty response.")
        return self._parse_json(str(text))

    def _ollama_chat(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        request = Request(
            f"{self.ollama_base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=180) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
            raise RuntimeError(
                f"Ollama AI request failed: HTTP {exc.code}. {error_body}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(
                f"Ollama is unavailable: {exc.reason}"
            ) from exc

        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError("Ollama AI returned a malformed response.") from exc

    # ---------------------------------------------------------
    # JSON parser
    # ---------------------------------------------------------

    def _parse_json(self, text: str) -> Dict[str, Any]:

        text = text.strip()
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

        # Remove Markdown JSON fences if returned.
        if text.startswith("```"):
            lines = text.splitlines()

            if lines and lines[0].startswith("```"):
                lines = lines[1:]

            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]

            text = "\n".join(lines).strip()

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, flags=re.DOTALL)
            if not match:
                raise RuntimeError(
                    "AI returned invalid JSON."
                )
            try:
                parsed = json.loads(match.group(0))
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    "AI returned invalid JSON."
                ) from exc

        if not isinstance(parsed, dict):
            raise RuntimeError("AI returned invalid JSON.")
        return parsed


ai_agent = EmergencyAIAgent()
