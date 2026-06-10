// client/src/api.js
import axios from 'axios';

const API_URL = 'https://147.45.215.184:3001';

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true
});

let refreshPromise = null;
let isRedirecting = false;

api.interceptors.request.use(request => {
    const csrfToken = localStorage.getItem('csrf_token');
    if (csrfToken) {
        request.headers['X-CSRF-Token'] = csrfToken;
    }
    return request;
});

api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // Если 401 и это не запрос на обновление токена
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Если это запрос на /api/refresh — не пытаемся обновлять
            if (originalRequest.url.includes('/api/refresh')) {
                // Просто разлогиниваем и редиректим
                localStorage.removeItem('auth_user');
                localStorage.removeItem('csrf_token');
                if (!isRedirecting) {
                    isRedirecting = true;
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }

            // Пытаемся обновить токен
            if (!refreshPromise) {
                refreshPromise = (async () => {
                    try {
                        const response = await axios.post(`${API_URL}/api/refresh`, {}, { withCredentials: true });
                        return response;
                    } catch (err) {
                        localStorage.removeItem('auth_user');
                        localStorage.removeItem('csrf_token');
                        if (!isRedirecting) {
                            isRedirecting = true;
                            window.location.href = '/login';
                        }
                        throw err;
                    } finally {
                        refreshPromise = null;
                    }
                })();
            }

            try {
                await refreshPromise;
                return api(originalRequest);
            } catch (refreshError) {
                return Promise.reject(refreshError);
            }
        }

        // Если 403 — тоже редирект на вход (или показать сообщение)
        if (status === 403 && !originalRequest._retry) {
            if (!isRedirecting) {
                isRedirecting = true;
                window.location.href = '/login';
            }
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export function getErrorMessage(error) {
    if (error.response) {
        const status = error.response.status;
        const serverMessage = error.response.data?.error || '';
        switch (status) {
            case 400: return { message: serverMessage || 'Некорректный запрос (400)', status };
            case 401: return { message: serverMessage || 'Ошибка авторизации (401)', status };
            case 403: return { message: serverMessage || 'Доступ запрещён (403)', status };
            case 404: return { message: serverMessage || 'Не найдено (404)', status };
            case 409: return { message: serverMessage || 'Конфликт данных (409)', status };
            case 500: return { message: serverMessage || 'Ошибка сервера (500)', status };
            default: return { message: serverMessage || `Ошибка (${status})`, status };
        }
    } else if (error.request) {
        return { message: 'Сервер не отвечает', status: 503 };
    } else {
        return { message: `Ошибка: ${error.message}`, status: 0 };
    }
}

export const doorApi = {
    getAll: async () => {
        try {
            const response = await api.get('/api/doors');
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    getOne: async (id) => {
        try {
            const response = await api.get(`/api/doors/${id}`);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    create: async (door) => {
        try {
            const response = await api.post('/api/doors', door);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    update: async (id, door) => {
        try {
            const response = await api.put(`/api/doors/${id}`, door);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    delete: async (id) => {
        try {
            await api.delete(`/api/doors/${id}`);
            return { error: null, status: 204 };
        } catch (error) {
            const err = getErrorMessage(error);
            return { error: err.message, status: err.status };
        }
    }
};

export const sealApi = {
    getAll: async () => {
        try {
            const response = await api.get('/api/seals');
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    getByDoor: async (doorId) => {
        try {
            const response = await api.get(`/api/seals/${doorId}`);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    install: async (doorId, sealId) => {
        try {
            const response = await api.post('/api/seals/install', { doorId, sealId });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    remove: async (doorId) => {
        try {
            const response = await api.post('/api/seals/remove', { doorId });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    break: async (doorId) => {
        try {
            const response = await api.post('/api/seals/break', { doorId });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    disable: async (doorId) => {
        try {
            const response = await api.post('/api/seals/disable', { doorId });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    enable: async (doorId) => {
        try {
            const response = await api.post('/api/seals/enable', { doorId });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    }
};

export const auditApi = {
    getAll: async () => {
        try {
            const response = await api.get('/api/audit-log');
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    verify: async () => {
        try {
            const response = await api.get('/api/audit-log/verify');
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    }
};

export const userApi = {
    register: async (user) => {
        try {
            const response = await api.post('/api/register', user);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    getAll: async () => {
        try {
            const response = await api.get('/api/users');
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    getOne: async (id) => {
        try {
            const response = await api.get(`/api/users/${id}`);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    create: async (user) => {
        try {
            const response = await api.post('/api/users', user);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    approve: async (id) => {
        try {
            const response = await api.post(`/api/users/${id}/approve`);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    update: async (id, user) => {
        try {
            const response = await api.put(`/api/users/${id}`, user);
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    },
    delete: async (id) => {
        try {
            await api.delete(`/api/users/${id}`);
            return { error: null, status: 204 };
        } catch (error) {
            const err = getErrorMessage(error);
            return { error: err.message, status: err.status };
        }
    }
};

export const alertApi = {
    send: async (message, severity = 'medium') => {
        try {
            const response = await api.post('/api/alert', { message, severity });
            return { data: response.data, error: null, status: response.status };
        } catch (error) {
            const err = getErrorMessage(error);
            return { data: null, error: err.message, status: err.status };
        }
    }
};

// Создаем объект auth с методами, которые не зависят от рендера
export const auth = {
    login: async (username, password, captchaId, captchaText) => {
        try {
            const response = await api.post('/api/login', { username, password, captchaId, captchaText });
            const { user, csrfToken, requires2FA, userId } = response.data;
            if (requires2FA) {
                return { success: true, requires2FA: true, userId };
            }
            localStorage.setItem('auth_user', JSON.stringify(user));
            localStorage.setItem('csrf_token', csrfToken);
            return { success: true, error: null, status: response.status, user };
        } catch (error) {
            const err = getErrorMessage(error);
            return { success: false, error: err.message, status: err.status };
        }
    },
    logout: () => {
        api.post('/api/logout', {}).catch(() => {});
        localStorage.removeItem('auth_user');
        localStorage.removeItem('csrf_token');
    },
    isAuthenticated: () => {
        const user = localStorage.getItem('auth_user');
        if (!user) return false;
        try {
            const parsed = JSON.parse(user);
            return !!parsed;
        } catch {
            return false;
        }
    },
    getCurrentUser: () => {
        const userStr = localStorage.getItem('auth_user');
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch {
            return null;
        }
    },
    getUserRole: () => {
        const user = auth.getCurrentUser();
        return user ? user.role : null;
    },
    getUserFullName: () => {
        const user = auth.getCurrentUser();
        return user ? user.fullName : null;
    },
    forgotPassword: async (username) => {
        try {
            const response = await api.post('/api/forgot-password', { username });
            return { success: true, data: response.data, error: null };
        } catch (error) {
            const err = getErrorMessage(error);
            return { success: false, error: err.message, status: err.status };
        }
    },
    verifyResetCode: async (username, code) => {
        try {
            const response = await api.post('/api/verify-reset-code', { username, code });
            return { success: true, data: response.data, error: null };
        } catch (error) {
            const err = getErrorMessage(error);
            return { success: false, error: err.message, status: err.status };
        }
    },
    resetPassword: async (username, code, newPassword) => {
        try {
            const response = await api.post('/api/reset-password', { username, code, newPassword });
            return { success: true, data: response.data, error: null };
        } catch (error) {
            const err = getErrorMessage(error);
            return { success: false, error: err.message, status: err.status };
        }
    },
    verify2FA: async (userId, code) => {
        try {
            const response = await api.post('/api/2fa/verify-code', { userId, code });
            const { user, csrfToken } = response.data;
            localStorage.setItem('auth_user', JSON.stringify(user));
            localStorage.setItem('csrf_token', csrfToken);
            return { success: true, error: null };
        } catch (error) {
            const err = getErrorMessage(error);
            return { success: false, error: err.message, status: err.status };
        }
    }
};

export default api;
