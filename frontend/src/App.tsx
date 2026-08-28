import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import PatientDashboard from "./PatientDashboard";

const API_BASE = "http://localhost:8000";
const TOKEN_KEY = "emergencysync_access_token";

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

const emptyForm: PatientForm = {
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
};

type DashboardProps = {
  user: User;
  logout: () => void;
  backendOnline: boolean;
  aiReady: boolean;
  form: PatientForm;
  updateField: (field: keyof PatientForm, value: string) => void;
  caseData: CaseData | null;
  aiResult: AIResult | null;
  loading: boolean;
  analyzing: boolean;
  createCase: () => void;
  analyzeCase: () => void;
  resetCase: () => void;
};

function App() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<Role>("patient");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerHospitalId, setRegisterHospitalId] = useState("");
  const [registerSpecialty, setRegisterSpecialty] = useState("");

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState<PatientForm>(emptyForm);

  const updateField = (field: keyof PatientForm, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const authHeaders = (): HeadersInit => {
    const token = getToken();
    return token
      ? {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }
      : { "Content-Type": "application/json" };
  };

  const checkBackend = async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      const online = response.ok;
      setBackendOnline(online);
      setAiReady(online);
    } catch {
      setBackendOnline(false);
      setAiReady(false);
    }
  };

  const loadCurrentUser = async () => {
    const token = getToken();

    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
        return;
      }

      const data = await response.json();
      setCurrentUser(data.user);
    } catch (error) {
      console.error("Authentication restore error:", error);
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

  const submitLogin = async () => {
    setAuthError("");

    if (!loginEmail.trim() || !loginPassword) {
      setAuthError("Please enter your email and password.");
      return;
    }

    setAuthSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Invalid email or password."
        );
      }

      localStorage.setItem(TOKEN_KEY, data.access_token);
      setCurrentUser(data.user);
      setLoginPassword("");
      setAuthError("");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Login failed."
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const submitRegister = async () => {
    setAuthError("");

    if (!registerName.trim() || !registerEmail.trim() || !registerPassword) {
      setAuthError("Please complete all required fields.");
      return;
    }

    if (registerPassword.length < 8) {
      setAuthError("Password must contain at least 8 characters.");
      return;
    }

    const medicalStaffRoles: Role[] = [
      "nurse",
      "ambulance",
      "doctor",
      "specialist",
      "hospital",
    ];

    const needsHospital = medicalStaffRoles.includes(registerRole);
    const needsSpecialty =
      registerRole === "doctor" || registerRole === "specialist";

    if (needsHospital && !registerHospitalId.trim()) {
      setAuthError("Hospital ID is required for this role.");
      return;
    }

    if (needsSpecialty && !registerSpecialty.trim()) {
      setAuthError("Specialty is required for doctor and specialist accounts.");
      return;
    }

    const hospitalId = Number(registerHospitalId);

    if (needsHospital && (!Number.isFinite(hospitalId) || hospitalId <= 0)) {
      setAuthError("Please enter a valid Hospital ID.");
      return;
    }

    setAuthSubmitting(true);

    try {
      const payload = {
        full_name: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        role: registerRole,
        phone: registerPhone.trim() || null,
        hospital_id: needsHospital ? hospitalId : null,
        specialty: needsSpecialty ? registerSpecialty.trim() : null,
      };

      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : data.detail?.message || "Registration failed.";
        throw new Error(detail);
      }

      setAuthMode("login");
      setLoginEmail(registerEmail.trim());
      setLoginPassword("");
      setAuthError("Account created successfully. Please sign in.");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Registration failed."
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
    setCaseData(null);
    setAiResult(null);
    setForm(emptyForm);
    setAuthMode("login");
    setAuthError("");
  };

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMode === "login") {
      void submitLogin();
    } else {
      void submitRegister();
    }
  };

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
      const payload = buildPatientPayload(form);

      const response = await fetch(`${API_BASE}/api/cases/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : data.message || "Failed to create emergency case."
        );
      }

      setCaseData(data);
      setAiResult(null);

      alert(
        `Emergency case created successfully!\n\nCase ID: ${
          data.case_id || "Created"
        }`
      );
    } catch (error) {
      console.error("Create emergency case error:", error);
      alert(
        `Unable to create emergency case.\n\n${
          error instanceof Error ? error.message : "Please check the backend."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const analyzeCase = async () => {
    if (!caseData?.case_id) {
      alert("Please create an emergency case first.");
      return;
    }

    if (!aiReady) {
      alert("AI Agent is currently unavailable.");
      return;
    }

    setAnalyzing(true);
    setAiResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/cases/${encodeURIComponent(caseData.case_id)}/analyze`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(buildPatientPayload(form)),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : data.error || "AI analysis failed."
        );
      }

      const analysis = data.ai_analysis as AIResult | undefined;

      if (!analysis) {
        throw new Error("No AI analysis was returned by the backend.");
      }

      setAiResult(analysis);
      setCaseData((previous) =>
        previous
          ? { ...previous, status: "analyzed", ai_analysis: analysis }
          : previous
      );
    } catch (error) {
      console.error("AI analysis error:", error);
      alert(
        `AI analysis failed.\n\n${
          error instanceof Error
            ? error.message
            : "Please check the backend AI agent."
        }`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const resetCase = () => {
    setForm(emptyForm);
    setCaseData(null);
    setAiResult(null);
  };

  if (authLoading) {
    return <LoadingScreen />;
  }

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
        setRegisterHospitalId={setRegisterHospitalId}
        registerSpecialty={registerSpecialty}
        setRegisterSpecialty={setRegisterSpecialty}
      />
    );
  }

  const role = currentUser.role.toLowerCase().trim();

  if (role === "patient") {
    return (
      <PatientDashboard
        user={currentUser}
        logout={logout}
        backendOnline={backendOnline}
      />
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
    resetCase,
  };

  if (role === "nurse") {
    return <NurseDashboard {...sharedProps} />;
  }

  if (role === "ambulance") {
    return <AmbulanceDashboard {...sharedProps} />;
  }

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

  if (role === "specialist") {
    return (
      <SpecialistDashboard
        user={currentUser}
        logout={logout}
        backendOnline={backendOnline}
        caseData={caseData}
        aiResult={aiResult}
      />
    );
  }

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

  return (
    <DashboardShell
      user={currentUser}
      logout={logout}
      backendOnline={backendOnline}
    >
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
        <div className="text-5xl">⚠️</div>
        <h2 className="mt-4 text-2xl font-bold">Unknown User Role</h2>
        <p className="mt-2 text-slate-500">Your account role is:</p>
        <p className="mt-2 font-bold text-red-600">{currentUser.role}</p>
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

function buildPatientPayload(form: PatientForm) {
  return {
    patient_name: form.patient_name.trim(),
    age: form.age ? Number(form.age) : null,
    gender: form.gender || null,
    symptoms: form.symptoms.trim(),
    medical_history: form.medical_history.trim() || null,
    medications: form.medications.trim() || null,
    allergies: form.allergies.trim() || null,
    heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
    systolic_bp: form.systolic_bp ? Number(form.systolic_bp) : null,
    diastolic_bp: form.diastolic_bp ? Number(form.diastolic_bp) : null,
    spo2: form.spo2 ? Number(form.spo2) : null,
    respiratory_rate: form.respiratory_rate
      ? Number(form.respiratory_rate)
      : null,
    temperature: form.temperature ? Number(form.temperature) : null,
  };
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-3xl">
          🚑
        </div>
        <h1 className="text-xl font-bold">EmergencySync</h1>
        <p className="mt-2 text-sm text-slate-400">
          Starting emergency response system...
        </p>
      </div>
    </div>
  );
}

type AuthScreenProps = {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  authError: string;
  authSubmitting: boolean;
  handleAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loginEmail: string;
  setLoginEmail: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  registerName: string;
  setRegisterName: (value: string) => void;
  registerEmail: string;
  setRegisterEmail: (value: string) => void;
  registerPassword: string;
  setRegisterPassword: (value: string) => void;
  registerRole: Role;
  setRegisterRole: (value: Role) => void;
  registerPhone: string;
  setRegisterPhone: (value: string) => void;
  registerHospitalId: string;
  setRegisterHospitalId: (value: string) => void;
  registerSpecialty: string;
  setRegisterSpecialty: (value: string) => void;
};

function AuthScreen(props: AuthScreenProps) {
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
    registerSpecialty,
    setRegisterSpecialty,
  } = props;

  const needsHospital =
    registerRole !== "patient";

  const needsSpecialty =
    registerRole === "doctor" || registerRole === "specialist";

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
                EmergencySync connects patients, ambulance teams, nurses,
                doctors, specialists and hospitals through one emergency
                communication platform.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Feature icon="🔐" text="JWT Secure" />
            <Feature icon="🧠" text="AI Assisted" />
            <Feature icon="🏥" text="Hospital Ready" />
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
              {authMode === "login" ? "Welcome back" : "Create account"}
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
                }}
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
                  authError.includes("successfully")
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "register" && (
                <>
                  <Input
                    label="Full Name"
                    value={registerName}
                    placeholder="Enter your full name"
                    onChange={setRegisterName}
                  />

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Role
                    </label>
                    <select
                      value={registerRole}
                      onChange={(event) =>
                        setRegisterRole(event.target.value as Role)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    >
                      <option value="patient">Patient</option>
                      <option value="nurse">Nurse</option>
                      <option value="ambulance">Ambulance</option>
                      <option value="doctor">Doctor</option>
                      <option value="specialist">Specialist</option>
                      <option value="hospital">Hospital</option>
                    </select>
                  </div>

                  <Input
                    label="Phone"
                    value={registerPhone}
                    placeholder="Phone number"
                    onChange={setRegisterPhone}
                  />

                  {needsHospital && (
                    <Input
                      label="Hospital ID"
                      value={registerHospitalId}
                      type="number"
                      placeholder="Enter hospital ID"
                      onChange={setRegisterHospitalId}
                    />
                  )}

                  {needsSpecialty && (
                    <Input
                      label="Specialty"
                      value={registerSpecialty}
                      placeholder="e.g. Cardiology"
                      onChange={setRegisterSpecialty}
                    />
                  )}
                </>
              )}

              <Input
                label="Email"
                value={authMode === "login" ? loginEmail : registerEmail}
                placeholder="you@example.com"
                type="email"
                onChange={
                  authMode === "login" ? setLoginEmail : setRegisterEmail
                }
              />

              <Input
                label="Password"
                value={
                  authMode === "login" ? loginPassword : registerPassword
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
              EmergencySync AI is decision-support software and does not
              replace qualified clinical judgment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${
          light ? "bg-white/15" : "bg-red-600 text-white"
        }`}
      >
        🚑
      </div>
      <div>
        <h1 className="text-3xl font-bold">
          Emergency
          <span className={light ? "text-red-100" : "text-red-600"}>Sync</span>
        </h1>
        <p className={`text-xs ${light ? "text-red-100" : "text-slate-500"}`}>
          Smart Emergency Response Platform
        </p>
      </div>
    </div>
  );
}

