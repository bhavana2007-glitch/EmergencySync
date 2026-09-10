import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import PatientDashboard from "./PatientDashboard";

const API_BASE = "https://emergency-sync-vgds-one.vercel.app";
const TOKEN_KEY = "emergencysync_access_token";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function pushAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

/* ============================================================
   TYPES
   ============================================================ */

type Role =
  | "patient"
  | "nurse"
  | "ambulance"
  | "doctor"
  | "specialist"
  | "hospital";

type User = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  phone?: string | null;
  hospital_id?: number | null;
  specialty?: string | null;
  availability?: string | null;
};

type PatientForm = {
  patient_name: string;
  age: string;
  gender: string;
  blood_group: string;
  symptoms: string;
  medical_history: string;
  medications: string;
  allergies: string;
  nurse_observations: string;
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
  observations?: string[];
  possible_conditions?: string[];
  limitations?: string[];
  recommended_department?: string;
  requires_immediate_attention?: boolean;
  confidence?: number | string;
  [key: string]: unknown;
};

type CaseData = {
  case_id?: string;
  status?: string;
  message?: string;
  case?: unknown;
  ai_analysis?: AIResult | null;
  [key: string]: unknown;
};

type AmbulanceData = {
  ambulance_id: string;
  vehicle?: string;
  driver?: string;
  latitude: number;
  longitude: number;
  status?: string;
};

type ActiveAmbulanceResponse = {
  active?: boolean;
  booking_id?: string | null;
  status?: string;
  ambulance?: AmbulanceData | null;
  eta?: number | null;
  patient?: {
    id?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
  };
  hospital?: {
    id?: string;
    name?: string;
  };
};

