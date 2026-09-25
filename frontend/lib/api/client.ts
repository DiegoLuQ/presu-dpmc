import axios from 'axios';

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api';
  }
  return 'http://localhost:8001';
};

const api = axios.create({
  baseURL: getBaseUrl(),
});

// Request interceptor for API calls
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    // Colegio activo (para usuarios que pertenecen a más de un colegio).
    const colegioActivo = localStorage.getItem('colegio_activo');
    if (colegioActivo) {
      config.headers['X-Colegio-Activo'] = colegioActivo;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      const isAlreadyOnLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';

      if (!isLoginRequest && !isAlreadyOnLoginPage) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict";
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
