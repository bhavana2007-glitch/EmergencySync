import { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

type PatientForm = {
  patient_name: string;
  age: string;
  gender: string;
  symptoms: string;
  medical_history: string;
  medications: string;
  allergies: string;
  heart_rate: string;
  systolic_bp: string;
  diastolic_bp: string;
  spo2: string;
  respiratory_rate: string;
  temperature: string;
};

type AIResult = {
  severity?: string;
  priority?: string;
  emergency_category?: string;
  category?: string;
  summary?: string;
  recommendation?: string;
  recommended_action?: string;
  recommendations?: string[];
  confidence?: number | string;
  [key: string]: any;
};

type CaseData = {
  case_id?: string;
  status?: string;
  message?: string;
  case?: any;
  ai_analysis?: AIResult | null;
  [key: string]: any;
};

function App() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const [form, setForm] = useState<PatientForm>({
    patient_name: "",
    age: "",
    gender: "",
    symptoms: "",
    medical_history: "",
    medications: "",
    allergies: "",
    heart_rate: "",
    systolic_bp: "",
    diastolic_bp: "",
    spo2: "",
    respiratory_rate: "",
    temperature: "",
  });

  // =========================================================
  // UPDATE FORM FIELD
  // =========================================================

  const updateField = (
    field: keyof PatientForm,
    value: string
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // =========================================================
  // CHECK BACKEND
  // =========================================================

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);

      if (response.ok) {
        const data = await response.json();

        console.log("Backend health:", data);

        setBackendOnline(true);
        setAiReady(true);
      } else {
        setBackendOnline(false);
        setAiReady(false);
      }
    } catch (error) {
      console.error("Backend connection error:", error);

      setBackendOnline(false);
      setAiReady(false);
    }
  };

  // =========================================================
  // CREATE EMERGENCY CASE
  // =========================================================

  const createCase = async () => {
    if (!form.patient_name.trim()) {
      alert("Please enter patient name.");
      return;
    }

    if (!form.age) {
      alert("Please enter patient age.");
      return;
    }

    if (!form.symptoms.trim()) {
      alert("Please enter the patient's symptoms.");
      return;
    }

    if (!backendOnline) {
      alert("Backend is not connected. Please start FastAPI first.");
      return;
    }

    setLoading(true);

    try {
      /*
       * IMPORTANT:
       *
       * backend/api/cases.py defines PatientCase with
       * all vital signs as TOP-LEVEL fields.
       *
       * Therefore we DO NOT send:
       *
       * vitals: {
       *   heart_rate: ...
       * }
       *
       * Instead we send:
       *
       * heart_rate: ...
       * systolic_bp: ...
       * etc.
       */

      const payload = {
        patient_name: form.patient_name.trim(),

        age: form.age
          ? Number(form.age)
          : null,

        gender: form.gender || null,

        symptoms: form.symptoms.trim(),

        medical_history:
          form.medical_history.trim() || null,

        medications:
          form.medications.trim() || null,

        allergies:
          form.allergies.trim() || null,

        heart_rate: form.heart_rate
          ? Number(form.heart_rate)
          : null,

        systolic_bp: form.systolic_bp
          ? Number(form.systolic_bp)
          : null,

        diastolic_bp: form.diastolic_bp
          ? Number(form.diastolic_bp)
          : null,

        spo2: form.spo2
          ? Number(form.spo2)
          : null,

        respiratory_rate: form.respiratory_rate
          ? Number(form.respiratory_rate)
          : null,

        temperature: form.temperature
          ? Number(form.temperature)
          : null,
      };

      console.log(
        "Creating emergency case:",
        payload
      );

      const response = await fetch(
        `${API_BASE}/api/cases/`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      console.log(
        "Create case response:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Failed to create emergency case"
        );
      }

      setCaseData(data);

      // Clear previous AI result when creating a new case
      setAiResult(null);

      alert(
        `Emergency case created successfully!\n\nCase ID: ${
          data.case_id || "Created"
        }`
      );
    } catch (error: any) {
      console.error(
        "Create emergency case error:",
        error
      );

      alert(
        `Unable to create emergency case.\n\n${
          error.message ||
          "Please check the backend."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // REAL BACKEND AI ANALYSIS
  // =========================================================

  const analyzeCase = async () => {
    if (!caseData?.case_id) {
      alert(
        "Please create an emergency case first."
      );
      return;
    }

    if (!aiReady) {
      alert(
        "AI Agent is currently unavailable."
      );
      return;
    }

    setAnalyzing(true);
    setAiResult(null);

    try {
      /*
       * IMPORTANT:
       *
       * The backend endpoint is:
       *
       * POST /api/cases/{case_id}/analyze
       *
       * And cases.py requires:
       *
       * case: PatientCase
       *
       * Therefore the request MUST contain
       * the complete PatientCase JSON body.
       */

      const payload = {
        patient_name: form.patient_name.trim(),

        age: form.age
          ? Number(form.age)
          : null,

        gender: form.gender || null,

        symptoms: form.symptoms.trim(),

        medical_history:
          form.medical_history.trim() || null,

        medications:
          form.medications.trim() || null,

        allergies:
          form.allergies.trim() || null,

        heart_rate: form.heart_rate
          ? Number(form.heart_rate)
          : null,

        systolic_bp: form.systolic_bp
          ? Number(form.systolic_bp)
          : null,

        diastolic_bp: form.diastolic_bp
          ? Number(form.diastolic_bp)
          : null,

        spo2: form.spo2
          ? Number(form.spo2)
          : null,

        respiratory_rate: form.respiratory_rate
          ? Number(form.respiratory_rate)
          : null,

        temperature: form.temperature
          ? Number(form.temperature)
          : null,
      };

      console.log(
        "Sending patient data to REAL AI backend:",
        payload
      );

      const response = await fetch(
        `${API_BASE}/api/cases/${caseData.case_id}/analyze`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      console.log(
        "REAL AI BACKEND RESPONSE:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.error ||
            "AI analysis failed"
        );
      }

      /*
       * cases.py returns:
       *
       * {
       *   case_id: "...",
       *   status: "completed",
       *   ai_analysis: result
       * }
       *
       * Therefore we must use data.ai_analysis.
       */

      const analysis =
        data.ai_analysis;

      if (!analysis) {
        throw new Error(
          "Backend completed the request but returned no AI analysis."
        );
      }

      console.log(
        "AI analysis result:",
        analysis
      );

      setAiResult(analysis);

      setCaseData((previous) =>
        previous
          ? {
              ...previous,

              status: "analyzed",

              ai_analysis: analysis,
            }
          : previous
      );
    } catch (error: any) {
      console.error(
        "AI analysis error:",
        error
      );

      alert(
        `AI analysis failed.\n\n${
          error.message ||
          "Please check the backend AI agent."
        }`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // =========================================================
  // RESET
  // =========================================================

  const resetCase = () => {
    setForm({
      patient_name: "",
      age: "",
      gender: "",
      symptoms: "",
      medical_history: "",
      medications: "",
      allergies: "",
      heart_rate: "",
      systolic_bp: "",
      diastolic_bp: "",
      spo2: "",
      respiratory_rate: "",
      temperature: "",
    });

    setCaseData(null);
    setAiResult(null);
  };

  // =========================================================
  // SEVERITY STYLE
  // =========================================================

  const getSeverityClass = (
    severity?: string
  ) => {
    const value =
      severity?.toLowerCase();

    if (
      value === "critical" ||
      value === "emergency"
    ) {
      return "bg-red-100 text-red-700 border-red-200";
    }

    if (
      value === "high" ||
      value === "severe"
    ) {
      return "bg-orange-100 text-orange-700 border-orange-200";
    }

    if (value === "moderate") {
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    }

    return "bg-green-100 text-green-700 border-green-200";
  };

  // =========================================================
  // DISPLAY PRIORITY
  // =========================================================

  const displayedSeverity =
    aiResult?.severity ||
    aiResult?.priority;

  const displayedCategory =
    aiResult?.emergency_category ||
    aiResult?.category;

  const displayedRecommendation =
    aiResult?.recommendation ||
    aiResult?.recommended_action;

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="border-b border-slate-200 bg-white">

        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white shadow-lg">
              🚑
            </div>

            <div>

              <h1 className="text-2xl font-bold tracking-tight">
                Emergency
                <span className="text-red-600">
                  Sync
                </span>
              </h1>

              <p className="text-xs text-slate-500">
                Smart Ambulance-to-Hospital Communication
              </p>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 sm:block">
              Emergency Response System
            </div>

            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${
                backendOnline
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >

              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  backendOnline
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />

              {backendOnline
                ? "System Online"
                : "Backend Offline"}

            </div>

          </div>

        </div>

      </header>

      {/* =====================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* ===================================================
            HERO
        ==================================================== */}

        <section className="mb-8 rounded-3xl bg-gradient-to-r from-red-600 to-rose-500 p-8 text-white shadow-xl">

          <div className="max-w-3xl">

            <div className="mb-3 inline-flex rounded-full bg-white/15 px-4 py-2 text-xs font-semibold backdrop-blur">
              REAL-TIME EMERGENCY RESPONSE
            </div>

            <h2 className="text-3xl font-bold leading-tight md:text-4xl">
              Connect ambulance teams with hospitals in real time.
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-red-50 md:text-base">
              Capture patient information, monitor vital signs,
              analyze emergency data with AI, and share critical
              information with the receiving hospital before arrival.
            </p>

          </div>

        </section>

        {/* ===================================================
            STATUS CARDS
        ==================================================== */}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <StatusCard
            icon="⚡"
            title="System"
            value={
              backendOnline
                ? "Online"
                : "Offline"
            }
            description="FastAPI Backend"
            active={backendOnline}
          />

          <StatusCard
            icon="🔗"
            title="Backend"
            value={
              backendOnline
                ? "Connected"
                : "Disconnected"
            }
            description="API Connection"
            active={backendOnline}
          />

          <StatusCard
            icon="🧠"
            title="AI Agent"
            value={
              aiReady
                ? "Ready"
                : "Unavailable"
            }
            description="Clinical Analysis"
            active={aiReady}
          />

          <StatusCard
            icon="🚨"
            title="Emergency Cases"
            value={
              caseData
                ? "1 Active"
                : "0 Active"
            }
            description="Current Session"
            active={!!caseData}
          />

        </section>

        {/* ===================================================
            MAIN GRID
        ==================================================== */}

        <div className="grid gap-8 lg:grid-cols-3">

          {/* =================================================
              LEFT SIDE
          ================================================== */}

          <section className="lg:col-span-2">

            {/* =================================================
                PATIENT DATA
            ================================================== */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="mb-6 flex items-center justify-between">

                <div>

                  <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                    Step 01
                  </p>

                  <h3 className="mt-1 text-xl font-bold">
                    Patient Information
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Quickly enter critical patient information.
                  </p>

                </div>

                <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl sm:flex">
                  👤
                </div>

              </div>

              <div className="grid gap-5 md:grid-cols-2">

                <Input
                  label="Patient Name"
                  value={form.patient_name}
                  placeholder="Enter patient name"
                  onChange={(value) =>
                    updateField(
                      "patient_name",
                      value
                    )
                  }
                />

                <Input
                  label="Age"
                  value={form.age}
                  type="number"
                  placeholder="Age"
                  onChange={(value) =>
                    updateField(
                      "age",
                      value
                    )
                  }
                />

                <div>

                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Gender
                  </label>

                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    value={form.gender}
                    onChange={(event) =>
                      updateField(
                        "gender",
                        event.target.value
                      )
                    }
                  >

                    <option value="">
                      Select gender
                    </option>

                    <option value="Male">
                      Male
                    </option>

                    <option value="Female">
                      Female
                    </option>

                    <option value="Other">
                      Other
                    </option>

                  </select>

                </div>

                <Input
                  label="Allergies"
                  value={form.allergies}
                  placeholder="Known allergies"
                  onChange={(value) =>
                    updateField(
                      "allergies",
                      value
                    )
                  }
                />

                <Input
                  label="Medications"
                  value={form.medications}
                  placeholder="Current medications"
                  onChange={(value) =>
                    updateField(
                      "medications",
                      value
                    )
                  }
                />

                <div className="md:col-span-2">

                  <Textarea
                    label="Presenting Symptoms"
                    value={form.symptoms}
                    placeholder="Describe the patient's current symptoms..."
                    onChange={(value) =>
                      updateField(
                        "symptoms",
                        value
                      )
                    }
                  />

                </div>

                <div className="md:col-span-2">

                  <Textarea
                    label="Medical History"
                    value={form.medical_history}
                    placeholder="Previous conditions, surgeries, important history..."
                    onChange={(value) =>
                      updateField(
                        "medical_history",
                        value
                      )
                    }
                  />

                </div>

              </div>

            </div>

            {/* =================================================
                VITALS
            ================================================== */}

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="mb-6">

                <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                  Step 02
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  Live Vital Signs
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Enter the latest available measurements.
                </p>

              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                <VitalInput
                  label="Heart Rate"
                  unit="BPM"
                  value={form.heart_rate}
                  onChange={(value) =>
                    updateField(
                      "heart_rate",
                      value
                    )
                  }
                />

                <VitalInput
                  label="Systolic BP"
                  unit="mmHg"
                  value={form.systolic_bp}
                  onChange={(value) =>
                    updateField(
                      "systolic_bp",
                      value
                    )
                  }
                />

                <VitalInput
                  label="Diastolic BP"
                  unit="mmHg"
                  value={form.diastolic_bp}
                  onChange={(value) =>
                    updateField(
                      "diastolic_bp",
                      value
                    )
                  }
                />

                <VitalInput
                  label="SpO₂"
                  unit="%"
                  value={form.spo2}
                  onChange={(value) =>
                    updateField(
                      "spo2",
                      value
                    )
                  }
                />

                <VitalInput
                  label="Respiratory Rate"
                  unit="/min"
                  value={form.respiratory_rate}
                  onChange={(value) =>
                    updateField(
                      "respiratory_rate",
                      value
                    )
                  }
                />

                <VitalInput
                  label="Temperature"
                  unit="°C"
                  value={form.temperature}
                  onChange={(value) =>
                    updateField(
                      "temperature",
                      value
                    )
                  }
                />

              </div>

            </div>

            {/* =================================================
                ACTIONS
            ================================================== */}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={createCase}
                disabled={
                  loading ||
                  !backendOnline
                }
                className="flex-1 rounded-2xl bg-red-600 px-6 py-4 font-bold text-white shadow-lg shadow-red-200 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >

                {loading
                  ? "Creating Emergency Case..."
                  : "🚨 Create Emergency Case"}

              </button>

              <button
                onClick={resetCase}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-4 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clear
              </button>

            </div>

          </section>

          {/* =================================================
              RIGHT SIDE
          ================================================== */}

          <aside className="space-y-6">

            {/* =================================================
                CASE STATUS
            ================================================== */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="mb-5 flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
                  📋
                </div>

                <div>

                  <h3 className="font-bold">
                    Emergency Case
                  </h3>

                  <p className="text-xs text-slate-500">
                    Case information
                  </p>

                </div>

              </div>

              {caseData ? (

                <div className="space-y-4">

                  <InfoRow
                    label="Case ID"
                    value={
                      caseData.case_id ||
                      "Generated"
                    }
                  />

                  <InfoRow
                    label="Status"
                    value={
                      caseData.status ||
                      "received"
                    }
                  />

                  <div className="rounded-2xl bg-green-50 p-4">

                    <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
                      Case Created
                    </p>

                    <p className="mt-1 text-sm text-green-800">
                      Patient information has been successfully
                      sent to the EmergencySync backend.
                    </p>

                  </div>

                </div>

              ) : (

                <div className="rounded-2xl bg-slate-50 p-5 text-center">

                  <div className="text-3xl">
                    🩺
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    No active emergency case
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Enter patient details and create a case to begin.
                  </p>

                </div>

              )}

            </div>

            {/* =================================================
                AI ANALYSIS
            ================================================== */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="mb-5 flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-xl">
                  🧠
                </div>

                <div>

                  <h3 className="font-bold">
                    AI Clinical Analysis
                  </h3>

                  <p className="text-xs text-slate-500">
                    Real Backend AI Agent
                  </p>

                </div>

              </div>

              {!aiResult ? (

                <div>

                  <div className="rounded-2xl bg-slate-50 p-5">

                    <p className="text-sm leading-6 text-slate-600">
                      The EmergencySync AI agent will analyze
                      the patient's symptoms, medical history
                      and vital signs through the backend.
                    </p>

                  </div>

                  <button
                    onClick={analyzeCase}
                    disabled={
                      !caseData ||
                      analyzing ||
                      !aiReady
                    }
                    className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-4 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >

                    {analyzing
                      ? "🧠 AI Analyzing..."
                      : "🧠 Analyze Emergency"}

                  </button>

                </div>

              ) : (

                <div className="space-y-4">

                  {/* SEVERITY / PRIORITY */}

                  {displayedSeverity && (

                    <div>

                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Severity / Priority
                      </p>

                      <span
                        className={`inline-flex rounded-full border px-4 py-2 text-sm font-bold ${getSeverityClass(
                          displayedSeverity
                        )}`}
                      >
                        {String(
                          displayedSeverity
                        ).toUpperCase()}
                      </span>

                    </div>

                  )}

                  {/* EMERGENCY CATEGORY */}

                  {displayedCategory && (

                    <div>

                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Emergency Category
                      </p>

                      <p className="text-lg font-bold text-slate-800">
                        {String(
                          displayedCategory
                        )}
                      </p>

                    </div>

                  )}

                  {/* SUMMARY */}

                  {aiResult.summary && (

                    <div className="rounded-2xl bg-slate-50 p-4">

                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        AI Summary
                      </p>

                      <p className="text-sm leading-6 text-slate-700">
                        {String(
                          aiResult.summary
                        )}
                      </p>

                    </div>

                  )}

                  {/* RECOMMENDATION */}

                  {displayedRecommendation && (

                    <div className="rounded-2xl bg-blue-50 p-4">

                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                        Recommendation
                      </p>

                      <p className="text-sm leading-6 text-blue-900">
                        {String(
                          displayedRecommendation
                        )}
                      </p>

                    </div>

                  )}

                  {/* RECOMMENDATIONS ARRAY */}

                  {Array.isArray(
                    aiResult.recommendations
                  ) &&
                    aiResult.recommendations
                      .length > 0 && (

                      <div>

                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Recommendations
                        </p>

                        <ul className="space-y-2">

                          {aiResult.recommendations.map(
                            (
                              recommendation,
                              index
                            ) => (

                              <li
                                key={index}
                                className="flex gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"
                              >

                                <span>
                                  •
                                </span>

                                <span>
                                  {String(
                                    recommendation
                                  )}
                                </span>

                              </li>

                            )
                          )}

                        </ul>

                      </div>

                    )}

                  {/* CONFIDENCE */}

                  {aiResult.confidence !==
                    undefined && (

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">

                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        AI Confidence
                      </p>

                      <p className="mt-1 text-lg font-bold text-slate-800">
                        {String(
                          aiResult.confidence
                        )}
                      </p>

                    </div>

                  )}

                  {/* RAW AI FIELDS IF AVAILABLE */}

                  {!displayedSeverity &&
                    !displayedCategory &&
                    !aiResult.summary &&
                    !displayedRecommendation &&
                    !aiResult.recommendations && (

                      <div className="rounded-2xl bg-slate-50 p-4">

                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                          AI Result
                        </p>

                        <pre className="overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                          {JSON.stringify(
                            aiResult,
                            null,
                            2
                          )}
                        </pre>

                      </div>

                    )}

                  {/* SAFETY NOTICE */}

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">

                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Clinical Safety
                    </p>

                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      AI output is decision support only and
                      must be reviewed by qualified medical
                      professionals. It is not a substitute
                      for clinical judgment.
                    </p>

                  </div>

                </div>

              )}

            </div>

            {/* =================================================
                HOSPITAL COORDINATION
            ================================================== */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="mb-4 flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-xl">
                  🏥
                </div>

                <div>

                  <h3 className="font-bold">
                    Hospital Coordination
                  </h3>

                  <p className="text-xs text-slate-500">
                    Receiving hospital
                  </p>

                </div>

              </div>

              <div className="rounded-2xl bg-slate-50 p-4">

                <p className="text-sm font-semibold text-slate-700">
                  Hospital selection
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Hospital routing, ambulance location and
                  ETA will be connected in the next stage.
                </p>

              </div>

            </div>

          </aside>

        </div>

        {/* ===================================================
            FOOTER
        ==================================================== */}

        <footer className="mt-10 border-t border-slate-200 py-6 text-center">

          <p className="text-xs text-slate-500">
            EmergencySync • Smart Ambulance-to-Hospital Communication
          </p>

          <p className="mt-1 text-xs text-slate-400">
            AI-assisted emergency coordination system
          </p>

        </footer>

      </main>

    </div>
  );
}

// =============================================================
// STATUS CARD
// =============================================================

function StatusCard({
  icon,
  title,
  value,
  description,
  active,
}: {
  icon: string;
  title: string;
  value: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-start justify-between">

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl">
          {icon}
        </div>

        <span
          className={`h-2.5 w-2.5 rounded-full ${
            active
              ? "bg-green-500"
              : "bg-slate-300"
          }`}
        />

      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>

      <p className="mt-1 text-lg font-bold text-slate-800">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>

    </div>
  );
}

// =============================================================
// NORMAL INPUT
// =============================================================

function Input({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        onChange={(event) =>
          onChange(event.target.value)
        }
      />

    </div>
  );
}

// =============================================================
// TEXTAREA
// =============================================================

function Textarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>

      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        onChange={(event) =>
          onChange(event.target.value)
        }
      />

    </div>
  );
}

// =============================================================
// VITAL INPUT
// =============================================================

function VitalInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>

      <div className="flex items-center gap-2">

        <input
          type="number"
          value={value}
          placeholder="--"
          className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none"
          onChange={(event) =>
            onChange(event.target.value)
          }
        />

        <span className="text-xs font-semibold text-slate-400">
          {unit}
        </span>

      </div>

    </div>
  );
}

// =============================================================
// INFORMATION ROW
// =============================================================

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">

      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>

      <span className="max-w-[60%] break-all text-right text-sm font-bold text-slate-700">
        {value}
      </span>

    </div>
  );
}

export default App;