export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, body.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}

// Convenience methods
export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: "DELETE" }),
};
