import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = "http://localhost:8000";
const CHENNAI_CENTER: [number, number] = [13.0827, 80.2707];
const TOKEN_KEY = "emergencysync_access_token";

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

type PatientDetails = {
  age: string;
  gender: string;
  symptoms: string;
  medical_history: string;
  medications: string;
  allergies: string;
};

type Hospital = {
  id: number | string;
  name: string;
  address: string;
  district?: string;
  latitude: number;
  longitude: number;
  phone?: string;
  emergency_available?: boolean;
  beds_available?: number;
  hospital_type?: string;
  [key: string]: any;
};

type Ambulance = {
  id?: number | string;
  ambulance_id?: number | string;
  vehicle?: string;
  driver?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  eta?: number | string;
  [key: string]: any;
};

type PatientDashboardProps = {
  user: User;
  logout: () => void;
  backendOnline: boolean;
};

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function numberValue(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ============================================================
// NORMALISE HOSPITAL
// ============================================================

function normaliseHospital(raw: any): Hospital | null {
  if (!raw) {
    return null;
  }

  const location = raw?.location ?? {};

  const latitude = numberValue(
    raw?.latitude ??
      raw?.lat ??
      location?.latitude ??
      location?.lat
  );

  const longitude = numberValue(
    raw?.longitude ??
      raw?.lng ??
      raw?.lon ??
      location?.longitude ??
      location?.lng ??
      location?.lon
  );

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    ...raw,

    id:
      raw?.id ??
      raw?.hospital_id ??
      raw?.hospitalId ??
      raw?.name ??
      `${latitude}-${longitude}`,

    name:
      raw?.name ??
      raw?.hospital_name ??
      raw?.hospitalName ??
      "Chennai Hospital",

    address:
      raw?.address ??
      raw?.display_name ??
      raw?.location_name ??
      raw?.area ??
      "Chennai, Tamil Nadu",

    district:
      raw?.district ??
      "Chennai",

    latitude,
    longitude,

    phone:
      raw?.phone ??
      raw?.phone_number ??
      raw?.contact,

    emergency_available:
      raw?.emergency_available ??
      raw?.emergency_department ??
      raw?.emergency ??
      true,

    beds_available:
      raw?.beds_available ??
      raw?.available_beds ??
      raw?.beds,

    hospital_type:
      raw?.hospital_type ??
      raw?.type ??
      "hospital",
  };
}

// ============================================================
// NORMALISE AMBULANCE
// ============================================================

function normaliseAmbulance(
  raw: any
): Ambulance | null {
  if (!raw) {
    return null;
  }

  const source =
    raw?.ambulance ??
    raw?.data ??
    raw;

  const location =
    source?.location ?? {};

  const latitude = numberValue(
    source?.latitude ??
      source?.lat ??
      location?.latitude ??
      location?.lat
  );

  const longitude = numberValue(
    source?.longitude ??
      source?.lng ??
      source?.lon ??
      location?.longitude ??
      location?.lng ??
      location?.lon
  );

  return {
    ...source,

    latitude:
      latitude ?? undefined,

    longitude:
      longitude ?? undefined,

    vehicle:
      source?.vehicle ??
      source?.vehicleNumber ??
      source?.registration_number ??
      undefined,

    driver:
      source?.driver ??
      source?.driverName ??
      undefined,

    status:
      source?.status ??
      raw?.status ??
      "En Route",

    eta:
      source?.eta ??
      raw?.eta ??
      source?.eta_minutes,
  };
}

// ============================================================
// NORMALISE HOSPITAL RESPONSE
// ============================================================

function normaliseHospitals(
  data: any
): Hospital[] {
  const candidates =
    Array.isArray(data)
      ? data
      : data?.hospitals ??
        data?.data ??
        data?.results ??
        data?.items ??
        [];

  return candidates
    .map(normaliseHospital)
    .filter(
      (
        item: Hospital | null
      ): item is Hospital =>
        item !== null
    );
}

