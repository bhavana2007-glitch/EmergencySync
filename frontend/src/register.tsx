import { useState } from "react";
import type { FormEvent } from "react";
import { registerUser } from "./auth";

interface RegisterProps {
  onRegisterSuccess: () => void;
  onLogin: () => void;
}

export default function Register({
  onRegisterSuccess,
  onLogin,
}: RegisterProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("patient");
  const [phone, setPhone] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [specialty, setSpecialty] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (
      (role === "nurse" || role === "specialist") &&
      !hospitalId
    ) {
      setError("Hospital ID is required for medical staff.");
      return;
    }

    if (role === "specialist" && !specialty.trim()) {
      setError(
        "Specialty is required for specialist accounts."
      );
      return;
    }

    try {
      setLoading(true);

      await registerUser({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        phone: phone.trim() || undefined,
        hospital_id: hospitalId
          ? Number(hospitalId)
          : undefined,
        specialty: specialty.trim() || undefined,
      });

      setSuccess(
        "Account created successfully! You can now sign in."
      );

      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setPhone("");
      setHospitalId("");
      setSpecialty("");

      setTimeout(() => {
        onRegisterSuccess();
      }, 1200);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Registration failed. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #020617, #0f172a, #111827)",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#111827",
          border: "1px solid #334155",
          borderRadius: "20px",
          padding: "35px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              fontSize: "42px",
              marginBottom: "10px",
            }}
          >
            🚑
          </div>

          <h1
            style={{
              margin: 0,
              color: "#f8fafc",
              fontSize: "30px",
            }}
          >
            EmergencySync
          </h1>

          <p
            style={{
              color: "#94a3b8",
              marginTop: "8px",
            }}
          >
            Create your EmergencySync account
          </p>
        </div>

        <h2
          style={{
            color: "#f8fafc",
            marginBottom: "20px",
          }}
        >
          Create Account
        </h2>

        {error && (
          <div
            style={{
              background: "#451a1a",
              border: "1px solid #ef4444",
              color: "#fca5a5",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "18px",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: "#052e16",
              border: "1px solid #22c55e",
              color: "#86efac",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "18px",
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <label
            style={{
              display: "block",
              color: "#cbd5e1",
              marginBottom: "8px",
            }}
          >
            Full Name
          </label>

          <input
            type="text"
            value={fullName}
            onChange={(event) =>
              setFullName(event.target.value)
            }
            placeholder="Enter your full name"
            style={inputStyle}
          />

          <label style={labelStyle}>
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="Enter your email"
            style={inputStyle}
          />

          <label style={labelStyle}>
            Phone Number
          </label>

          <input
            type="tel"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value)
            }
            placeholder="Enter phone number"
            style={inputStyle}
          />

          <label style={labelStyle}>
            Account Type
          </label>

          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value)
            }
            style={inputStyle}
          >
            <option value="patient">
              Patient
            </option>

            <option value="nurse">
              Nurse
            </option>

            <option value="specialist">
              Specialist
            </option>
          </select>

          {(role === "nurse" ||
            role === "specialist") && (
            <>
              <label style={labelStyle}>
                Hospital ID
              </label>

              <input
                type="number"
                value={hospitalId}
                onChange={(event) =>
                  setHospitalId(event.target.value)
                }
                placeholder="Enter hospital ID"
                style={inputStyle}
              />
            </>
          )}

          {role === "specialist" && (
            <>
              <label style={labelStyle}>
                Specialty
              </label>

              <input
                type="text"
                value={specialty}
                onChange={(event) =>
                  setSpecialty(event.target.value)
                }
                placeholder="e.g. Cardiology"
                style={inputStyle}
              />
            </>
          )}

          <label style={labelStyle}>
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Minimum 8 characters"
            style={inputStyle}
          />

          <label style={labelStyle}>
            Confirm Password
          </label>

          <input
            type="password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
            placeholder="Re-enter your password"
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              marginTop: "10px",
              borderRadius: "10px",
              border: "none",
              background: loading
                ? "#475569"
                : "#2563eb",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 600,
              cursor: loading
                ? "not-allowed"
                : "pointer",
            }}
          >
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </button>
        </form>

        <div
          style={{
            textAlign: "center",
            marginTop: "24px",
            color: "#94a3b8",
          }}
        >
          Already have an account?
        </div>

        <button
          type="button"
          onClick={onLogin}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #3b82f6",
            background: "transparent",
            color: "#60a5fa",
            cursor: "pointer",
            fontSize: "15px",
          }}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "13px",
  borderRadius: "10px",
  border: "1px solid #475569",
  background: "#020617",
  color: "#fff",
  marginBottom: "18px",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  color: "#cbd5e1",
  marginBottom: "8px",
};