function NurseDashboard(props: DashboardProps) {
  return (
    <DashboardShell
      user={props.user}
      logout={props.logout}
      backendOnline={props.backendOnline}
    >
      <RoleHero
        badge="NURSE DASHBOARD"
        title="Clinical Monitoring Center"
        description="Record patient information and vital signs for emergency clinical coordination."
        icon="👩‍⚕️"
      />
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <StatusCard icon="❤️" title="Monitoring" value="Active" description="Vital signs" active />
        <StatusCard icon="🧠" title="AI Agent" value={props.aiReady ? "Ready" : "Offline"} description="Clinical support" active={props.aiReady} />
        <StatusCard icon="🚨" title="Case" value={props.caseData ? "Active" : "None"} description="Current case" active={!!props.caseData} />
        <StatusCard icon="📡" title="Backend" value={props.backendOnline ? "Online" : "Offline"} description="FastAPI" active={props.backendOnline} />
      </div>
      <ClinicalDataPanel {...props} roleLabel="Nurse" />
    </DashboardShell>
  );
}

function AmbulanceDashboard(props: DashboardProps) {
  return (
    <DashboardShell
      user={props.user}
      logout={props.logout}
      backendOnline={props.backendOnline}
    >
      <RoleHero
        badge="AMBULANCE DASHBOARD"
        title="Mobile Emergency Command"
        description="Manage emergency patient intake, record vitals and prepare information for the receiving hospital."
        icon="🚑"
      />
      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <StatusCard icon="🚑" title="Ambulance" value="ACTIVE" description="Emergency unit" active />
        <StatusCard icon="📍" title="Location" value="Tracking" description="GPS ready" active />
        <StatusCard icon="⏱️" title="ETA" value="Updating" description="Hospital arrival" active />
        <StatusCard icon="🏥" title="Hospital" value={props.caseData ? "Notified" : "Waiting"} description="Receiving hospital" active={!!props.caseData} />
      </div>
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <ActionCard icon="📍" title="Live GPS" text="Ambulance location can be shared with the receiving hospital." />
        <ActionCard icon="🗺️" title="Hospital Route" text="Hospital routing and estimated arrival time." />
        <ActionCard icon="📡" title="Emergency Status" text="Update transport status for the receiving hospital." />
      </div>
      <ClinicalDataPanel {...props} roleLabel="Ambulance" />
    </DashboardShell>
  );
}

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
    <DashboardShell user={user} logout={logout} backendOnline={backendOnline}>
      <RoleHero
        badge="DOCTOR DASHBOARD"
        title={`Welcome, Dr. ${user.full_name}`}
        description="Review emergency cases, patient information and AI-assisted clinical analysis."
        icon="🩺"
      />
      <div className="grid gap-5 md:grid-cols-3">
        <ActionCard icon="🚨" title="Emergency Cases" text={caseData ? "Emergency case available for review." : "Waiting for emergency cases."} />
        <ActionCard icon="❤️" title="Patient Vitals" text="Review heart rate, blood pressure, SpO₂ and other vitals." />
        <ActionCard icon="📄" title="ECG & Reports" text="Review emergency reports and uploaded clinical data." />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CaseReviewCard caseData={caseData} title="Incoming Patient" />
        {aiResult ? (
          <AIResultCard aiResult={aiResult} />
        ) : (
          <WaitingCard title="AI Analysis" text="AI analysis will appear here when available." />
        )}
      </div>
    </DashboardShell>
  );
}