// ============================================================
// NORMALISE AMBULANCE RESPONSE
// ============================================================

function normaliseAmbulances(
  data: any
): Ambulance[] {
  const candidates =
    Array.isArray(data)
      ? data
      : data?.ambulances ??
        data?.data ??
        data?.results ??
        (data?.ambulance
          ? [data.ambulance]
          : [data]);

  return candidates
    .map(normaliseAmbulance)
    .filter(
      (
        item: Ambulance | null
      ): item is Ambulance =>
        item !== null
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PatientDashboard({
  user,
  logout,
  backendOnline,
}: PatientDashboardProps) {
  // ==========================================================
  // PATIENT DETAILS
  // ==========================================================

  const [details, setDetails] =
    useState<PatientDetails>({
      age: "",
      gender: "",
      symptoms: "",
      medical_history: "",
      medications: "",
      allergies: "",
    });

  // ==========================================================
  // HOSPITAL STATE
  // ==========================================================

  const [hospitals, setHospitals] =
    useState<Hospital[]>([]);

  const [
    selectedHospitalId,
    setSelectedHospitalId,
  ] = useState<number | string | "">("");

  const [
    hospitalSearch,
    setHospitalSearch,
  ] = useState("");

  const [
    searchingHospitals,
    setSearchingHospitals,
  ] = useState(false);

  // ==========================================================
  // LOCATION
  // ==========================================================

  const [
    patientLocation,
    setPatientLocation,
  ] = useState<[number, number]>(
    CHENNAI_CENTER
  );

  const [
    locationMessage,
    setLocationMessage,
  ] = useState(
    "Waiting for your live location..."
  );

  // ==========================================================
  // AMBULANCE
  // ==========================================================

  const [
    ambulance,
    setAmbulance,
  ] = useState<Ambulance | null>(null);

  // ==========================================================
  // UI STATE
  // ==========================================================

  const [
    loadingHospitals,
    setLoadingHospitals,
  ] = useState(false);

  const [
    booking,
    setBooking,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  // ==========================================================
  // LEAFLET REFS
  // ==========================================================

  const mapElementRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const patientMarkerRef =
    useRef<L.Marker | null>(null);

  const ambulanceMarkerRef =
    useRef<L.Marker | null>(null);

  const hospitalMarkersRef =
    useRef<L.LayerGroup | null>(null);

  // ==========================================================
  // SELECTED HOSPITAL
  // ==========================================================

  const selectedHospital =
    useMemo(
      () =>
        hospitals.find(
          (hospital) =>
            String(hospital.id) ===
            String(selectedHospitalId)
        ) ?? null,
      [
        hospitals,
        selectedHospitalId,
      ]
    );

  // ==========================================================
  // PATIENT ICON
  // ==========================================================

  const patientIcon =
    useMemo(
      () =>
        L.divIcon({
          className:
            "emergencysync-map-icon",

          html: `
            <div style="
              width:42px;
              height:42px;
              border-radius:50%;
              background:#dc2626;
              border:4px solid white;
              box-shadow:0 3px 12px rgba(0,0,0,.30);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:22px;
            ">
              📍
            </div>
          `,

          iconSize: [42, 42],

          iconAnchor: [
            21,
            21,
          ],
        }),
      []
    );

  // ==========================================================
  // AMBULANCE ICON
  // ==========================================================

  const ambulanceIcon =
    useMemo(
      () =>
        L.divIcon({
          className:
            "emergencysync-map-icon",

          html: `
            <div style="
              width:46px;
              height:46px;
              border-radius:50%;
              background:#111827;
              border:4px solid white;
              box-shadow:0 3px 12px rgba(0,0,0,.30);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:24px;
            ">
              🚑
            </div>
          `,

          iconSize: [46, 46],

          iconAnchor: [
            23,
            23,
          ],
        }),
      []
    );

  // ==========================================================
  // HOSPITAL ICON
  // ==========================================================

  const hospitalIcon =
    useMemo(
      () =>
        L.divIcon({
          className:
            "emergencysync-map-icon",

          html: `
            <div style="
              width:38px;
              height:38px;
              border-radius:50%;
              background:white;
              border:3px solid #2563eb;
              box-shadow:0 2px 9px rgba(0,0,0,.25);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:19px;
            ">
              🏥
            </div>
          `,

          iconSize: [38, 38],

          iconAnchor: [
            19,
            19,
          ],
        }),
      []
    );

  // ==========================================================
  // LIVE HOSPITAL SEARCH
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const searchHospitals =
      async () => {
        const search =
          hospitalSearch.trim();

        // Don't search until at least
        // two characters are entered.
        if (search.length < 2) {
          setHospitals([]);
          setSearchingHospitals(false);
          setLoadingHospitals(false);
          return;
        }

        setSearchingHospitals(true);
        setLoadingHospitals(true);
        setError("");

        try {
          const response =
            await fetch(
              `${API_BASE}/api/hospitals?district=Chennai&search=${encodeURIComponent(
                search
              )}`,
              {
                headers:
                  authHeaders(),
              }
            );

          const data =
            await readJson(
              response
            );

          if (!response.ok) {
            throw new Error(
              data?.detail ??
                data?.message ??
                "Unable to search Chennai hospitals."
            );
          }

          const results =
            normaliseHospitals(
              data
            );

          if (!cancelled) {
            setHospitals(results);

            // Clear previous selection
            setSelectedHospitalId("");

            if (
              results.length === 0
            ) {
              setError(
                `No Chennai hospital found for "${search}". Try another hospital name.`
              );
            }
          }
        } catch (err: any) {
          if (!cancelled) {
            setHospitals([]);

            setError(
              err?.message ??
                "Unable to search Chennai hospitals."
            );
          }
        } finally {
          if (!cancelled) {
            setSearchingHospitals(
              false
            );

            setLoadingHospitals(
              false
            );
          }
        }
      };

    // Wait 600ms after the user stops typing.
    const timeoutId =
      window.setTimeout(
        searchHospitals,
        600
      );

    return () => {
      cancelled = true;

      window.clearTimeout(
        timeoutId
      );
    };
  }, [hospitalSearch]);

  // ==========================================================
  // LIVE PATIENT GPS
  // ==========================================================

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "GPS is not available. Using Chennai map center."
      );

      return;
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (position) => {
          const nextLocation: [
            number,
            number
          ] = [
            position.coords.latitude,
            position.coords.longitude,
          ];

          setPatientLocation(
            nextLocation
          );

          setLocationMessage(
            "Your live location is active."
          );

          if (mapRef.current) {
            mapRef.current.panTo(
              nextLocation,
              {
                animate: true,
                duration: 0.5,
              }
            );
          }
        },
        () => {
          setLocationMessage(
            "Location permission was not available. Using Chennai center."
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );

    return () => {
      navigator.geolocation.clearWatch(
        watchId
      );
    };
  }, []);

  // ==========================================================
  // INITIALISE LEAFLET MAP
  // ==========================================================

  useEffect(() => {
    if (
      !mapElementRef.current ||
      mapRef.current
    ) {
      return;
    }

    const map =
      L.map(
        mapElementRef.current,
        {
          center:
            CHENNAI_CENTER,

          zoom: 11,

          zoomControl: true,
        }
      );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

        maxZoom: 19,
      }
    ).addTo(map);

    hospitalMarkersRef.current =
      L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();

      mapRef.current = null;

      patientMarkerRef.current =
        null;

      ambulanceMarkerRef.current =
        null;

      hospitalMarkersRef.current =
        null;
    };
  }, []);

  // ==========================================================
  // PATIENT MARKER
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    if (
      !patientMarkerRef.current
    ) {
      patientMarkerRef.current =
        L.marker(
          patientLocation,
          {
            icon: patientIcon,
          }
        ).addTo(map);

      patientMarkerRef.current.bindPopup(
        "<strong>📍 Your Location</strong><br/>Patient"
      );
    } else {
      patientMarkerRef.current.setLatLng(
        patientLocation
      );
    }
  }, [
    patientLocation,
    patientIcon,
  ]);

  // ==========================================================
  // HOSPITAL MARKERS
  // ==========================================================

  useEffect(() => {
    const layerGroup =
      hospitalMarkersRef.current;

    if (!layerGroup) {
      return;
    }

    layerGroup.clearLayers();

    hospitals.forEach(
      (hospital) => {
        const isSelected =
          String(hospital.id) ===
          String(selectedHospitalId);

        const marker =
          L.marker(
            [
              hospital.latitude,
              hospital.longitude,
            ],
            {
              icon:
                hospitalIcon,
            }
          );

        marker.bindPopup(`
          <div style="min-width:220px">
            <strong>
              ${escapeHtml(
                hospital.name
              )}
            </strong>

            <br/>

            <span>
              ${escapeHtml(
                hospital.address
              )}
            </span>

            <br/>

            <span style="color:#2563eb">
              📍 ${hospital.latitude.toFixed(
                6
              )},
              ${hospital.longitude.toFixed(
                6
              )}
            </span>
          </div>
        `);

        marker.addTo(
          layerGroup
        );

        if (isSelected) {
          marker.openPopup();
        }
      }
    );
  }, [
    hospitals,
    selectedHospitalId,
    hospitalIcon,
  ]);

  // ==========================================================
  // LIVE AMBULANCE TRACKING
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const updateAmbulance =
      async () => {
        try {
          const response =
            await fetch(
              `${API_BASE}/api/ambulances/active`,
              {
                headers:
                  authHeaders(),
              }
            );

          if (!response.ok) {
            return;
          }

          const data =
            await readJson(
              response
            );

          if (!data?.active) {
            if (!cancelled) {
              setAmbulance(
                null
              );
            }

            return;
          }

          const activeAmbulance =
            normaliseAmbulance(
              data
            );

          if (
            !cancelled &&
            activeAmbulance
          ) {
            setAmbulance(
              activeAmbulance
            );
          }
        } catch {
          // Keep the last known ambulance location.
        }
      };

    updateAmbulance();

    const intervalId =
      window.setInterval(
        updateAmbulance,
        3000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId
      );
    };
  }, []);

  // ==========================================================
  // AMBULANCE MAP MARKER
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !ambulance
    ) {
      return;
    }

    if (
      typeof ambulance.latitude !==
        "number" ||
      typeof ambulance.longitude !==
        "number"
    ) {
      return;
    }

    const position: [
      number,
      number
    ] = [
      ambulance.latitude,
      ambulance.longitude,
    ];

    if (
      !ambulanceMarkerRef.current
    ) {
      ambulanceMarkerRef.current =
        L.marker(
          position,
          {
            icon:
              ambulanceIcon,
          }
        ).addTo(map);

      ambulanceMarkerRef.current.bindPopup(
        "<strong>🚑 Ambulance</strong><br/>Live location"
      );
    } else {
      ambulanceMarkerRef.current.setLatLng(
        position
      );
    }
  }, [
    ambulance?.latitude,
    ambulance?.longitude,
    ambulanceIcon,
  ]);

  // ==========================================================
  // SELECT HOSPITAL
  // ==========================================================

  const selectHospital =
    (hospital: Hospital) => {
      setSelectedHospitalId(
        hospital.id
      );

      setError("");

      if (mapRef.current) {
        mapRef.current.flyTo(
          [
            hospital.latitude,
            hospital.longitude,
          ],
          15,
          {
            animate: true,
            duration: 1,
          }
        );
      }
    };

  // ==========================================================
  // BOOK EMERGENCY
  // ==========================================================

  const bookEmergency =
    async () => {
      setError("");
      setSuccess("");

      // ----------------------------------------------
      // VALIDATION
      // ----------------------------------------------

      if (!details.age.trim()) {
        setError(
          "Please enter your age."
        );

        return;
      }

      if (!details.gender) {
        setError(
          "Please select your gender."
        );

        return;
      }

      if (
        !details.symptoms.trim()
      ) {
        setError(
          "Please describe your emergency symptoms."
        );

        return;
      }

      if (!selectedHospital) {
        setError(
          "Please select a Chennai hospital."
        );

        return;
      }

      if (!backendOnline) {
        setError(
          "Backend is offline. Start FastAPI on port 8000 first."
        );

        return;
      }

      setBooking(true);

      try {
        // ----------------------------------------------
        // CREATE EMERGENCY CASE
        // ----------------------------------------------

        let caseId:
          | string
          | undefined;

        try {
          const caseResponse =
            await fetch(
              `${API_BASE}/api/cases/`,
              {
                method:
                  "POST",

                headers:
                  authHeaders(),

                body:
                  JSON.stringify(
                    {
                      patient_name:
                        user.full_name,

                      age:
                        Number(
                          details.age
                        ),

                      gender:
                        details.gender,

                      symptoms:
                        details.symptoms.trim(),

                      medical_history:
                        details.medical_history.trim() ||
                        null,

                      medications:
                        details.medications.trim() ||
                        null,

                      allergies:
                        details.allergies.trim() ||
                        null,

                      heart_rate:
                        null,

                      systolic_bp:
                        null,

                      diastolic_bp:
                        null,

                      spo2:
                        null,

                      respiratory_rate:
                        null,

                      temperature:
                        null,
                    }
                  ),
              }
            );

          const caseData =
            await readJson(
              caseResponse
            );

          if (
            caseResponse.ok
          ) {
            caseId =
              caseData?.case_id;
          }
        } catch {
          // Ambulance booking can still continue.
        }

        // ----------------------------------------------
        // AMBULANCE BOOKING
        // ----------------------------------------------

        const bookingPayload =
          {
            patient_id:
              String(
                user.id
              ),

            patient_name:
              user.full_name,

            patient_latitude:
              patientLocation[0],

            patient_longitude:
              patientLocation[1],

            hospital_id:
              selectedHospital.id,

            hospital_name:
              selectedHospital.name,

            symptoms:
              details.symptoms.trim(),

            age:
              Number(
                details.age
              ),

            gender:
              details.gender,

            medical_history:
              details.medical_history.trim() ||
              null,

            medications:
              details.medications.trim() ||
              null,

            allergies:
              details.allergies.trim() ||
              null,

            case_id:
              caseId ?? null,
          };

        const response =
          await fetch(
            `${API_BASE}/api/ambulances/book`,
            {
              method:
                "POST",

              headers:
                authHeaders(),

              body:
                JSON.stringify(
                  bookingPayload
                ),
            }
          );

        const data =
          await readJson(
            response
          );

        if (!response.ok) {
          throw new Error(
            data?.detail ??
              data?.message ??
              "Ambulance booking failed."
          );
        }

        const assignedAmbulance =
          normaliseAmbulance(
            data?.ambulance ??
              data
          );

        if (
          assignedAmbulance
        ) {
          setAmbulance(
            assignedAmbulance
          );
        }

        setSuccess(
          `Emergency request sent successfully. ${selectedHospital.name} has been selected. Waiting for an ambulance to accept the request.`
        );
      } catch (err: any) {
        setError(
          err?.message ??
            "Unable to book the ambulance."
        );
      } finally {
        setBooking(false);
      }
    };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ======================================================
          HEADER
      ====================================================== */}

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
                PATIENT
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
              type="button"
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:text-red-600"
            >
              Logout
            </button>

          </div>

        </div>
      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-7xl px-5 py-8">

        {/* HERO */}

        <section className="mb-7 rounded-3xl bg-gradient-to-r from-red-600 to-rose-500 p-7 text-white shadow-xl">

          <p className="text-xs font-bold tracking-[0.2em] text-red-100">
            PATIENT EMERGENCY PORTAL
          </p>

          <h2 className="mt-3 text-3xl font-bold md:text-4xl">
            Welcome, {user.full_name}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-red-50">
            Enter your emergency details, search for a
            hospital in Chennai, select your destination,
            and request an ambulance.
          </p>

        </section>

        {/* ERROR */}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {success && (
          <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
            {success}
          </div>
        )}

        {/* ==================================================
            DETAILS + HOSPITAL
        ================================================== */}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">

          {/* =================================================
              PATIENT DETAILS
          ================================================= */}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="mb-5">

              <p className="text-xs font-bold tracking-widest text-red-600">
                STEP 1
              </p>

              <h3 className="mt-1 text-2xl font-bold">
                Patient Details
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                These details will be shared with the emergency
                response team.
              </p>

            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <Field
                label="Full Name"
                value={
                  user.full_name
                }
                disabled
              />

              <Field
                label="Age"
                value={
                  details.age
                }
                type="number"
                placeholder="Enter age"
                onChange={(value) =>
                  setDetails(
                    (
                      previous
                    ) => ({
                      ...previous,
                      age: value,
                    })
                  )
                }
              />

              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Gender
                </label>

                <select
                  value={
                    details.gender
                  }
                  onChange={(
                    event
                  ) =>
                    setDetails(
                      (
                        previous
                      ) => ({
                        ...previous,
                        gender:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
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

              <Field
                label="Phone"
                value={
                  user.phone ??
                  ""
                }
                disabled
              />

            </div>

            <div className="mt-4 space-y-4">

              <TextArea
                label="Emergency Symptoms"
                value={
                  details.symptoms
                }
                placeholder="Example: severe chest pain, breathing difficulty..."
                onChange={(value) =>
                  setDetails(
                    (
                      previous
                    ) => ({
                      ...previous,
                      symptoms:
                        value,
                    })
                  )
                }
              />

              <TextArea
                label="Medical History"
                value={
                  details.medical_history
                }
                placeholder="Diabetes, hypertension, previous surgery..."
                onChange={(value) =>
                  setDetails(
                    (
                      previous
                    ) => ({
                      ...previous,
                      medical_history:
                        value,
                    })
                  )
                }
              />

              <TextArea
                label="Current Medications"
                value={
                  details.medications
                }
                placeholder="List current medicines if any..."
                onChange={(value) =>
                  setDetails(
                    (
                      previous
                    ) => ({
                      ...previous,
                      medications:
                        value,
                    })
                  )
                }
              />

              <TextArea
                label="Allergies"
                value={
                  details.allergies
                }
                placeholder="Medicine or food allergies..."
                onChange={(value) =>
                  setDetails(
                    (
                      previous
                    ) => ({
                      ...previous,
                      allergies:
                        value,
                    })
                  )
                }
              />

            </div>

          </section>

          {/* =================================================
              LIVE HOSPITAL SEARCH
          ================================================= */}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="mb-5">

              <p className="text-xs font-bold tracking-widest text-red-600">
                STEP 2
              </p>

              <h3 className="mt-1 text-2xl font-bold">
                Choose a Chennai Hospital
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Search live hospital locations from
                OpenStreetMap.
              </p>

            </div>

            {/* SEARCH */}

            <div>

              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Search Hospital
              </label>

              <div className="relative">

                <input
                  type="text"
                  value={
                    hospitalSearch
                  }
                  onChange={(
                    event
                  ) =>
                    setHospitalSearch(
                      event.target.value
                    )
                  }
                  placeholder="Example: MIOT, Apollo, Kauvery..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-12 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />

                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl">
                  {searchingHospitals
                    ? "⏳"
                    : "🔎"}
                </div>

              </div>

              <p className="mt-2 text-xs text-slate-400">
                Type at least 2 characters to search.
              </p>

            </div>

            {/* LOADING */}

            {searchingHospitals && (
              <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                🔎 Searching live Chennai hospitals...
              </div>
            )}

            {/* RESULTS */}

            {!searchingHospitals &&
              hospitalSearch.trim()
                .length >= 2 &&
              hospitals.length >
                0 && (

                <div className="mt-5">

                  <div className="mb-3 flex items-center justify-between">

                    <p className="text-sm font-bold text-slate-700">
                      {hospitals.length} result
                      {hospitals.length ===
                      1
                        ? ""
                        : "s"}{" "}
                      found
                    </p>

                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      LIVE OSM
                    </span>

                  </div>

                  <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">

                    {hospitals.map(
                      (
                        hospital
                      ) => {

                        const selected =
                          String(
                            selectedHospitalId
                          ) ===
                          String(
                            hospital.id
                          );

                        return (
                          <button
                            type="button"
                            key={String(
                              hospital.id
                            )}
                            onClick={() =>
                              selectHospital(
                                hospital
                              )
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              selected
                                ? "border-red-500 bg-red-50 ring-2 ring-red-100"
                                : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/40"
                            }`}
                          >

                            <div className="flex items-start gap-3">

                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">
                                🏥
                              </div>

                              <div className="min-w-0 flex-1">

                                <p className="font-bold text-slate-900">
                                  {
                                    hospital.name
                                  }
                                </p>

                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {
                                    hospital.address
                                  }
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">

                                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                                    Emergency
                                  </span>

                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                                    📍 Live coordinates
                                  </span>

                                </div>

                              </div>

                              <span
                                className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                  selected
                                    ? "border-red-600 bg-red-600"
                                    : "border-slate-300"
                                }`}
                              >
                                {selected && (
                                  <span className="text-xs text-white">
                                    ✓
                                  </span>
                                )}
                              </span>

                            </div>

                          </button>
                        );
                      }
                    )}

                  </div>

                </div>
              )}

            {/* NO RESULTS */}

            {!searchingHospitals &&
              hospitalSearch.trim()
                .length >= 2 &&
              hospitals.length ===
                0 && (

                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">

                  <p className="font-bold text-amber-800">
                    No hospital found
                  </p>

                  <p className="mt-1 text-sm text-amber-700">
                    Try Apollo, MIOT, Kauvery,
                    MGM, Stanley, or another
                    hospital name.
                  </p>

                </div>
              )}

            {/* EMPTY SEARCH */}

            {hospitalSearch.trim()
              .length < 2 && (

              <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-center">

                <div className="text-4xl">
                  🏥
                </div>

                <p className="mt-3 font-bold text-slate-700">
                  Search for your destination hospital
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Type a hospital name above to find its
                  real OpenStreetMap location.
                </p>

              </div>
            )}

            {/* SELECTED HOSPITAL */}

            {selectedHospital && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">

                <p className="text-xs font-bold uppercase tracking-wider text-green-600">
                  Selected Destination
                </p>

                <p className="mt-1 font-bold text-green-900">
                  🏥{" "}
                  {
                    selectedHospital.name
                  }
                </p>

                <p className="mt-1 text-sm text-green-700">
                  {
                    selectedHospital.address
                  }
                </p>

                <p className="mt-2 text-xs font-semibold text-green-600">
                  📍{" "}
                  {selectedHospital.latitude.toFixed(
                    6
                  )}
                  ,{" "}
                  {selectedHospital.longitude.toFixed(
                    6
                  )}
                </p>

              </div>
            )}

          </section>

        </div>

        {/* ==================================================
            MAP
        ================================================== */}

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col gap-3 border-b border-slate-200 p-6 md:flex-row md:items-center md:justify-between">

            <div>

              <p className="text-xs font-bold tracking-widest text-red-600">
                STEP 3
              </p>

              <h3 className="mt-1 text-2xl font-bold">
                Live Emergency Map
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                📍 Patient • 🚑 Ambulance • 🏥 Selected Hospital
              </p>

            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
              {locationMessage}
            </div>

          </div>

          <div
            ref={mapElementRef}
            className="h-[480px] w-full"
          />

        </section>

        {/* ==================================================
            BOOKING + TRACKING
        ================================================== */}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">

          {/* BOOKING */}

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

            <p className="text-xs font-bold tracking-widest text-red-600">
              STEP 4
            </p>

            <h3 className="mt-1 text-2xl font-bold">
              Emergency Request
            </h3>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">

              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Selected Hospital
              </p>

              <p className="mt-1 font-bold text-slate-900">
                {selectedHospital
                  ? selectedHospital.name
                  : "No hospital selected"}
              </p>

              {selectedHospital && (
                <>
                  <p className="mt-1 text-sm text-slate-500">
                    {
                      selectedHospital.address
                    }
                  </p>

                  <p className="mt-2 text-xs font-semibold text-blue-600">
                    📍{" "}
                    {selectedHospital.latitude.toFixed(
                      6
                    )}
                    ,{" "}
                    {selectedHospital.longitude.toFixed(
                      6
                    )}
                  </p>
                </>
              )}

            </div>

            <button
              type="button"
              onClick={
                bookEmergency
              }
              disabled={
                booking ||
                !selectedHospital ||
                !backendOnline
              }
              className="mt-5 w-full rounded-2xl bg-red-600 px-5 py-4 font-bold text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {booking
                ? "🚑 Sending Emergency Request..."
                : "🚑 Request Ambulance"}
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">
              The ambulance team will receive your live
              location and selected hospital.
            </p>

          </div>

          {/* AMBULANCE TRACKING */}

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-bold tracking-widest text-red-600">
                  LIVE TRACKING
                </p>

                <h3 className="mt-1 text-2xl font-bold">
                  Ambulance Status
                </h3>

              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  ambulance
                    ? "bg-green-50 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {ambulance
                  ? "ACTIVE"
                  : "WAITING"}
              </span>

            </div>

            {!ambulance ? (

              <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-center">

                <div className="text-4xl">
                  🚑
                </div>

                <p className="mt-3 font-bold text-slate-700">
                  No ambulance assigned yet
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Request an ambulance above. When an ambulance
                  accepts, its live location will appear on the
                  map automatically.
                </p>

              </div>

            ) : (

              <div className="mt-5 space-y-3">

                <InfoRow
                  label="Vehicle"
                  value={
                    ambulance.vehicle ??
                    "Assigned ambulance"
                  }
                />

                <InfoRow
                  label="Driver"
                  value={
                    ambulance.driver ??
                    "Driver assigned"
                  }
                />

                <InfoRow
                  label="Status"
                  value={
                    ambulance.status ??
                    "En Route"
                  }
                />

                <InfoRow
                  label="ETA"
                  value={
                    ambulance.eta !==
                    undefined
                      ? `${ambulance.eta} min`
                      : "Updating..."
                  }
                />

                <div className="rounded-2xl bg-green-50 p-4">

                  <p className="text-sm font-bold text-green-800">
                    🟢 Live ambulance tracking active
                  </p>

                  <p className="mt-1 text-xs leading-5 text-green-700">
                    The map is refreshed every 3 seconds while
                    the ambulance is active.
                  </p>

                </div>

              </div>
            )}

          </div>

        </section>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <footer className="mt-10 border-t border-slate-200 py-6 text-center">

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

// ============================================================
// FIELD COMPONENT
// ============================================================

function Field({
  label,
  value,
  type = "text",
  placeholder,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (
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
        disabled={disabled}
        onChange={(event) =>
          onChange?.(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-500"
      />

    </div>
  );
}

// ============================================================
// TEXTAREA COMPONENT
// ============================================================

function TextArea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
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
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
      />

    </div>
  );
}

// ============================================================
// INFO ROW
// ============================================================

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">

      <span className="text-sm font-semibold text-slate-500">
        {label}
      </span>

      <span className="max-w-[60%] text-right text-sm font-bold text-slate-900">
        {value}
      </span>

    </div>
  );
}

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(
  value: string
): string {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}