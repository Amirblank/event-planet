// Thin client for the Event Planet REST API. All business rules live on the
// server; this module only sends requests and normalises errors.

const TOKEN_KEY = "ep.token";

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

let token = readToken();
let onUnauthorized = () => {};

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    // Storage can be unavailable (private mode). The token then lives in memory only.
  }
}

export const hasToken = () => Boolean(token);

export function handleUnauthorized(callback) {
  onUnauthorized = callback;
}

function firstMessage(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return firstMessage(data[0]);
  if (data.detail) return firstMessage(data.detail);
  const key = Object.keys(data).find((name) => name !== "code");
  return key ? firstMessage(data[key]) : "";
}

export class ApiError extends Error {
  constructor(status, data) {
    super(firstMessage(data) || `Request failed (${status}).`);
    this.status = status;
    this.data = data;
    this.code = data && data.code;
  }
}

async function request(method, path, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const sentToken = token;
  if (sentToken) headers.Authorization = `Token ${sentToken}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, { detail: "The server is not reachable. Check your connection." });
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (response.ok) return data;

  if (response.status === 401 && sentToken) {
    // The stored token was revoked or expired. Drop it and, for reads, retry anonymously.
    setToken(null);
    onUnauthorized();
    if (method === "GET") return request(method, path, body);
  }
  throw new ApiError(response.status, data);
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body = {}) => request("POST", path, body),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};

// Paginated endpoints wrap rows in { results }, small nested lists return arrays.
export const rows = (data) => (Array.isArray(data) ? data : data.results);

export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
