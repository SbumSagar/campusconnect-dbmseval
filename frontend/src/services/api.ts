import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from '../types';

/**
 * Axios instance. In development Vite proxies /api to the Express server,
 * so the httpOnly session cookie is same-origin. No secrets live here.
 */
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30_000,
});

export class ApiError extends Error {
  status: number;
  code: string;
  sqlstate?: string;
  constraint?: string | null;
  detail?: string | null;
  fieldErrors?: { path: string; message: string }[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    if (Array.isArray(body.details)) {
      this.fieldErrors = body.details;
    } else if (body.details) {
      this.sqlstate = body.details.sqlstate;
      this.constraint = body.details.constraint;
      this.detail = body.details.detail;
    }
  }

  /** true when PostgreSQL itself rejected the operation */
  get fromDatabase() {
    return !!this.sqlstate;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

http.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: ApiErrorBody }>) => {
    const status = err.response?.status ?? 0;
    const body = err.response?.data?.error ?? {
      code: status ? 'HTTP_' + status : 'NETWORK',
      message: status ? `Request failed (${status})` : 'Cannot reach the server - is the API running?',
    };
    if (status === 401 && !err.config?.url?.includes('/auth/')) onUnauthorized?.();
    return Promise.reject(new ApiError(status, body));
  },
);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
