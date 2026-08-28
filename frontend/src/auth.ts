const API_URL = "http://127.0.0.1:8000";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
  phone?: string | null;
  hospital_id?: number | null;
  specialty?: string | null;
  availability?: string | null;
}

interface LoginResponse {
  message: string;
  access_token: string;
  token_type: string;
  user: User;
}

export async function registerUser(data: {
  full_name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
  hospital_id?: number;
  specialty?: string;
}) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : result.detail?.message || "Registration failed"
    );
  }

  return result;
}

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : "Login failed"
    );
  }

  localStorage.setItem("access_token", result.access_token);
  localStorage.setItem("user", JSON.stringify(result.user));

  return result;
}

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getStoredUser(): User | null {
  const user = localStorage.getItem("user");

  if (!user) {
    return null;
  }

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User> {
  const token = getToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    logoutUser();
    throw new Error("Authentication expired");
  }

  return result.user;
}

export function logoutUser() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem("access_token");
}