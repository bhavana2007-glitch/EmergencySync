import os
import json
import base64
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from google import genai


load_dotenv()


class EmergencyAIAgent:
    """
    EmergencySync backend AI agent.

    Provides AI-assisted clinical decision support.
    It does not replace a qualified medical professional.
    """

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")

        if not self.api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured in backend/.env"
            )

        self.client = genai.Client(api_key=self.api_key)

        self.model_name = "gemini-3.6-flash"

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
    "observations": [],
    "possible_conditions": [],
    "confidence": 0.0,
    "recommended_department": "",
    "requires_immediate_attention": false,
    "clinical_review_required": true,
    "limitations": []
}}
"""

        return await self._run_json_interaction(prompt)

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

        # Read the uploaded file
        file_bytes = path.read_bytes()

        # Encode it for the Gemini Interactions API
        file_base64 = base64.b64encode(file_bytes).decode("utf-8")

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
- A qualified healthcare professional must review the findings.
- For potentially life-threatening findings, clearly indicate that
  immediate professional assessment may be required.

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
    "limitations": []
}}
"""

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
    # Shared Gemini JSON interaction
    # ---------------------------------------------------------

    async def _run_json_interaction(
        self,
        prompt: str,
    ) -> Dict[str, Any]:

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

    # ---------------------------------------------------------
    # JSON parser
    # ---------------------------------------------------------

    def _parse_json(self, text: str) -> Dict[str, Any]:

        text = text.strip()

        # Remove Markdown JSON fences if returned.
        if text.startswith("```"):
            lines = text.splitlines()

            if lines and lines[0].startswith("```"):
                lines = lines[1:]

            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]

            text = "\n".join(lines).strip()

        try:
            return json.loads(text)

        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "Gemini AI returned invalid JSON."
            ) from exc


ai_agent = EmergencyAIAgent()