function SpecialistDashboard({
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
    <DashboardShell user={user} logout={logout} backendOnline={backendOnline}>
      <RoleHero
        badge="SPECIALIST COMMAND CENTER"
        title={user.full_name}
        description={`Specialist review center${user.specialty ? ` • ${user.specialty}` : ""}. Review emergency cases and provide specialist input.`}
        icon="🧠"
      />
      {caseData ? (
        <>
          <div className="mb-6 rounded-3xl border border-red-300 bg-red-50 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-red-600">EMERGENCY ALERT</p>
            <h2 className="mt-2 text-2xl font-bold">Patient Review Required</h2>
            <p className="mt-2 text-sm text-slate-600">
              Case ID: <strong>{caseData.case_id || "N/A"}</strong>
            </p>
          </div>
          {aiResult ? (
            <AIResultCard aiResult={aiResult} />
          ) : (
            <WaitingCard title="Waiting for AI Analysis" text="The emergency case has been received." />
          )}
        </>
      ) : (
        <WaitingCard title="No Emergency Alert" text="Monitoring for emergency cases." />
      )}
    </DashboardShell>
  );
}

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
    <DashboardShell user={user} logout={logout} backendOnline={backendOnline}>
      <RoleHero
        badge="HOSPITAL COMMAND CENTER"
        title="Hospital Emergency Coordination"
        description="Receive ambulance cases, prepare the emergency team and coordinate hospital resources."
        icon="🏥"
      />
      <div className="mb-8 grid gap-5 md:grid-cols-4">
        <StatusCard icon="🚨" title="Incoming Cases" value={caseData ? "1" : "0"} description="Emergency cases" active={!!caseData} />
        <StatusCard icon="🚑" title="Ambulance" value={caseData ? "En Route" : "Waiting"} description="Patient transport" active={!!caseData} />
        <StatusCard icon="👨‍⚕️" title="Emergency Team" value="Ready" description="Hospital staff" active />
        <StatusCard icon="🏥" title="Hospital" value="ONLINE" description="Emergency department" active={backendOnline} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CaseReviewCard caseData={caseData} title="Incoming Ambulance Case" />
        {aiResult ? (
          <AIResultCard aiResult={aiResult} />
        ) : (
          <WaitingCard title="Waiting for Patient Data" text="Patient and AI information will appear here." />
        )}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <ActionCard icon="🛏️" title="Prepare Bed" text="Prepare an emergency bed for the incoming patient." />
        <ActionCard icon="👨‍⚕️" title="Notify Team" text="Notify emergency doctors and specialists." />
        <ActionCard icon="🩺" title="Prepare Department" text="Prepare the required department and equipment." />
      </div>
    </DashboardShell>
  );
}

