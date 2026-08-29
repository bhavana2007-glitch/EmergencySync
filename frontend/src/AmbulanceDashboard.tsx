import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = "http://localhost:8000";
const TOKEN_KEY = "emergencysync_access_token";

type User = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  hospital_id?: number | null;
};

type RequestData = {
  active: boolean;
  booking_id?: string;
  status?: string;
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
  ambulance?: {
    ambulance_id?: string;
    vehicle?: string;
    driver?: string;
    latitude?: number;
    longitude?: number;
    status?: string;
  };
  eta?: number | null;
};

type Props = {
  user: User;
  logout: () => void;
  backendOnline: boolean;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);

  return {
    "Content-Type": "application/json",
    ...(token
      ? { Authorization: `Bearer ${token}` }
      : {}),
  };
}

export default function AmbulanceDashboard({
  user,
  logout,
  backendOnline,
}: Props) {
  const [request, setRequest] =
    useState<RequestData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [accepting, setAccepting] =
    useState(false);

  const [accepted, setAccepted] =
    useState(false);

  const [location, setLocation] =
    useState<[number, number] | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const mapElementRef =
    useRef<HTMLDivElement | null>(null);

  const patientMarkerRef =
    useRef<L.Marker | null>(null);

  const ambulanceMarkerRef =
    useRef<L.Marker | null>(null);

  const hospitalMarkerRef =
    useRef<L.Marker | null>(null);

  // ---------------------------------------------------------
  // GET CURRENT EMERGENCY REQUEST
  // ---------------------------------------------------------

  const loadRequest = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/ambulances/active`,
        {
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (!data.active) {
        setRequest(null);
        return;
      }

      setRequest(data);

      if (
        data.ambulance?.ambulance_id &&
        String(data.ambulance.ambulance_id) ===
          String(user.id)
      ) {
        setAccepted(true);
      }
    } catch (error) {
      console.error(
        "Ambulance request error:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // POLL FOR NEW REQUEST
  // ---------------------------------------------------------

  useEffect(() => {
    loadRequest();

    const interval =
      window.setInterval(
        loadRequest,
        2000
      );

    return () =>
      window.clearInterval(interval);
  }, []);

  // ---------------------------------------------------------
  // AMBULANCE GPS
  // ---------------------------------------------------------

  useEffect(() => {
    if (!accepted) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (position) => {
          setLocation([
            position.coords.latitude,
            position.coords.longitude,
          ]);
        },
        (error) => {
          console.error(
            "Ambulance GPS error:",
            error
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 10000,
        }
      );

    return () => {
      navigator.geolocation.clearWatch(
        watchId
      );
    };
  }, [accepted]);

  // ---------------------------------------------------------
  // SEND AMBULANCE LOCATION
  // ---------------------------------------------------------

  useEffect(() => {
    if (!accepted || !location) {
      return;
    }

    const sendLocation = async () => {
      try {
        await fetch(
          `${API_BASE}/api/ambulances/location`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              ambulance_id:
                String(user.id),

              latitude:
                location[0],

              longitude:
                location[1],

              status:
                "En Route",

              eta: null,
            }),
          }
        );
      } catch (error) {
        console.error(
          "Location update failed:",
          error
        );
      }
    };

    sendLocation();

    const interval =
      window.setInterval(
        sendLocation,
        3000
      );

    return () =>
      window.clearInterval(interval);
  }, [
    accepted,
    location,
    user.id,
  ]);

  // ---------------------------------------------------------
  // MAP
  // ---------------------------------------------------------

  useEffect(() => {
    if (
      !mapElementRef.current ||
      mapRef.current
    ) {
      return;
    }

    const map = L.map(
      mapElementRef.current,
      {
        center: [
          13.0827,
          80.2707,
        ],
        zoom: 12,
      }
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          "&copy; OpenStreetMap contributors",
      }
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------
  // MAP MARKERS
  // ---------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !request) {
      return;
    }

    const patient =
      request.patient;

    const hospital =
      request.hospital;

    if (
      patient?.latitude != null &&
      patient?.longitude != null
    ) {
      const position:
        [number, number] = [
          patient.latitude,
          patient.longitude,
        ];

      if (
        !patientMarkerRef.current
      ) {
        patientMarkerRef.current =
          L.marker(position)
            .addTo(map)
            .bindPopup(
              "<strong>📍 Patient Location</strong><br/>Live patient location"
            );
      } else {
        patientMarkerRef.current.setLatLng(
          position
        );
      }
    }

    if (
      hospital &&
      request.patient?.latitude != null
    ) {
      // Hospital location is fetched separately below.
    }
  }, [request]);

  useEffect(() => {
    if (!mapRef.current || !location) {
      return;
    }

    const map = mapRef.current;

    if (!ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current =
        L.marker(location)
          .addTo(map)
          .bindPopup(
            "<strong>🚑 Your Ambulance</strong><br/>Live GPS"
          );
    } else {
      ambulanceMarkerRef.current.setLatLng(
        location
      );
    }
  }, [location]);

  // ---------------------------------------------------------
  // ACCEPT REQUEST
  // ---------------------------------------------------------

  const acceptRequest =
    async () => {
      if (!request) {
        return;
      }

      if (!location) {
        alert(
          "Please allow GPS access for the ambulance."
        );
        return;
      }

      setAccepting(true);

      try {
        const response =
          await fetch(
            `${API_BASE}/api/ambulances/assign`,
            {
              method: "POST",
              headers:
                authHeaders(),

              body: JSON.stringify({
                ambulance_id:
                  String(user.id),

                vehicle:
                  `AMB-${user.id}`,

                driver:
                  user.full_name,

                latitude:
                  location[0],

                longitude:
                  location[1],

                eta: null,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.detail ??
              data?.message ??
              "Unable to accept request."
          );
        }

        setAccepted(true);

        await loadRequest();
      } catch (error) {
        alert(
          error instanceof Error
            ? error.message
            : "Unable to accept ambulance request."
        );
      } finally {
        setAccepting(false);
      }
    };

  // ---------------------------------------------------------
  // NAVIGATE TO PATIENT
  // ---------------------------------------------------------

  const navigateToPatient =
    () => {
      if (
        !request?.patient?.latitude ||
        !request?.patient?.longitude
      ) {
        return;
      }

      const lat =
        request.patient.latitude;

      const lng =
        request.patient.longitude;

      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank"
      );
    };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white">
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
                Ambulance Operations
              </p>
            </div>

          </div>

          <div className="flex items-center gap-4">

            <div className="text-right">
              <p className="text-sm font-bold">
                {user.full_name}
              </p>

              <p className="text-xs text-red-600">
                Ambulance Team
              </p>
            </div>

            <button
              onClick={logout}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Logout
            </button>

          </div>

        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">

        <div className="mb-6">

          <div className="rounded-3xl bg-slate-950 p-7 text-white">

            <p className="text-xs font-bold uppercase tracking-widest text-red-400">
              Ambulance Dispatch
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Emergency Request Center
            </h2>

            <p className="mt-2 text-slate-300">
              Monitor incoming patients and reach
              their live location quickly.
            </p>

          </div>

        </div>

        {loading && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            Checking for emergency requests...
          </div>
        )}

        {!loading && !request && (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">

            <div className="text-5xl">
              🚑
            </div>

            <h2 className="mt-4 text-2xl font-bold">
              No Active Emergency
            </h2>

            <p className="mt-2 text-slate-500">
              This screen will automatically show
              a new patient request.
            </p>

            <div className="mt-5 inline-flex rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
              ● Waiting for requests
            </div>

          </div>
        )}

        {request && (

          <div className="grid gap-6 lg:grid-cols-5">

            <div className="space-y-5 lg:col-span-2">

              <div className="rounded-3xl border-2 border-red-100 bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-xs font-bold uppercase text-red-600">
                      {accepted
                        ? "REQUEST ACCEPTED"
                        : "NEW EMERGENCY REQUEST"}
                    </p>

                    <h2 className="mt-1 text-2xl font-bold">
                      Patient Request
                    </h2>
                  </div>

                  <div className="rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                    {request.status}
                  </div>

                </div>

                <div className="mt-6 space-y-3">

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Patient
                    </p>

                    <p className="font-bold">
                      {request.patient?.name ??
                        "Emergency Patient"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Destination Hospital
                    </p>

                    <p className="font-bold">
                      🏥{" "}
                      {request.hospital?.name ??
                        "Hospital"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Patient Coordinates
                    </p>

                    <p className="font-mono text-sm font-bold">
                      📍{" "}
                      {request.patient?.latitude?.toFixed(
                        6
                      )}
                      ,{" "}
                      {request.patient?.longitude?.toFixed(
                        6
                      )}
                    </p>
                  </div>

                </div>

                {!accepted ? (
                  <button
                    onClick={acceptRequest}
                    disabled={accepting}
                    className="mt-6 w-full rounded-2xl bg-red-600 px-5 py-4 font-bold text-white shadow-lg hover:bg-red-700 disabled:opacity-60"
                  >
                    {accepting
                      ? "Accepting..."
                      : "🚑 Accept Emergency Request"}
                  </button>
                ) : (
                  <button
                    onClick={navigateToPatient}
                    className="mt-6 w-full rounded-2xl bg-green-600 px-5 py-4 font-bold text-white shadow-lg hover:bg-green-700"
                  >
                    🧭 Navigate to Patient
                  </button>
                )}

              </div>

              <div className="grid grid-cols-2 gap-4">

                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <p className="text-xs text-slate-500">
                    GPS
                  </p>

                  <p className="mt-1 font-bold">
                    {location
                      ? "ACTIVE"
                      : "WAITING"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <p className="text-xs text-slate-500">
                    Connection
                  </p>

                  <p className="mt-1 font-bold text-green-600">
                    {backendOnline
                      ? "ONLINE"
                      : "OFFLINE"}
                  </p>
                </div>

              </div>

            </div>

            <div className="lg:col-span-3">

              <div className="overflow-hidden rounded-3xl bg-white shadow-sm">

                <div className="border-b p-5">

                  <h3 className="text-xl font-bold">
                    📍 Live Patient Tracking
                  </h3>

                  <p className="text-sm text-slate-500">
                    Patient location updates automatically.
                  </p>

                </div>

                <div
                  ref={mapElementRef}
                  className="h-[520px] w-full"
                />

              </div>

            </div>

          </div>
        )}

      </main>

    </div>
  );
}