type DashboardProps = {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  aiReady: boolean;
  form: PatientForm;
  updateField: (
    field: keyof PatientForm,
    value: string
  ) => void;
  caseData: CaseData | null;
  aiResult: AIResult | null;
  loading: boolean;
  analyzing: boolean;
  createCase: () => void;
  analyzeCase: () => void;
  analyzeUploadedFile: (documentType: "medical_report" | "physical_ecg") => void;
  loadAmbulanceCase: () => void;
  resetCase: () => void;
  structureVoice: (transcript: string) => Promise<Partial<PatientForm>>;
  voiceStructured: boolean;
  onVoiceStructured: () => void;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const emptyForm: PatientForm = {
  patient_name: "",
  age: "",
  gender: "",
  blood_group: "",
  symptoms: "",
  medical_history: "",
  medications: "",
  allergies: "",
  nurse_observations: "",
  heart_rate: "",
  systolic_bp: "",
  diastolic_bp: "",
  spo2: "",
  respiratory_rate: "",
  temperature: "",
};

/* ============================================================
   MAIN APP
   ============================================================ */

function App() {
  const [backendOnline, setBackendOnline] =
    useState(false);

  const [aiReady, setAiReady] =
    useState(false);
  const [voiceStructured, setVoiceStructured] = useState(false);

  const structureVoice = async (transcript: string) => {
    const response = await fetch(`${API_BASE}/api/cases/voice-structure`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ transcript }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || "Unable to structure the clinical handover.");
    }
    return data as Partial<PatientForm>;
  };

  const [authLoading, setAuthLoading] =
    useState(true);

  const [authSubmitting, setAuthSubmitting] =
    useState(false);

  const [authMode, setAuthMode] =
    useState<"login" | "register">("login");

  const [authError, setAuthError] =
    useState("");

  const [currentUser, setCurrentUser] =
    useState<User | null>(null);

  /* LOGIN */

  const [loginEmail, setLoginEmail] =
    useState("");

  const [loginPassword, setLoginPassword] =
    useState("");

  /* REGISTER */

  const [registerName, setRegisterName] =
    useState("");

  const [registerEmail, setRegisterEmail] =
    useState("");

  const [registerPassword, setRegisterPassword] =
    useState("");

  const [registerRole, setRegisterRole] =
    useState<Role>("patient");

  const [registerPhone, setRegisterPhone] =
    useState("");

  const [registerHospitalId, setRegisterHospitalId] =
    useState("");
  const [localHospitals, setLocalHospitals] = useState<
    Array<{ id: number; name: string; address: string }>
  >([]);

  useEffect(() => {
    if (!["nurse", "ambulance", "doctor", "specialist", "hospital"].includes(registerRole)) {
      return;
    }
    void fetch(`${API_BASE}/api/hospitals/local`)
      .then((response) => response.json())
      .then((data) => setLocalHospitals(data.hospitals || []))
      .catch(() => setLocalHospitals([]));
  }, [registerRole]);

  const [registerSpecialty, setRegisterSpecialty] =
    useState("");

  /* CASE */

  const [caseData, setCaseData] =
    useState<CaseData | null>(null);

  const [aiResult, setAiResult] =
    useState<AIResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [form, setForm] =
    useState<PatientForm>(emptyForm);

  /* ==========================================================
     HELPERS
     ========================================================== */

  const updateField = (
    field: keyof PatientForm,
    value: string
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const getToken = () =>
    localStorage.getItem(TOKEN_KEY);

  const authHeaders = (): HeadersInit => {
    const token = getToken();

    return {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    };
  };

  /* ==========================================================
     BACKEND CHECK
     ========================================================== */

  const checkBackend = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/health`
      );

      if (response.ok) {
        setBackendOnline(true);
        setAiReady(true);
      } else {
        setBackendOnline(false);
        setAiReady(false);
      }
    } catch {
      setBackendOnline(false);
      setAiReady(false);
    }
  };

  /* ==========================================================
     RESTORE LOGIN
     ========================================================== */

  const loadCurrentUser = async () => {
    const token = getToken();

    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
        return;
      }

      const data = await response.json();

      setCurrentUser(data.user);
    } catch (error) {
      console.error(
        "Authentication restore error:",
        error
      );

      localStorage.removeItem(TOKEN_KEY);
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void loadCurrentUser();
    void checkBackend();
  }, []);

  /* ==========================================================
     LOGIN
     ========================================================== */

  const submitLogin = async () => {
    setAuthError("");

    if (
      !loginEmail.trim() ||
      !loginPassword
    ) {
      setAuthError(
        "Please enter your email and password."
      );
      return;
    }

    setAuthSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: loginEmail.trim(),
            password: loginPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Invalid email or password."
        );
      }

      if (!data.access_token) {
        throw new Error(
          "Login succeeded but no access token was returned."
        );
      }

      localStorage.setItem(
        TOKEN_KEY,
        data.access_token
      );

      setCurrentUser(data.user);
      setLoginPassword("");
      setAuthError("");
    } catch (error) {
      console.error("Login error:", error);

      setAuthError(
        error instanceof Error
          ? error.message
          : "Login failed."
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  /* ==========================================================
     REGISTER
     ========================================================== */

  const submitRegister = async () => {
    setAuthError("");

    if (
      !registerName.trim() ||
      !registerEmail.trim() ||
      !registerPassword
    ) {
      setAuthError(
        "Please complete all required fields."
      );
      return;
    }

    if (registerPassword.length < 8) {
      setAuthError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    const medicalStaffRoles: Role[] = [
      "nurse",
      "ambulance",
      "doctor",
      "specialist",
      "hospital",
    ];

    const needsHospital =
      medicalStaffRoles.includes(registerRole);

    const needsSpecialty =
      registerRole === "doctor" ||
      registerRole === "specialist";

    if (
      needsHospital &&
      !registerHospitalId.trim()
    ) {
      setAuthError(
        "Hospital ID is required for this role."
      );
      return;
    }

    if (
      needsSpecialty &&
      !registerSpecialty.trim()
    ) {
      setAuthError(
        "Specialty is required for this role."
      );
      return;
    }

    let hospitalId: number | null = null;

    if (needsHospital) {
      hospitalId = Number(registerHospitalId);

      if (
        !Number.isFinite(hospitalId) ||
        hospitalId <= 0
      ) {
        setAuthError(
          "Please enter a valid Hospital ID."
        );
        return;
      }
    }

    setAuthSubmitting(true);

    try {
      const payload = {
        full_name: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        role: registerRole,
        phone: registerPhone.trim() || null,
        hospital_id: hospitalId,
        specialty: needsSpecialty
          ? registerSpecialty.trim()
          : null,
      };

      const response = await fetch(
        `${API_BASE}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        let message =
          "Registration failed.";

        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (
          data.detail &&
          typeof data.detail.message ===
            "string"
        ) {
          message = data.detail.message;
        }

        throw new Error(message);
      }

      setAuthMode("login");
      setLoginEmail(registerEmail.trim());
      setLoginPassword("");

      setAuthError(
        "Account created successfully. Please sign in."
      );
    } catch (error) {
      console.error(
        "Registration error:",
        error
      );

      setAuthError(
        error instanceof Error
          ? error.message
          : "Registration failed."
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  /* ==========================================================
     LOGOUT
     ========================================================== */

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);

    setCurrentUser(null);
    setCaseData(null);
    setAiResult(null);
    setForm(emptyForm);

    setAuthMode("login");
    setAuthError("");
  };

  /* ==========================================================
     AUTH SUBMIT
     ========================================================== */

  const handleAuthSubmit = (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (authMode === "login") {
      void submitLogin();
    } else {
      void submitRegister();
    }
  };

  /* ==========================================================
     CREATE EMERGENCY CASE
     ========================================================== */

  const createCase = async () => {
    if (loading) {
      return;
    }

    if (!form.patient_name.trim()) {
      alert("Please enter patient name.");
      return;
    }

    if (!form.age) {
      alert("Please enter patient age.");
      return;
    }

    if (!form.symptoms.trim()) {
      alert(
        "Please enter the patient's symptoms."
      );
      return;
    }

    if (!backendOnline) {
      alert(
        "Backend is not connected. Please start FastAPI."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/cases/`,
        {
          method: "POST",
          headers: pushAuthHeaders(),
          body: JSON.stringify(
            buildPatientPayload(form)
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : data.message ||
                "Failed to create emergency case."
        );
      }

      setCaseData(data);
      setAiResult(null);
    } catch (error) {
      console.error(
        "Create emergency case error:",
        error
      );

      alert(
        `Unable to create emergency case.\n\n${
          error instanceof Error
            ? error.message
            : "Please check the backend."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     AI ANALYSIS
     ========================================================== */

  const analyzeCase = async () => {
    if (analyzing) {
      return;
    }

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

    if (voiceStructured) {
      const confirmed = window.confirm(
        "Confirm the reviewed structured clinical data before starting AI analysis."
      );
      if (!confirmed) return;
    }

    setAnalyzing(true);
    setAiResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/cases/${encodeURIComponent(
          caseData.case_id
        )}/analyze`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(
            buildPatientPayload(form)
          ),
        }
      );

      const data = await response.json();
      const backendError =
        (typeof data.error === "string" && data.error) ||
        (typeof data.detail === "string" && data.detail) ||
        "";

      if (!response.ok) {
        throw new Error(
          backendError || "AI analysis failed."
        );
      }

      if (data.status === "ai_error") {
        throw new Error(
          backendError || "AI analysis failed."
        );
      }

      const analysis =
        data.ai_analysis as
          | AIResult
          | undefined;

      if (!analysis) {
        throw new Error(
          backendError ||
            "No AI analysis was returned by the server."
        );
      }

      setAiResult(analysis);
      setVoiceStructured(false);

      setCaseData((previous) =>
        previous
          ? {
              ...previous,
              status: "analyzed",
              ai_analysis: analysis,
            }
          : previous
      );
    } catch (error) {
      console.error(
        "AI analysis error:",
        error
      );

      alert(
        `AI analysis failed.\n\n${
          error instanceof Error
            ? error.message
            : "Please check the backend."
        }`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const loadAmbulanceCase = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ambulances/active`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok || !data.active || !data.patient) {
        throw new Error("No active ambulance case is available yet.");
      }
      const patient = data.patient;
      setForm({
        patient_name: patient.name || "",
        age: patient.age != null ? String(patient.age) : "",
        gender: patient.gender || "",
        blood_group: patient.blood_group || "",
        symptoms: patient.symptoms || "",
        medical_history: patient.medical_history || "",
        medications: patient.medications || "",
        allergies: patient.allergies || "",
        nurse_observations: patient.nurse_observations || "",
        heart_rate: "", systolic_bp: "", diastolic_bp: "", spo2: "",
        respiratory_rate: "", temperature: "",
      });
      setCaseData(data.case_id ? { case_id: data.case_id, status: data.status } : null);
      setAiResult(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not load the ambulance case.");
    }
  };

  const analyzeUploadedFile = async (documentType: "medical_report" | "physical_ecg") => {
    if (!caseData?.case_id) return;
    setAnalyzing(true);
    try {
      const response = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(caseData.case_id)}/analyze-file?document_type=${documentType}`, { method: "POST", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "File analysis failed.");
      setAiResult(data.ai_analysis);
      setCaseData((previous) => previous ? { ...previous, status: "analyzed", ai_analysis: data.ai_analysis } : previous);
    } catch (error) {
      alert(error instanceof Error ? error.message : "File analysis failed.");
    } finally { setAnalyzing(false); }
  };

  /* ==========================================================
     RESET
     ========================================================== */

  const resetCase = () => {
    setForm(emptyForm);
    setCaseData(null);
    setAiResult(null);
  };

  /* ==========================================================
     LOADING
     ========================================================== */

  if (authLoading) {
    return <LoadingScreen />;
  }

  /* ==========================================================
     LOGIN SCREEN
     ========================================================== */

  if (!currentUser) {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        authError={authError}
        authSubmitting={authSubmitting}
        handleAuthSubmit={handleAuthSubmit}
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        registerName={registerName}
        setRegisterName={setRegisterName}
        registerEmail={registerEmail}
        setRegisterEmail={setRegisterEmail}
        registerPassword={registerPassword}
        setRegisterPassword={setRegisterPassword}
        registerRole={registerRole}
        setRegisterRole={setRegisterRole}
        registerPhone={registerPhone}
        setRegisterPhone={setRegisterPhone}
        registerHospitalId={registerHospitalId}
        setRegisterHospitalId={
          setRegisterHospitalId
        }
        localHospitals={localHospitals}
        registerSpecialty={registerSpecialty}
        setRegisterSpecialty={
          setRegisterSpecialty
        }
      />
    );
  }

  /* ==========================================================
     ROLE ROUTING
     ========================================================== */

  const role = String(
    currentUser.role
  )
    .toLowerCase()
    .trim();

  /* PATIENT */

  if (role === "patient") {
    return (
      <PatientDashboard
        user={currentUser}
        logout={logout}
        backendOnline={backendOnline}
      />
    );
  }

  /* AMBULANCE */

  if (role === "ambulance") {
    return (
      <>
        <PushNotificationRegistration role="ambulance" />
        <AmbulanceDashboard
          user={currentUser}
          logout={logout}
          backendOnline={backendOnline}
        />
      </>
    );
  }

  const sharedProps: DashboardProps = {
    user: currentUser,
    logout,
    backendOnline,
    aiReady,
    form,
    updateField,
    caseData,
    aiResult,
    loading,
    analyzing,
    createCase,
    analyzeCase,
    analyzeUploadedFile,
    loadAmbulanceCase,
    resetCase,
    structureVoice,
    voiceStructured,
    onVoiceStructured: () => setVoiceStructured(true),
  };

  /* NURSE */

  if (role === "nurse") {
    return (
      <NurseDashboard
        {...sharedProps}
      />
    );
  }

  /* DOCTOR */

  if (role === "doctor") {
    return (
      <DoctorDashboard
        user={currentUser}
        logout={logout}
        backendOnline={backendOnline}
        caseData={caseData}
        aiResult={aiResult}
      />
    );
  }

  /* SPECIALIST */

  if (role === "specialist") {
    return (
      <>
        <PushNotificationRegistration role="specialist" />
        <SpecialistDashboard
          user={currentUser}
          logout={logout}
          backendOnline={backendOnline}
          caseData={caseData}
          aiResult={aiResult}
        />
      </>
    );
  }

  /* HOSPITAL */

  if (role === "hospital") {
    return (
      <HospitalDashboard
        user={currentUser}
        logout={logout}
        backendOnline={backendOnline}
        caseData={caseData}
        aiResult={aiResult}
      />
    );
  }

  /* UNKNOWN ROLE */

  return (
    <DashboardShell
      user={currentUser}
      logout={logout}
      backendOnline={backendOnline}
    >
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
        <div className="text-5xl">
          ⚠️
        </div>

        <h2 className="mt-4 text-2xl font-bold">
          Unknown User Role
        </h2>

        <p className="mt-2 text-slate-500">
          Your account role is:
        </p>

        <p className="mt-2 font-bold text-red-600">
          {currentUser.role}
        </p>

        <button
          onClick={logout}
          className="mt-6 rounded-xl bg-red-600 px-6 py-3 font-bold text-white"
        >
          Logout
        </button>
      </div>
    </DashboardShell>
  );
}

/* ============================================================
   PATIENT PAYLOAD
   ============================================================ */

function buildPatientPayload(
  form: PatientForm
) {
  return {
    patient_name:
      form.patient_name.trim(),

    age: form.age
      ? Number(form.age)
      : null,

    gender:
      form.gender || null,

    blood_group:
      form.blood_group.trim() ||
      "Unknown / Not available",

    symptoms:
      form.symptoms.trim(),

    medical_history:
      form.medical_history.trim() ||
      null,

    medications:
      form.medications.trim() ||
      null,

    allergies:
      form.allergies.trim() ||
      null,

    nurse_observations:
      form.nurse_observations.trim() ||
      null,

    heart_rate:
      form.heart_rate
        ? Number(form.heart_rate)
        : null,

    systolic_bp:
      form.systolic_bp
        ? Number(form.systolic_bp)
        : null,

    diastolic_bp:
      form.diastolic_bp
        ? Number(form.diastolic_bp)
        : null,

    spo2:
      form.spo2
        ? Number(form.spo2)
        : null,

    respiratory_rate:
      form.respiratory_rate
        ? Number(form.respiratory_rate)
        : null,

    temperature:
      form.temperature
        ? Number(form.temperature)
        : null,
  };
}

/* ============================================================
   LOADING SCREEN
   ============================================================ */

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-3xl">
          🚑
        </div>

        <h1 className="text-xl font-bold">
          EmergencySync
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Starting emergency response system...
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   AUTH SCREEN
   ============================================================ */

type AuthScreenProps = {
  authMode: "login" | "register";
  setAuthMode: (
    mode: "login" | "register"
  ) => void;

  authError: string;
  authSubmitting: boolean;

  handleAuthSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;

  loginEmail: string;
  setLoginEmail: (
    value: string
  ) => void;

  loginPassword: string;
  setLoginPassword: (
    value: string
  ) => void;

  registerName: string;
  setRegisterName: (
    value: string
  ) => void;

  registerEmail: string;
  setRegisterEmail: (
    value: string
  ) => void;

  registerPassword: string;
  setRegisterPassword: (
    value: string
  ) => void;

  registerRole: Role;
  setRegisterRole: (
    value: Role
  ) => void;

  registerPhone: string;
  setRegisterPhone: (
    value: string
  ) => void;

  registerHospitalId: string;
  setRegisterHospitalId: (
    value: string
  ) => void;
  localHospitals: Array<{ id: number; name: string; address: string }>;

  registerSpecialty: string;
  setRegisterSpecialty: (
    value: string
  ) => void;
};

function AuthScreen(
  props: AuthScreenProps
) {
  const {
    authMode,
    setAuthMode,
    authError,
    authSubmitting,
    handleAuthSubmit,

    loginEmail,
    setLoginEmail,

    loginPassword,
    setLoginPassword,

    registerName,
    setRegisterName,

    registerEmail,
    setRegisterEmail,

    registerPassword,
    setRegisterPassword,

    registerRole,
    setRegisterRole,

    registerPhone,
    setRegisterPhone,

    registerHospitalId,
    setRegisterHospitalId,
    localHospitals,

    registerSpecialty,
    setRegisterSpecialty,
  } = props;

  const needsHospital =
    registerRole !== "patient";

  const needsSpecialty =
    registerRole === "doctor" ||
    registerRole === "specialist";

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid-cols-2">
        <div className="hidden bg-gradient-to-br from-red-700 via-red-600 to-rose-500 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Brand light />

            <div className="mt-16 max-w-md">
              <span className="rounded-full bg-white/15 px-4 py-2 text-xs font-bold tracking-wider">
                SECURE EMERGENCY RESPONSE
              </span>

              <h2 className="mt-6 text-5xl font-bold leading-tight">
                The right information.
                <br />
                The right team.
                <br />
                Faster.
              </h2>

              <p className="mt-6 text-sm leading-7 text-red-50">
                EmergencySync connects
                patients, ambulance teams,
                nurses, doctors, specialists
                and hospitals through one
                emergency communication
                platform.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Feature
              icon="🔐"
              text="JWT Secure"
            />

            <Feature
              icon="🧠"
              text="AI Assisted"
            />

            <Feature
              icon="🏥"
              text="Hospital Ready"
            />
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Brand />
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
              Emergency Response System
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              {authMode === "login"
                ? "Welcome back"
                : "Create account"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {authMode === "login"
                ? "Sign in to access your role dashboard."
                : "Choose your role and create your account."}
            </p>

            <div className="my-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  }
                }
                className={`rounded-xl px-4 py-3 text-sm font-bold ${
                  authMode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                }}
                className={`rounded-xl px-4 py-3 text-sm font-bold ${
                  authMode === "register"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Register
              </button>
            </div>

            {authError && (
              <div
                className={`mb-5 rounded-2xl border p-4 text-sm ${
                  authError.includes(
                    "successfully"
                  )
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {authError}
              </div>
            )}

            <form
              onSubmit={handleAuthSubmit}
              className="space-y-4"
            >
              {authMode === "register" && (
                <>
                  <Input
                    label="Full Name"
                    value={registerName}
                    placeholder="Enter your full name"
                    onChange={
                      setRegisterName
                    }
                  />

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Role
                    </label>

                    <select
                      value={registerRole}
                      onChange={(event) =>
                        setRegisterRole(
                          event.target
                            .value as Role
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    >
                      <option value="patient">
                        Patient
                      </option>

                      <option value="nurse">
                        Nurse
                      </option>

                      <option value="ambulance">
                        Ambulance
                      </option>

                      <option value="doctor">
                        Doctor
                      </option>

                      <option value="specialist">
                        Specialist
                      </option>

                      <option value="hospital">
                        Hospital
                      </option>
                    </select>
                  </div>

                  <Input
                    label="Phone"
                    value={registerPhone}
                    placeholder="Phone number"
                    onChange={
                      setRegisterPhone
                    }
                  />

                  {needsHospital && (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Hospital
                      </label>
                      <select
                        value={registerHospitalId}
                        onChange={(event) => setRegisterHospitalId(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      >
                        <option value="">
                          {localHospitals.length ? "Select a registered hospital" : "No registered hospitals yet"}
                        </option>
                        {localHospitals.map((hospital) => (
                          <option key={hospital.id} value={hospital.id}>
                            {hospital.name} (ID {hospital.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {needsSpecialty && (
                    <Input
                      label="Specialty"
                      value={
                        registerSpecialty
                      }
                      placeholder="e.g. Cardiology"
                      onChange={
                        setRegisterSpecialty
                      }
                    />
                  )}
                </>
              )}

              <Input
                label="Email"
                value={
                  authMode === "login"
                    ? loginEmail
                    : registerEmail
                }
                placeholder="you@example.com"
                type="email"
                onChange={
                  authMode === "login"
                    ? setLoginEmail
                    : setRegisterEmail
                }
              />

              <Input
                label="Password"
                value={
                  authMode === "login"
                    ? loginPassword
                    : registerPassword
                }
                placeholder="Minimum 8 characters"
                type="password"
                onChange={
                  authMode === "login"
                    ? setLoginPassword
                    : setRegisterPassword
                }
              />

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full rounded-2xl bg-red-600 px-5 py-4 font-bold text-white shadow-lg transition hover:bg-red-700 disabled:opacity-60"
              >
                {authSubmitting
                  ? "Please wait..."
                  : authMode === "login"
                  ? "🔐 Sign In"
                  : "✓ Create Account"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              EmergencySync AI is
              decision-support software and
              does not replace qualified
              clinical judgment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BRAND
   ============================================================ */

function Brand({
  light = false,
}: {
  light?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${
          light
            ? "bg-white/15"
            : "bg-red-600 text-white"
        }`}
      >
        🚑
      </div>

      <div>
        <h1 className="text-3xl font-bold">
          Emergency
          <span
            className={
              light
                ? "text-red-100"
                : "text-red-600"
            }
          >
            Sync
          </span>
        </h1>

        <p
          className={`text-xs ${
            light
              ? "text-red-100"
              : "text-slate-500"
          }`}
        >
          Smart Emergency Response Platform
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   AMBULANCE DASHBOARD
   ============================================================ */

function AmbulanceDashboard({
  user,
  logout,
  backendOnline,
}: {
  user: User;
  logout: () => void;
  backendOnline: boolean;
}) {
  const [activeBooking, setActiveBooking] =
    useState<ActiveAmbulanceResponse | null>(
      null
    );

  const [loadingBooking, setLoadingBooking] =
    useState(true);

  const [accepting, setAccepting] =
    useState(false);

  const [locationSharing, setLocationSharing] =
    useState(false);

  const [gpsError, setGpsError] =
    useState("");

  const [localStatus, setLocalStatus] =
    useState("Waiting");

  const [eta, setEta] =
    useState<number | null>(null);

  const watchIdRef =
    useRef<number | null>(null);

  const ambulanceId =
    `AMB-${user.id}`;

  /* ----------------------------------------------------------
     CLEAN GPS WHEN LEAVING DASHBOARD
     ---------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );
      }
    };
  }, []);

  /* ----------------------------------------------------------
     GET ACTIVE REQUEST
     ---------------------------------------------------------- */

  const fetchActiveBooking = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/ambulances/active`,
        {
          headers: authHeadersForAmbulance(),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load ambulance request."
        );
      }

      const data =
        (await response.json()) as ActiveAmbulanceResponse;

      setActiveBooking(data);

      if (
        data.eta !== undefined
      ) {
        setEta(data.eta ?? null);
      }

      if (data.status) {
        setLocalStatus(
          formatAmbulanceStatus(
            data.status
          )
        );
      }
    } catch (error) {
      console.error(
        "Active ambulance request error:",
        error
      );
    } finally {
      setLoadingBooking(false);
    }
  };

  /* ----------------------------------------------------------
     POLL EVERY 3 SECONDS
     ---------------------------------------------------------- */

  useEffect(() => {
    void fetchActiveBooking();

    const interval =
      window.setInterval(() => {
        void fetchActiveBooking();
      }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  /* ----------------------------------------------------------
     ACCEPT REQUEST
     ---------------------------------------------------------- */

  const acceptRequest = async () => {
    if (
      !activeBooking?.booking_id
    ) {
      alert(
        "No active emergency request."
      );
      return;
    }

    setAccepting(true);

    try {
      const position =
        await getCurrentPosition();

      const payload = {
        ambulance_id:
          ambulanceId,

        vehicle:
          `Ambulance ${user.id}`,

        driver:
          user.full_name,

        latitude:
          position.coords.latitude,

        longitude:
          position.coords.longitude,
      };

      const response = await fetch(
        `${API_BASE}/api/ambulances/accept`,
        {
          method: "POST",
          headers:
            authHeadersForAmbulance(),
          body: JSON.stringify(
            payload
          ),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail ===
            "string"
            ? data.detail
            : data.message ||
                "Failed to accept ambulance request."
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "Failed to accept ambulance request."
        );
      }

      const returnedAmbulance =
        data.ambulance ||
        {
          ambulance_id:
            ambulanceId,
          vehicle:
            `Ambulance ${user.id}`,
          driver:
            user.full_name,
          latitude:
            position.coords
              .latitude,
          longitude:
            position.coords
              .longitude,
          status:
            "Assigned",
        };

      setLocalStatus("Assigned");

      setEta(
        data.eta ?? null
      );

      setActiveBooking(
        (previous) =>
          previous
            ? {
                ...previous,
                status:
                  "ambulance_assigned",
                ambulance:
                  returnedAmbulance,
                eta:
                  data.eta ?? null,
              }
            : previous
      );

      alert(
        "Emergency accepted successfully!"
      );

      startLocationSharing(
        returnedAmbulance
      );
    } catch (error) {
      console.error(
        "Accept request error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to accept emergency request."
      );
    } finally {
      setAccepting(false);
    }
  };

  /* ----------------------------------------------------------
     SEND LOCATION
     ---------------------------------------------------------- */

  const sendLocation = async (
    latitude: number,
    longitude: number
  ) => {
    const currentAmbulance =
      activeBooking?.ambulance;

    if (!currentAmbulance) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/ambulances/location`,
        {
          method: "POST",
          headers:
            authHeadersForAmbulance(),
          body: JSON.stringify({
            ambulance_id:
              currentAmbulance.ambulance_id,

            latitude,

            longitude,

            status:
              "En Route",

            eta,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail ===
            "string"
            ? data.detail
            : data.message ||
                "Unable to update location."
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "Unable to update location."
        );
      }

      setLocalStatus(
        "En Route"
      );

      setActiveBooking(
        (previous) =>
          previous
            ? {
                ...previous,
                status:
                  "En Route",
                ambulance:
                  data.ambulance ||
                  {
                    ...currentAmbulance,
                    latitude,
                    longitude,
                    status:
                      "En Route",
                  },
                eta:
                  data.eta ??
                  previous.eta ??
                  null,
              }
            : previous
      );

      if (
        data.eta !== undefined
      ) {
        setEta(
          data.eta ?? null
        );
      }
    } catch (error) {
      console.error(
        "Location update error:",
        error
      );
    }
  };

  /* ----------------------------------------------------------
     START GPS
     ---------------------------------------------------------- */

  const startLocationSharing = (
    ambulanceOverride?: AmbulanceData
  ) => {
    if (
      !navigator.geolocation
    ) {
      setGpsError(
        "Geolocation is not supported by this browser."
      );
      return;
    }

    setGpsError("");
    setLocationSharing(true);
    setLocalStatus(
      "En Route"
    );

    if (
      watchIdRef.current !== null
    ) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (position) => {
          const ambulance =
            ambulanceOverride ||
            activeBooking?.ambulance;

          if (
            ambulance
          ) {
            void sendLocation(
              position.coords
                .latitude,
              position.coords
                .longitude
            );
          }
        },

        (error) => {
          console.error(
            "GPS error:",
            error
          );

          setGpsError(
            "Unable to access GPS. Please allow location permission."
          );

          setLocationSharing(
            false
          );
        },

        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 10000,
        }
      );

    watchIdRef.current =
      watchId;
  };

  /* ----------------------------------------------------------
     STOP GPS
     ---------------------------------------------------------- */

  const stopLocationSharing =
    () => {
      if (
        watchIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );

        watchIdRef.current =
          null;
      }

      setLocationSharing(
        false
      );

      setLocalStatus(
        "Assigned"
      );
    };

  const patient =
    activeBooking?.patient;

  const hospital =
    activeBooking?.hospital;

  const ambulance =
    activeBooking?.ambulance;

  const hasRequest =
    Boolean(
      activeBooking?.active &&
        activeBooking.booking_id
    );

  const requestWaiting =
    activeBooking?.status ===
    "ambulance_requested";

  return (
    <DashboardShell
      user={user}
      logout={logout}
      backendOnline={backendOnline}
    >
      <RoleHero
        badge="AMBULANCE DASHBOARD"
        title="Mobile Emergency Command"
        description="Receive emergency requests, accept patients, share live GPS and coordinate transport with the receiving hospital."
        icon="🚑"
      />

      {/* STATUS */}

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <StatusCard
          icon="🚨"
          title="Emergency"
          value={
            loadingBooking
              ? "Loading"
              : hasRequest
              ? requestWaiting
                ? "REQUESTED"
                : "ACTIVE"
              : "Waiting"
          }
          description="Emergency request"
          active={hasRequest}
        />

        <StatusCard
          icon="🚑"
          title="Ambulance"
          value={
            ambulance
              ? "Assigned"
              : "Available"
          }
          description="Current unit"
          active={Boolean(
            ambulance
          )}
        />

        <StatusCard
          icon="📍"
          title="GPS"
          value={
            locationSharing
              ? "LIVE"
              : "Ready"
          }
          description="Location tracking"
          active={
            locationSharing
          }
        />

        <StatusCard
          icon="⏱️"
          title="ETA"
          value={
            eta !== null
              ? `${eta} min`
              : "--"
          }
          description="Hospital arrival"
          active={
            eta !== null
          }
        />
      </div>

      {/* WAITING */}

      {!loadingBooking &&
        !hasRequest && (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-5xl">
              📡
            </div>

            <h2 className="mt-5 text-2xl font-bold">
              Waiting for Emergency Requests
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
              This dashboard automatically
              checks the EmergencySync
              backend for new ambulance
              requests.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-green-50 px-5 py-3 text-sm font-bold text-green-700">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Ready for dispatch
            </div>
          </div>
        )}

      {/* ACTIVE REQUEST */}

      {hasRequest && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-600">
                    Incoming Emergency
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Patient Pickup Required
                  </h2>
                </div>

                <span
                  className={`rounded-full px-4 py-2 text-xs font-bold ${
                    requestWaiting
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {formatAmbulanceStatus(
                    activeBooking?.status
                  )}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoRow
                  label="Booking ID"
                  value={
                    activeBooking?.booking_id ||
                    "N/A"
                  }
                />

                <InfoRow
                  label="Patient"
                  value={
                    patient?.name ||
                    "Emergency Patient"
                  }
                />

                <InfoRow
                  label="Patient ID"
                  value={
                    patient?.id ||
                    "N/A"
                  }
                />

                <InfoRow
                  label="Destination"
                  value={
                    hospital?.name ||
                    "Hospital not specified"
                  }
                />
              </div>

              <div className="mt-6 rounded-2xl bg-red-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                  📍 Patient Pickup Location
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      Latitude
                    </p>

                    <p className="font-bold">
                      {patient?.latitude ??
                        "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Longitude
                    </p>

                    <p className="font-bold">
                      {patient?.longitude ??
                        "--"}
                    </p>
                  </div>
                </div>
              </div>

              {requestWaiting && (
                <button
                  onClick={() =>
                    void acceptRequest()
                  }
                  disabled={accepting}
                  className="mt-6 w-full rounded-2xl bg-red-600 px-6 py-4 font-bold text-white shadow-lg transition hover:bg-red-700 disabled:opacity-50"
                >
                  {accepting
                    ? "🚑 Accepting Emergency..."
                    : "🚑 ACCEPT EMERGENCY REQUEST"}
                </button>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle
                title="Receiving Hospital"
                subtitle="Destination information"
                icon="🏥"
              />

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Hospital
                </p>

                <p className="mt-2 text-xl font-bold">
                  {hospital?.name ||
                    "Hospital not available"}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Hospital ID:{" "}
                  {hospital?.id ||
                    "N/A"}
                </p>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle
                title="Ambulance Status"
                subtitle="Your current emergency unit"
                icon="🚑"
              />

              <div className="space-y-4">
                <InfoRow
                  label="Ambulance ID"
                  value={
                    ambulance?.ambulance_id ||
                    ambulanceId
                  }
                />

                <InfoRow
                  label="Vehicle"
                  value={
                    ambulance?.vehicle ||
                    `Ambulance ${user.id}`
                  }
                />

                <InfoRow
                  label="Driver"
                  value={
                    ambulance?.driver ||
                    user.full_name
                  }
                />

                <InfoRow
                  label="Status"
                  value={localStatus}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle
                title="Live GPS"
                subtitle="Share ambulance location"
                icon="📍"
              />

              <div
                className={`rounded-2xl p-5 ${
                  locationSharing
                    ? "bg-green-50"
                    : "bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      locationSharing
                        ? "animate-pulse bg-green-500"
                        : "bg-slate-300"
                    }`}
                  />

                  <div>
                    <p className="font-bold">
                      {locationSharing
                        ? "GPS Sharing Active"
                        : "GPS Not Sharing"}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {locationSharing
                        ? "Hospital can receive your live ambulance position."
                        : "Start GPS after accepting the emergency."}
                    </p>
                  </div>
                </div>
              </div>

              {gpsError && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-xs font-semibold text-red-700">
                  {gpsError}
                </div>
              )}

              {!locationSharing ? (
                <button
                  onClick={() =>
                    startLocationSharing()
                  }
                  disabled={!ambulance}
                  className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-4 font-bold text-white disabled:opacity-40"
                >
                  📍 Start Live GPS
                </button>
              ) : (
                <button
                  onClick={
                    stopLocationSharing
                  }
                  className="mt-4 w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700"
                >
                  Stop GPS Sharing
                </button>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle
                title="Transport Status"
                subtitle="Current emergency stage"
                icon="📡"
              />

              <div className="space-y-3">
                <TransportStep
                  number="1"
                  title="Request Received"
                  active={hasRequest}
                  completed={Boolean(
                    ambulance
                  )}
                />

                <TransportStep
                  number="2"
                  title="Ambulance Assigned"
                  active={Boolean(
                    ambulance
                  )}
                  completed={
                    localStatus ===
                    "En Route"
                  }
                />

                <TransportStep
                  number="3"
                  title="En Route"
                  active={
                    localStatus ===
                    "En Route"
                  }
                  completed={false}
                />

                <TransportStep
                  number="4"
                  title="Hospital Arrival"
                  active={false}
                  completed={false}
                />
              </div>
            </section>
          </aside>
        </div>
      )}
    </DashboardShell>
  );
}

/* ============================================================
   AMBULANCE AUTH HEADERS
   ============================================================ */

function authHeadersForAmbulance(): HeadersInit {
  const token =
    localStorage.getItem(
      TOKEN_KEY
    );

  return {
    "Content-Type":
      "application/json",

    ...(token
      ? {
          Authorization:
            `Bearer ${token}`,
        }
      : {}),
  };
}

/* ============================================================
   GPS
   ============================================================ */

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise(
    (resolve, reject) => {
      if (
        !navigator.geolocation
      ) {
        reject(
          new Error(
            "Geolocation is not supported by this browser."
          )
        );

        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy:
            true,
          timeout: 10000,
          maximumAge: 3000,
        }
      );
    }
  );
}

/* ============================================================
   STATUS FORMAT
   ============================================================ */

function formatAmbulanceStatus(
  status?: string
): string {
  if (!status) {
    return "WAITING";
  }

  return String(status)
    .replace(/_/g, " ")
    .toUpperCase();
}

/* ============================================================
   TRANSPORT STEP
   ============================================================ */

function TransportStep({
  number,
  title,
  active,
  completed,
}: {
  number: string;
  title: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
          completed
            ? "bg-green-500 text-white"
            : active
            ? "bg-red-600 text-white"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {completed
          ? "✓"
          : number}
      </div>

      <div>
        <p
          className={`text-sm font-bold ${
            active || completed
              ? "text-slate-800"
              : "text-slate-400"
          }`}
        >
          {title}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   NURSE DASHBOARD
   ============================================================ */

function NurseDashboard(
  props: DashboardProps
) {
  return (
    <DashboardShell
      user={props.user}
      logout={props.logout}
      backendOnline={
        props.backendOnline
      }
    >
      <RoleHero
        badge="NURSE DASHBOARD"
        title="Clinical Monitoring Center"
        description="Record patient information and vital signs for emergency clinical coordination."
        icon="👩‍⚕️"
      />

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <StatusCard
          icon="❤️"
          title="Monitoring"
          value="Active"
          description="Vital signs"
          active
        />

        <StatusCard
          icon="🧠"
          title="AI Agent"
          value={
            props.aiReady
              ? "Ready"
              : "Offline"
          }
          description="Clinical support"
          active={
            props.aiReady
          }
        />

        <StatusCard
          icon="🚨"
          title="Case"
          value={
            props.caseData
              ? "Active"
              : "None"
          }
          description="Current case"
          active={Boolean(
            props.caseData
          )}
        />

        <StatusCard
          icon="📡"
          title="Backend"
          value={
            props.backendOnline
              ? "Online"
              : "Offline"
          }
          description="FastAPI"
          active={
            props.backendOnline
          }
        />
      </div>

      <ClinicalDataPanel
        {...props}
        roleLabel="Nurse"
      />
    </DashboardShell>
  );
}

/* ============================================================
   DOCTOR
   ============================================================ */

function DoctorDashboard({
  user,
  logout,
  backendOnline,
  caseData,
  aiResult,
}: {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  caseData: CaseData | null;
  aiResult: AIResult | null;
}) {
  return (
    <DashboardShell
      user={user}
      logout={logout}
      backendOnline={backendOnline}
    >
      <RoleHero
        badge="DOCTOR DASHBOARD"
        title={`Welcome, Dr. ${user.full_name}`}
        description="Review emergency cases, patient information and AI-assisted clinical analysis."
        icon="🩺"
      />

      <div className="grid gap-5 md:grid-cols-3">
        <ActionCard
          icon="🚨"
          title="Emergency Cases"
          text={
            caseData
              ? "Emergency case available for review."
              : "Waiting for emergency cases."
          }
        />

        <ActionCard
          icon="❤️"
          title="Patient Vitals"
          text="Review heart rate, blood pressure, SpO₂ and other vitals."
        />

        <ActionCard
          icon="📄"
          title="ECG & Reports"
          text="Review emergency reports and uploaded clinical data."
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CaseReviewCard
          caseData={caseData}
          title="Incoming Patient"
        />

        {aiResult ? (
          <AIResultCard
            aiResult={aiResult}
          />
        ) : (
          <WaitingCard
            title="AI Analysis"
            text="AI analysis will appear here when available."
          />
        )}
      </div>
    </DashboardShell>
  );
}

/* ============================================================
   SPECIALIST
   ============================================================ */

function SpecialistDashboard({
  user,
  logout,
  backendOnline,
}: {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  caseData?: CaseData | null;
  aiResult?: AIResult | null;
}) {
  return (
    <DashboardShell
      user={user}
      logout={logout}
      backendOnline={backendOnline}
    >
      <RoleHero
        badge="SPECIALIST COMMAND CENTER"
        title={user.full_name}
        description={`Specialist review center${
          user.specialty
            ? ` • ${user.specialty}`
            : ""
        }. Review emergency cases and provide specialist input.`}
        icon="🧠"
      />
      <SpecialistAlertPanel user={user} />
    </DashboardShell>
  );
}

/* ============================================================
   HOSPITAL
   ============================================================ */

function HospitalDashboard({
  user,
  logout,
  backendOnline,
  caseData,
  aiResult,
}: {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  caseData: CaseData | null;
  aiResult: AIResult | null;
}) {
  return (
    <DashboardShell
      user={user}
      logout={logout}
      backendOnline={backendOnline}
    >
      <RoleHero
        badge="HOSPITAL COMMAND CENTER"
        title="Hospital Emergency Coordination"
        description="Receive ambulance cases, prepare the emergency team and coordinate hospital resources."
        icon="🏥"
      />

      <div className="mb-8 grid gap-5 md:grid-cols-4">
        <StatusCard
          icon="🚨"
          title="Incoming Cases"
          value={
            caseData
              ? "1"
              : "0"
          }
          description="Emergency cases"
          active={Boolean(
            caseData
          )}
        />

        <StatusCard
          icon="🚑"
          title="Ambulance"
          value={
            caseData
              ? "En Route"
              : "Waiting"
          }
          description="Patient transport"
          active={Boolean(
            caseData
          )}
        />

        <StatusCard
          icon="👨‍⚕️"
          title="Emergency Team"
          value="Ready"
          description="Hospital staff"
          active
        />

        <StatusCard
          icon="🏥"
          title="Hospital"
          value="ONLINE"
          description="Emergency department"
          active={
            backendOnline
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CaseReviewCard
          caseData={caseData}
          title="Incoming Ambulance Case"
        />

        {aiResult ? (
          <AIResultCard
            aiResult={aiResult}
          />
        ) : (
          <WaitingCard
            title="Waiting for Patient Data"
            text="Patient and AI information will appear here."
          />
        )}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <ActionCard
          icon="🛏️"
          title="Prepare Bed"
          text="Prepare an emergency bed for the incoming patient."
        />

        <ActionCard
          icon="👨‍⚕️"
          title="Notify Team"
          text="Notify emergency doctors and specialists."
        />

        <ActionCard
          icon="🩺"
          title="Prepare Department"
          text="Prepare the required department and equipment."
        />
      </div>
    </DashboardShell>
  );
}

/* ============================================================
   CLINICAL DATA PANEL
   ============================================================ */

function ClinicalDataPanel({
  form,
  updateField,
  createCase,
  analyzeCase,
  analyzeUploadedFile,
  loadAmbulanceCase,
  resetCase,
  loading,
  analyzing,
  caseData,
  aiResult,
  aiReady,
  roleLabel,
  structureVoice,
  onVoiceStructured,
}: DashboardProps & {
  roleLabel: string;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_0.8fr]">
      <div>
        {roleLabel === "Nurse" && (
          <VoiceClinicalCapture
            structureVoice={structureVoice}
            updateField={updateField}
            onStructured={onVoiceStructured}
          />
        )}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle
            step="STEP 01"
            title="Patient Information"
            subtitle={`${roleLabel} emergency patient data entry`}
            icon="👤"
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              label="Patient Name"
              value={
                form.patient_name
              }
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

            <Input
              label="Blood Group"
              value={form.blood_group}
              placeholder="Unknown / Not available"
              onChange={(value) =>
                updateField("blood_group", value)
              }
            />

            <Input
              label="Allergies"
              value={
                form.allergies
              }
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
              value={
                form.medications
              }
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
                value={
                  form.symptoms
                }
                placeholder="Describe current symptoms..."
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
                value={
                  form.medical_history
                }
                placeholder="Previous conditions, surgeries, important history..."
                onChange={(value) =>
                  updateField(
                    "medical_history",
                    value
                  )
                }
              />
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Nurse / Paramedic Observations"
                value={form.nurse_observations}
                placeholder="Unknown / Not available if no additional observations..."
                onChange={(value) =>
                  updateField("nurse_observations", value)
                }
              />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle
            step="STEP 02"
            title="Live Vital Signs"
            subtitle="Enter the latest available measurements."
            icon="❤️"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <VitalInput
              label="Heart Rate"
              unit="BPM"
              value={
                form.heart_rate
              }
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
              value={
                form.systolic_bp
              }
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
              value={
                form.diastolic_bp
              }
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
              value={
                form.spo2
              }
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
              value={
                form.respiratory_rate
              }
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
              value={
                form.temperature
              }
              onChange={(value) =>
                updateField(
                  "temperature",
                  value
                )
              }
            />
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {roleLabel === "Nurse" && (
            <button
              onClick={() => void loadAmbulanceCase()}
              className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 font-bold text-red-700"
            >
              🚑 Load Ambulance Case
            </button>
          )}
          <button
            onClick={() =>
              void createCase()
            }
            disabled={loading}
            className="flex-1 rounded-2xl bg-red-600 px-6 py-4 font-bold text-white shadow-lg transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading
              ? "Creating emergency case..."
              : "🚨 Create Emergency Case"}
          </button>

          <button
            onClick={resetCase}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-4 font-semibold text-slate-700"
          >
            Clear
          </button>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle
            title="Emergency Case"
            subtitle="Current case status"
            icon="🚨"
          />

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
                <p className="text-xs font-bold text-green-700">
                  CASE CREATED
                </p>

                <p className="mt-1 text-sm text-green-800">
                  Emergency information
                  has been sent to the
                  backend.
                </p>
              </div>
            </div>
          ) : (
            <WaitingCard
              title="No Active Case"
              text="Enter patient information and create an emergency case."
            />
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle
            title="AI Clinical Analysis"
            subtitle="EmergencySync AI Agent"
            icon="🧠"
          />

          {aiResult ? (
            <AIResultCard
              aiResult={aiResult}
            />
          ) : (
            <>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm leading-6 text-slate-600">
                  AI analyzes symptoms,
                  medical history and vital
                  signs to provide emergency
                  decision support.
                </p>
              </div>

              <button
                onClick={() =>
                  void analyzeCase()
                }
                disabled={
                  !caseData ||
                  analyzing ||
                  !aiReady
                }
                className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-4 font-bold text-white disabled:opacity-40"
              >
                {analyzing
                  ? "Analyzing with AI..."
                  : "🧠 Analyze Emergency"}
              </button>
            </>
          )}
        </div>

        <ECGAttachmentPanel
          caseId={caseData?.case_id}
          analyzing={analyzing}
          onAnalyze={analyzeUploadedFile}
        />
      </aside>
    </div>
  );
}

function VoiceClinicalCapture({
  structureVoice,
  updateField,
  onStructured,
}: {
  structureVoice: (transcript: string) => Promise<Partial<PatientForm>>;
  updateField: (field: keyof PatientForm, value: string) => void;
  onStructured: () => void;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const processingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const stop = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const applyExtractedFields = (values: Record<string, unknown>) => {
    const normalized = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase(),
        value,
      ])
    ) as Record<string, unknown>;
    const read = (...keys: string[]) =>
      keys
        .map((key) => normalized[key])
        .find((value) => {
          if (value === undefined || value === null) return false;
          const text = String(value).trim();
          return text !== "" && text !== "Unknown / Not available";
        });
    const bloodPressure = read("blood_pressure", "bp");
    const bloodPressureObject = bloodPressure && typeof bloodPressure === "object"
      ? bloodPressure as { systolic?: unknown; diastolic?: unknown }
      : null;
    const bpParts = bloodPressureObject
      ? ["", String(bloodPressureObject.systolic ?? ""), String(bloodPressureObject.diastolic ?? "")]
      : bloodPressure == null
        ? []
        : String(bloodPressure).match(/(\d+(?:\.\d+)?)\s*(?:\/|over|,|\s)\s*(\d+(?:\.\d+)?)/i) || [];
    const treatments = read("treatments_given", "treatments", "interventions");
    const currentState = read("current_state");
    const ecg = read("ecg_report", "ecg");
    const observations = read("nurse_observations", "observations");
    const observationParts = [
      currentState ? String(currentState) : "",
      treatments ? `Treatment: ${String(treatments)}` : "",
      ecg ? `ECG: ${String(ecg)}` : "",
      observations ? String(observations) : "",
    ].filter(Boolean);
    const mapped: Partial<PatientForm> = {
      patient_name: read("patient_name", "name") as string | undefined,
      age: read("age") as string | undefined,
      gender: read("gender", "sex") as string | undefined,
      blood_group: read("blood_group", "blood_type") as string | undefined,
      symptoms: read("symptoms", "presenting_symptoms") as string | undefined,
      medical_history: read("medical_history", "history") as string | undefined,
      medications: read("medications", "current_medications") as string | undefined,
      allergies: read("allergies") as string | undefined,
      nurse_observations: observationParts.length ? observationParts.join(". ") : undefined,
      heart_rate: read("heart_rate", "pulse", "hr") as string | undefined,
      systolic_bp: (read("systolic_bp", "systolic", "sbp") as string | undefined) || bpParts[1],
      diastolic_bp: (read("diastolic_bp", "diastolic", "dbp") as string | undefined) || bpParts[2],
      spo2: read("spo2", "sp_o2", "oxygen_saturation") as string | undefined,
      respiratory_rate: read("respiratory_rate", "respiratory", "rr") as string | undefined,
      temperature: read("temperature", "temp") as string | undefined,
    };
    (Object.keys(mapped) as Array<keyof PatientForm>).forEach((field) => {
      const value = mapped[field];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        updateField(field, String(value));
      }
    });
  };

  const populateFromTranscript = async (text: string) => {
    if (!text.trim()) {
      setMessage("Record a short handover before structuring it.");
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setMessage("Processing...");
    try {
      const values = await structureVoice(text);
      applyExtractedFields(values as Record<string, unknown>);
      setReviewed(true);
      onStructured();
      setMessage("Structured fields are ready for nurse review. Edit them below, then confirm before analysis.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to structure the handover.");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const start = () => {
    const Constructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setMessage("Voice capture is not supported in this browser. Please use the editable fields.");
      return;
    }
    setMessage("");
    setReviewed(false);
    setTranscript("");
    transcriptRef.current = "";
    setSeconds(0);
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let index = 0; index < event.results.length; index += 1) {
        text += `${event.results[index][0].transcript} `;
      }
      const next = text.trim();
      transcriptRef.current = next;
      setTranscript(next);
    };
    recognition.onerror = () => {
      setRecording(false);
      setMessage("Microphone access or voice recognition failed. You can re-record or enter the fields manually.");
    };
    recognition.onend = () => {
      setRecording(false);
      const finalTranscript = transcriptRef.current.trim();
      if (finalTranscript) {
        void populateFromTranscript(finalTranscript);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
    } catch {
      setMessage("Unable to start the microphone. Please check browser permission and try again.");
    }
  };

  return (
    <section className="mb-8 rounded-3xl border border-blue-200 bg-blue-50 p-6">
      <SectionTitle
        step="VOICE-FIRST ENTRY"
        title="Nurse Clinical Handover"
        subtitle="Record a short, deliberate handover. Review and edit the fields before analysis."
        icon="🎙️"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={processing}
          className="rounded-2xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {recording ? `Stop Recording (${seconds}s)` : "Start Recording"}
        </button>
        <button
          type="button"
          onClick={start}
          disabled={recording || processing}
          className="rounded-2xl border border-blue-300 bg-white px-5 py-3 font-semibold text-blue-800 disabled:opacity-50"
        >
          Re-record
        </button>
        <button
          type="button"
          onClick={() => void populateFromTranscript(transcript)}
          disabled={recording || processing || !transcript.trim()}
          className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 disabled:opacity-50"
        >
          {processing ? "Processing..." : "Structure Handover"}
        </button>
      </div>
      <textarea
        value={transcript}
        onChange={(event) => {
          const next = event.target.value;
          transcriptRef.current = next;
          setTranscript(next);
          setReviewed(false);
        }}
        rows={3}
        placeholder="Transcript appears here for review. You may correct it before structuring."
        className="mt-4 w-full rounded-2xl border border-blue-200 bg-white p-4 outline-none"
      />
      {reviewed && (
        <p className="mt-3 text-sm font-semibold text-emerald-700">
          Structured clinical data is ready for review. Explicit nurse confirmation is required before using Analyze.
        </p>
      )}
      {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
    </section>
  );
}

/* ============================================================
   DASHBOARD SHELL
   ============================================================ */

function DashboardShell({
  user,
  logout,
  backendOnline,
  children,
}: {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white shadow-lg">
              🚑
            </div>

            <div>
              <h1 className="text-2xl font-bold">
                Emergency
                <span className="text-red-600">
                  Sync
                </span>
              </h1>

              <p className="text-xs text-slate-500">
                Smart Emergency Response Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold">
                {user.full_name}
              </p>

              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                {user.role}
              </p>
            </div>

            <div
              className={`hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-bold sm:flex ${
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

            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:text-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {children}

        <footer className="mt-12 border-t border-slate-200 py-6 text-center">
          <p className="text-xs font-semibold text-slate-500">
            EmergencySync • Smart Emergency Response
          </p>

          <p className="mt-1 text-xs text-slate-400">
            AI-assisted emergency coordination system
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ============================================================
   ROLE HERO
   ============================================================ */

function RoleHero({
  badge,
  title,
  description,
  icon,
}: {
  badge: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="mb-8 rounded-3xl bg-gradient-to-r from-red-600 to-rose-500 p-8 text-white shadow-xl">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-red-100">
            {badge}
          </p>

          <h2 className="mt-3 text-4xl font-bold">
            {title}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50">
            {description}
          </p>
        </div>

        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/15 text-5xl backdrop-blur">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CASE REVIEW
   ============================================================ */

function CaseReviewCard({
  caseData,
  title,
}: {
  caseData: CaseData | null;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle
        title={title}
        subtitle="Emergency case information"
        icon="📋"
      />

      {caseData ? (
        <div className="space-y-4">
          <InfoRow
            label="Case ID"
            value={
              caseData.case_id ||
              "N/A"
            }
          />

          <InfoRow
            label="Status"
            value={
              caseData.status ||
              "received"
            }
          />

          <div className="rounded-2xl bg-red-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">
              Emergency Case Received
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              Patient information is
              available for clinical
              review.
            </p>
          </div>
        </div>
      ) : (
        <WaitingCard
          title="No Incoming Case"
          text="Waiting for an emergency case."
        />
      )}
    </div>
  );
}

/* ============================================================
   AI RESULT
   ============================================================ */

function AIResultCard({
  aiResult,
}: {
  aiResult: AIResult;
}) {
  const severity =
    aiResult.severity ||
    aiResult.priority;

  const category =
    aiResult.emergency_category ||
      aiResult.category;
  const specialist = specialistForCategory(String(category || ""));

  const recommendation =
    aiResult.recommendation ||
    aiResult.recommended_action;

  const severityText =
    String(
      severity || ""
    ).toLowerCase();

  const severityClass =
    severityText ===
      "critical" ||
    severityText ===
      "emergency"
      ? "bg-red-100 text-red-700 border-red-200"
      : severityText ===
          "high" ||
        severityText ===
          "severe"
      ? "bg-orange-100 text-orange-700 border-orange-200"
      : severityText ===
          "moderate"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-green-100 text-green-700 border-green-200";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-2xl">
          🧠
        </div>

        <div>
          <h3 className="text-lg font-bold">
            AI Clinical Analysis
          </h3>

          <p className="text-xs text-slate-500">
            EmergencySync AI Agent
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {severity && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Severity / Priority
            </p>

            <span
              className={`inline-flex rounded-full border px-4 py-2 text-sm font-bold ${severityClass}`}
            >
              {String(
                severity
              ).toUpperCase()}
            </span>
          </div>
        )}

        {category && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Emergency Category
            </p>

            <p className="mt-1 text-xl font-bold">
              {String(
                category
              )}
            </p>
          </div>
        )}

        {specialist && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
            <p className="text-xs font-bold uppercase tracking-wider">Specialist escalation</p>
            <p className="mt-1 font-bold">🚨 Notify {specialist}</p>
            <p className="mt-1 text-xs">AI routing suggestion — the responsible clinician must review the case.</p>
          </div>
        )}

        {aiResult.requires_immediate_attention && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
            <p className="font-bold">🚨 Immediate clinical review required</p>
            <p className="mt-1 text-sm">Notify the responsible doctor now and follow local emergency protocol.</p>
          </div>
        )}

        {Array.isArray(aiResult.possible_conditions) && aiResult.possible_conditions.length > 0 && (
          <ResultList title="Possible conditions for clinician review" items={aiResult.possible_conditions} />
        )}

        {Array.isArray(aiResult.observations) && aiResult.observations.length > 0 && (
          <ResultList title="Findings from the supplied information" items={aiResult.observations} />
        )}

        {aiResult.recommended_department && (
          <InfoRow label="Recommended department" value={String(aiResult.recommended_department)} />
        )}

        {aiResult.summary && (
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              AI Summary
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              {String(
                aiResult.summary
              )}
            </p>
          </div>
        )}

        {recommendation && (
          <div className="rounded-2xl bg-blue-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Recommendation
            </p>

            <p className="mt-2 text-sm leading-6 text-blue-900">
              {String(
                recommendation
              )}
            </p>
          </div>
        )}

        {Array.isArray(
          aiResult.recommendations
        ) &&
          aiResult
            .recommendations
            .length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Recommendations
              </p>

              <div className="space-y-2">
                {aiResult.recommendations.map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={index}
                      className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      •{" "}
                      {String(
                        item
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

        {aiResult.confidence !==
          undefined && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              AI Confidence
            </p>

            <p className="mt-1 text-lg font-bold">
              {String(
                aiResult.confidence
              )}
            </p>
          </div>
        )}

        {Array.isArray(aiResult.limitations) && aiResult.limitations.length > 0 && (
          <ResultList title="Information limits" items={aiResult.limitations} tone="amber" />
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Clinical Safety
          </p>

          <p className="mt-1 text-xs leading-5 text-amber-800">
            AI output is decision support
            only and must be reviewed by
            qualified medical professionals.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   WAITING
   ============================================================ */

function ResultList({
  title,
  items,
  tone = "slate",
}: {
  title: string;
  items: string[];
  tone?: "slate" | "amber";
}) {
  const classes = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
        {items.map((item, index) => <li key={index}>{String(item)}</li>)}
      </ul>
    </div>
  );
}

function normalizeSpecialtyForLookup(value: string | null | undefined): string {
  const cleaned = (value || "emergency")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\/\-_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    cardiology: "cardiology",
    cardiologist: "cardiology",
    cardiac: "cardiology",
    neurology: "neurology",
    neurologist: "neurology",
    neurological: "neurology",
    pulmonology: "pulmonology",
    pulmonary: "pulmonology",
    respiratory: "pulmonology",
    respiratorymedicine: "pulmonology",
    emergency: "emergency",
    emergencymedicine: "emergency",
    endocrinology: "endocrinology",
    metabolic: "endocrinology",
    toxicology: "toxicology",
    poisoning: "toxicology",
    criticalcare: "critical_care",
    criticalcaremedicine: "critical_care",
    critical_care: "critical_care",
    trauma: "trauma",
  };

  return aliases[cleaned] || cleaned.replace(/\s+/g, "_");
}

function SpecialistAlertPanel({ user }: { user: User }) {
  const [alerts, setAlerts] = useState<Array<{
    id: number;
    case_id: string;
    category: string;
    message: string;
    target_specialty?: string;
    severity?: string | null;
    hospital_name?: string | null;
    eta_minutes?: number | null;
    patient_age?: number | null;
    patient_gender?: string | null;
  }>>([]);
  const [selectedCase, setSelectedCase] = useState<Record<string, unknown> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [playedAlertIds, setPlayedAlertIds] = useState<Set<number>>(new Set());
  const specialty = normalizeSpecialtyForLookup(user.specialty);

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/alerts/${encodeURIComponent(specialty)}`, {
        headers: pushAuthHeaders(),
      });
      if (!r.ok) {
        return;
      }
      const d = await r.json();
      setAlerts(d.alerts || []);
    } catch {
      // Ignore polling failures; the alert panel will retry automatically.
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [specialty, user.hospital_id]);

  useEffect(() => {
    if (!soundEnabled || !alerts.length) {
      return;
    }

    const newAlertIds = alerts.filter((alert) => !playedAlertIds.has(alert.id)).map((alert) => alert.id);
    if (!newAlertIds.length) {
      return;
    }

    setPlayedAlertIds((previous) => new Set([...previous, ...newAlertIds]));
    const alert = alerts.find((candidate) => newAlertIds.includes(candidate.id));
    if (!alert) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(
      `Emergency alert. ${alert.category} specialist review required. Please acknowledge the case.`
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [alerts, playedAlertIds, soundEnabled]);

  const acknowledge = async (id: number) => {
    const response = await fetch(`${API_BASE}/api/alerts/${id}/acknowledge`, { method: "POST", headers: pushAuthHeaders(), body: JSON.stringify({ specialist_name: user.full_name }) });
    const data = await response.json();
    if (!response.ok) return alert(data.detail || "Could not acknowledge the case.");
    const caseResponse = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(data.case_id)}`);
    const caseData = await caseResponse.json();
    if (caseResponse.ok) setSelectedCase(caseData.case || null);
    void load();
  };

  const sendTestAlarm = async () => {
    setSoundEnabled(true);
    const response = await fetch(`${API_BASE}/api/alerts/test-push`, {
      method: "POST",
      headers: pushAuthHeaders(),
    });
    if (!response.ok) {
      const data = await response.json();
      window.alert(data.detail || "Could not send the specialist test alarm.");
    }
  };

  const patient = selectedCase?.patient as Record<string, unknown> | undefined;
  const aiAnalysis = selectedCase?.ai_analysis as AIResult | undefined;
  const attachments = selectedCase?.attachments as { medical_report?: boolean; physical_ecg?: boolean } | undefined;
  const ambulanceLocation = selectedCase?.ambulance_location as { latitude?: number | null; longitude?: number | null } | undefined;
  const patientLocation = selectedCase?.patient_location as { latitude?: number | null; longitude?: number | null } | undefined;
  return (
    <section className="mb-6 rounded-3xl border border-red-300 bg-red-50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-red-700">Emergency alerts</p>
        <button
          type="button"
          onClick={() => void sendTestAlarm()}
          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"
        >
          🔊 Test alarm
        </button>
      </div>
      {alerts.length === 0 && !patient && (
        <p className="text-sm text-red-800">No incoming emergency for your specialty at this hospital.</p>
      )}
      {alerts.map((a) => (
        <div key={a.id} className="mt-4 rounded-2xl bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">🔴 Incoming emergency</p>
          <p className="mt-2 font-bold text-red-700">{a.category.toUpperCase()} EMERGENCY</p>
          {a.severity && <p className="text-sm font-semibold capitalize">{a.severity}</p>}
          {a.target_specialty && (
            <p className="text-sm">{a.target_specialty.replaceAll("_", " ")} required</p>
          )}
          <p className="mt-1 text-sm">
            Patient: {a.patient_age != null ? `${a.patient_age}-year-old` : "Age not recorded"}
            {a.patient_gender ? ` ${a.patient_gender}` : ""}
          </p>
          {a.hospital_name && <p className="text-sm">Hospital: {a.hospital_name}</p>}
          {a.eta_minutes != null && <p className="text-sm">ETA: {a.eta_minutes} minutes</p>}
          <p className="mt-1 text-sm">{a.message} Case: {a.case_id}</p>
          <button onClick={() => void acknowledge(a.id)} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">ACKNOWLEDGE EMERGENCY</button>
        </div>
      ))}
      {patient && (
        <div className="mt-4 space-y-4 rounded-2xl bg-white p-5">
          <p className="font-bold text-slate-900">Acknowledged emergency case</p>
          <p className="text-sm"><strong>Case ID:</strong> {String(selectedCase?.case_id || "Not recorded")}</p>
          <p className="text-sm"><strong>Name:</strong> {String(patient.patient_name || "Not recorded")}</p>
          <p className="text-sm"><strong>Age:</strong> {String(patient.age ?? "Not recorded")}</p>
          <p className="text-sm"><strong>Blood group:</strong> {String(patient.blood_group || "Not recorded")}</p>
          <p className="text-sm"><strong>Destination hospital:</strong> {String(selectedCase?.hospital_name || "Not recorded")}</p>
          <p className="text-sm">
            <strong>Patient location:</strong>{" "}
            {patientLocation?.latitude != null && patientLocation?.longitude != null
              ? `${patientLocation.latitude}, ${patientLocation.longitude}`
              : "Not recorded"}
          </p>
          <p className="text-sm">
            <strong>Ambulance location:</strong>{" "}
            {ambulanceLocation?.latitude != null && ambulanceLocation?.longitude != null
              ? `${ambulanceLocation.latitude}, ${ambulanceLocation.longitude}`
              : "Not recorded"}
          </p>
          <p className="text-sm"><strong>ETA:</strong> {selectedCase?.eta_minutes != null ? `${String(selectedCase.eta_minutes)} minutes` : "Not recorded"}</p>
          <p className="text-sm"><strong>Symptoms:</strong> {String(patient.symptoms || "Not recorded")}</p>
          <p className="text-sm"><strong>Medical history:</strong> {String(patient.medical_history || "Not recorded")}</p>
          <p className="text-sm"><strong>Allergies:</strong> {String(patient.allergies || "Not recorded")}</p>
          <p className="text-sm"><strong>Medications:</strong> {String(patient.medications || "Not recorded")}</p>
          <p className="text-sm"><strong>HR:</strong> {String(patient.heart_rate ?? "—")} <strong>BP:</strong> {String(patient.systolic_bp ?? "—")}/{String(patient.diastolic_bp ?? "—")} <strong>SpO₂:</strong> {String(patient.spo2 ?? "—")}% <strong>RR:</strong> {String(patient.respiratory_rate ?? "—")} <strong>Temp:</strong> {String(patient.temperature ?? "—")}</p>
          <p className="text-sm"><strong>Nurse observations / current state / treatments:</strong> {String(patient.nurse_observations || "Not recorded")}</p>
          <p className="text-sm">
            <strong>ECG/report:</strong>{" "}
            {attachments?.medical_report || attachments?.physical_ecg
              ? [
                  attachments.medical_report ? "medical report attached" : "",
                  attachments.physical_ecg ? "physical ECG attached" : "",
                ].filter(Boolean).join("; ")
              : "Not attached"}
          </p>
          {aiAnalysis ? (
            <AIResultCard aiResult={aiAnalysis} />
          ) : (
            <p className="text-sm text-slate-600">No AI analysis is stored on this case.</p>
          )}
        </div>
      )}
    </section>
  );
}

function PushNotificationRegistration({
  role,
}: {
  role: "ambulance" | "specialist";
}) {
  const [status, setStatus] = useState("");
  const enablingRef = useRef(false);

  const enablePush = async (fromUserClick: boolean) => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("Browser push notifications are not supported.");
      return;
    }

    let publicKey = VAPID_PUBLIC_KEY;
    if (!publicKey) {
      const keyResponse = await fetch(`${API_BASE}/api/push/vapid-public-key`);
      if (!keyResponse.ok) {
        setStatus("Push notifications are not configured on this deployment.");
        return;
      }
      const keyData = await keyResponse.json();
      publicKey = String(keyData.public_key || "");
    }
    if (!publicKey) {
      setStatus("Push notifications are not configured on this deployment.");
      return;
    }

    const permission = fromUserClick
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== "granted") {
      if (fromUserClick) {
        setStatus("Notification permission was not granted.");
      }
      return;
    }

    await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const readyRegistration = await navigator.serviceWorker.ready;
    if (!readyRegistration.active) {
      throw new Error("The EmergencySync service worker is not active yet. Please try again.");
    }
    let subscription = await readyRegistration.pushManager.getSubscription();

if (!subscription) {
  subscription = await readyRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: (() => {
      const bytes = urlBase64ToUint8Array(publicKey);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    })(),
  });
}

    const response = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: "POST",
      headers: pushAuthHeaders(),
      body: JSON.stringify(subscription.toJSON()),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.detail || data.message || "Unable to save browser notification registration.");
    }
    setStatus("Browser emergency notifications enabled.");
  };

  useEffect(() => {
    if (enablingRef.current) return;
    enablingRef.current = true;
    void enablePush(false).catch(() => {
      enablingRef.current = false;
    });
  }, [role]);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-2xl border border-red-200 bg-white p-3 shadow-lg">
      <button
        type="button"
        onClick={() => void enablePush(true).catch((error) => {
          setStatus(error instanceof Error ? error.message : "Unable to enable notifications.");
        })}
        className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white"
      >
        Enable {role} emergency notifications
      </button>
      {status && <p className="mt-2 text-xs text-slate-600">{status}</p>}
    </div>
  );
}

function specialistForCategory(category: string): string | null {
  const routes: Record<string, string> = {
    cardiac: "the Cardiology specialist", neurological: "the Neurology specialist",
    respiratory: "the Respiratory / Emergency specialist", trauma: "the Trauma / Emergency team",
    metabolic: "the Emergency / Endocrinology team", poisoning: "the Toxicology / Emergency team",
    environmental: "the Emergency / Critical Care team", other: "the Emergency doctor",
  };
  return routes[category.toLowerCase()] || null;
}

function ECGAttachmentPanel({ caseId, analyzing, onAnalyze }: {
  caseId?: string;
  analyzing: boolean;
  onAnalyze: (type: "medical_report" | "physical_ecg") => void;
}) {
  const [medicalReport, setMedicalReport] = useState<File | null>(null);
  const [physicalEcg, setPhysicalEcg] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"medical_report" | "physical_ecg" | null>(null);

  const upload = async (type: "medical_report" | "physical_ecg", file: File | null) => {
    if (!caseId) return alert("Create or load an emergency case first.");
    if (!file) return alert("Choose a file first.");
    setUploading(type);
    try {
      const formData = new FormData(); formData.append("file", file); formData.append("document_type", type);
      const response = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/files`, { method: "POST", body: formData });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Upload failed.");
      alert(`${type === "medical_report" ? "Medical ECG/report" : "Physical ECG photo"} attached to the case.`);
    } catch (error) { alert(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(null); }
  };

  const uploadCard = (title: string, hint: string, type: "medical_report" | "physical_ecg", file: File | null, setFile: (file: File | null) => void) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-bold text-slate-800">{title}</p><p className="mt-1 text-xs text-slate-500">{hint}</p>
      <input className="mt-3 block w-full text-xs" type="file" accept="image/jpeg,image/png,application/pdf,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      <button onClick={() => void upload(type, file)} disabled={!caseId || !file || uploading !== null} className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-40">{uploading === type ? "Uploading..." : "Upload"}</button>
      <button onClick={() => void onAnalyze(type)} disabled={!caseId || analyzing} className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{analyzing ? "Analyzing..." : "Analyze with AI"}</button>
    </div>
  );

  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><SectionTitle title="ECG & Clinical Documents" subtitle="Attach a document, then request AI-assisted clinician review." icon="📄" /><div className="space-y-4">{uploadCard("Medical ECG / Report", "Digital ECG, scanned report, PDF, or CSV.", "medical_report", medicalReport, setMedicalReport)}{uploadCard("Physical ECG", "Clear photo of a paper ECG.", "physical_ecg", physicalEcg, setPhysicalEcg)}</div></section>;
}

function WaitingCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-6 text-center">
      <div className="text-4xl">
        📡
      </div>

      <p className="mt-3 font-bold text-slate-700">
        {title}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {text}
      </p>
    </div>
  );
}

/* ============================================================
   ACTION CARD
   ============================================================ */

function ActionCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">
        {icon}
      </div>

      <h3 className="mt-5 text-lg font-bold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {text}
      </p>
    </div>
  );
}

/* ============================================================
   STATUS CARD
   ============================================================ */

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

/* ============================================================
   FEATURE
   ============================================================ */

function Feature({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <div className="text-xl">
        {icon}
      </div>

      <p className="mt-2 text-xs font-semibold">
        {text}
      </p>
    </div>
  );
}

/* ============================================================
   SECTION TITLE
   ============================================================ */

function SectionTitle({
  step,
  title,
  subtitle,
  icon,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        {step && (
          <p className="text-xs font-bold uppercase tracking-wider text-red-600">
            {step}
          </p>
        )}

        <h3 className="mt-1 text-xl font-bold">
          {title}
        </h3>

        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {icon && (
        <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl sm:flex">
          {icon}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   INPUT
   ============================================================ */

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
  onChange: (
    value: string
  ) => void;
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
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

/* ============================================================
   TEXTAREA
   ============================================================ */

function Textarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (
    value: string
  ) => void;
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
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

/* ============================================================
   VITAL INPUT
   ============================================================ */

function VitalInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (
    value: string
  ) => void;
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
            onChange(
              event.target.value
            )
          }
        />

        <span className="text-xs font-semibold text-slate-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   INFO ROW
   ============================================================ */

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

/* ============================================================
   EXPORT
   ============================================================ */

export default App;