function ClinicalDataPanel({
  form,
  updateField,
  createCase,
  analyzeCase,
  resetCase,
  loading,
  analyzing,
  caseData,
  aiResult,
  aiReady,
  roleLabel,
}: DashboardProps & { roleLabel: string }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_0.8fr]">
      <div>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle step="STEP 01" title="Patient Information" subtitle={`${roleLabel} emergency patient data entry`} icon="👤" />
          <div className="grid gap-5 md:grid-cols-2">
            <Input label="Patient Name" value={form.patient_name} placeholder="Enter patient name" onChange={(v) => updateField("patient_name", v)} />
            <Input label="Age" value={form.age} type="number" placeholder="Age" onChange={(v) => updateField("age", v)} />
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => updateField("gender", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input label="Allergies" value={form.allergies} placeholder="Known allergies" onChange={(v) => updateField("allergies", v)} />
            <Input label="Medications" value={form.medications} placeholder="Current medications" onChange={(v) => updateField("medications", v)} />
            <div className="md:col-span-2">
              <Textarea label="Presenting Symptoms" value={form.symptoms} placeholder="Describe current symptoms..." onChange={(v) => updateField("symptoms", v)} />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Medical History" value={form.medical_history} placeholder="Previous conditions, surgeries, important history..." onChange={(v) => updateField("medical_history", v)} />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle step="STEP 02" title="Live Vital Signs" subtitle="Enter the latest available measurements." icon="❤️" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <VitalInput label="Heart Rate" unit="BPM" value={form.heart_rate} onChange={(v) => updateField("heart_rate", v)} />
            <VitalInput label="Systolic BP" unit="mmHg" value={form.systolic_bp} onChange={(v) => updateField("systolic_bp", v)} />
            <VitalInput label="Diastolic BP" unit="mmHg" value={form.diastolic_bp} onChange={(v) => updateField("diastolic_bp", v)} />
            <VitalInput label="SpO₂" unit="%" value={form.spo2} onChange={(v) => updateField("spo2", v)} />
            <VitalInput label="Respiratory Rate" unit="/min" value={form.respiratory_rate} onChange={(v) => updateField("respiratory_rate", v)} />
            <VitalInput label="Temperature" unit="°C" value={form.temperature} onChange={(v) => updateField("temperature", v)} />
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => void createCase()}
            disabled={loading}
            className="flex-1 rounded-2xl bg-red-600 px-6 py-4 font-bold text-white shadow-lg transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Creating Emergency Case..." : "🚨 Create Emergency Case"}
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
          <SectionTitle title="Emergency Case" subtitle="Current case status" icon="🚨" />
          {caseData ? (
            <div className="space-y-4">
              <InfoRow label="Case ID" value={caseData.case_id || "Generated"} />
              <InfoRow label="Status" value={caseData.status || "received"} />
              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-xs font-bold text-green-700">CASE CREATED</p>
                <p className="mt-1 text-sm text-green-800">Emergency information has been sent to the backend.</p>
              </div>
            </div>
          ) : (
            <WaitingCard title="No Active Case" text="Enter patient information and create an emergency case." />
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="AI Clinical Analysis" subtitle="EmergencySync AI Agent" icon="🧠" />
          {aiResult ? (
            <AIResultCard aiResult={aiResult} />
          ) : (
            <>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm leading-6 text-slate-600">
                  AI analyzes symptoms, medical history and vital signs to provide emergency decision support.
                </p>
              </div>
              <button
                onClick={() => void analyzeCase()}
                disabled={!caseData || analyzing || !aiReady}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-4 font-bold text-white disabled:opacity-40"
              >
                {analyzing ? "🧠 AI Analyzing..." : "🧠 Analyze Emergency"}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

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
                Emergency<span className="text-red-600">Sync</span>
              </h1>
              <p className="text-xs text-slate-500">Smart Emergency Response Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold">{user.full_name}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">{user.role}</p>
            </div>
            <div className={`hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-bold sm:flex ${backendOnline ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${backendOnline ? "bg-green-500" : "bg-red-500"}`} />
              {backendOnline ? "System Online" : "Backend Offline"}
            </div>
            <button onClick={logout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:text-red-600">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {children}
        <footer className="mt-12 border-t border-slate-200 py-6 text-center">
          <p className="text-xs font-semibold text-slate-500">EmergencySync • Smart Emergency Response</p>
          <p className="mt-1 text-xs text-slate-400">AI-assisted emergency coordination system</p>
        </footer>
      </main>
    </div>
  );
}

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
          <p className="text-xs font-bold tracking-[0.2em] text-red-100">{badge}</p>
          <h2 className="mt-3 text-4xl font-bold">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50">{description}</p>
        </div>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/15 text-5xl backdrop-blur">
          {icon}
        </div>
      </div>
    </div>
  );
}

function CaseReviewCard({
  caseData,
  title,
}: {
  caseData: CaseData | null;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle title={title} subtitle="Emergency case information" icon="📋" />
      {caseData ? (
        <div className="space-y-4">
          <InfoRow label="Case ID" value={caseData.case_id || "N/A"} />
          <InfoRow label="Status" value={caseData.status || "received"} />
          <div className="rounded-2xl bg-red-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">Emergency Case Received</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">Patient information is available for clinical review.</p>
          </div>
        </div>
      ) : (
        <WaitingCard title="No Incoming Case" text="Waiting for an emergency case." />
      )}
    </div>
  );
}

function AIResultCard({ aiResult }: { aiResult: AIResult }) {
  const severity = aiResult.severity || aiResult.priority;
  const category = aiResult.emergency_category || aiResult.category;
  const recommendation = aiResult.recommendation || aiResult.recommended_action;
  const severityText = String(severity || "").toLowerCase();

  const severityClass =
    severityText === "critical" || severityText === "emergency"
      ? "bg-red-100 text-red-700 border-red-200"
      : severityText === "high" || severityText === "severe"
      ? "bg-orange-100 text-orange-700 border-orange-200"
      : severityText === "moderate"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-green-100 text-green-700 border-green-200";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-2xl">🧠</div>
        <div>
          <h3 className="text-lg font-bold">AI Clinical Analysis</h3>
          <p className="text-xs text-slate-500">EmergencySync AI Agent</p>
        </div>
      </div>

      <div className="space-y-5">
        {severity && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Severity / Priority</p>
            <span className={`inline-flex rounded-full border px-4 py-2 text-sm font-bold ${severityClass}`}>
              {String(severity).toUpperCase()}
            </span>
          </div>
        )}

        {category && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Emergency Category</p>
            <p className="mt-1 text-xl font-bold">{String(category)}</p>
          </div>
        )}

        {aiResult.summary && (
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">AI Summary</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{String(aiResult.summary)}</p>
          </div>
        )}

        {recommendation && (
          <div className="rounded-2xl bg-blue-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Recommendation</p>
            <p className="mt-2 text-sm leading-6 text-blue-900">{String(recommendation)}</p>
          </div>
        )}

        {Array.isArray(aiResult.recommendations) && aiResult.recommendations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Recommendations</p>
            <div className="space-y-2">
              {aiResult.recommendations.map((item, index) => (
                <div key={index} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  • {String(item)}
                </div>
              ))}
            </div>
          </div>
        )}

        {aiResult.confidence !== undefined && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">AI Confidence</p>
            <p className="mt-1 text-lg font-bold">{String(aiResult.confidence)}</p>
          </div>
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Clinical Safety</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            AI output is decision support only and must be reviewed by qualified medical professionals.
          </p>
        </div>
      </div>
    </div>
  );
}

function WaitingCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-6 text-center">
      <div className="text-4xl">📡</div>
      <p className="mt-3 font-bold text-slate-700">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">{icon}</div>
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

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
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl">{icon}</div>
        <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-green-500" : "bg-slate-300"}`} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-1 text-lg font-bold text-slate-800">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <div className="text-xl">{icon}</div>
      <p className="mt-2 text-xs font-semibold">{text}</p>
    </div>
  );
}

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
        {step && <p className="text-xs font-bold uppercase tracking-wider text-red-600">{step}</p>}
        <h3 className="mt-1 text-xl font-bold">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {icon && <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl sm:flex">{icon}</div>}
    </div>
  );
}

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
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

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
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

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
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          placeholder="--"
          className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-xs font-semibold text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="max-w-[60%] break-all text-right text-sm font-bold text-slate-700">{value}</span>
    </div>
  );
}

export default App;