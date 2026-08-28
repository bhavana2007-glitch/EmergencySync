import { useState } from "react";
import type { FormEvent } from "react";
import { loginUser } from "./auth";
import type { User } from "./auth";

interface LoginProps {
  onLogin: (user: User) => void;
  onRegister: () => void;
}

export default function Login({
  onLogin,
  onRegister,
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const result = await loginUser(
        email.trim(),
        password
      );

      onLogin(result.user);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Login failed. Please try again.");
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
          maxWidth: "440px",
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
            marginBottom: "30px",
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
            Smart Ambulance-to-Hospital
            Communication
          </p>
        </div>

        <h2
          style={{
            color: "#f8fafc",
            marginBottom: "20px",
          }}
        >
          Sign in
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

        <form onSubmit={handleLogin}>
          <label
            style={{
              display: "block",
              color: "#cbd5e1",
              marginBottom: "8px",
            }}
          >
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "10px",
              border: "1px solid #475569",
              background: "#020617",
              color: "#fff",
              marginBottom: "18px",
              boxSizing: "border-box",
            }}
          />

          <label
            style={{
              display: "block",
              color: "#cbd5e1",
              marginBottom: "8px",
            }}
          >
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "10px",
              border: "1px solid #475569",
              background: "#020617",
              color: "#fff",
              marginBottom: "20px",
              boxSizing: "border-box",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: loading ? "#475569" : "#2563eb",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div
          style={{
            textAlign: "center",
            marginTop: "24px",
            color: "#94a3b8",
          }}
        >
          Don't have an account?
        </div>

        <button
          type="button"
          onClick={onRegister}
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
          Create an account
        </button>
      </div>
    </div>
  );
}