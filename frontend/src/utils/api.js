import { io } from 'socket.io-client';

// API base URL — uses Vite env variable, falls back to localhost for development
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// ============ Role-Specific Auth Helpers ============

/**
 * Save token and user for a specific role.
 * Keys: `${role}_token`, `${role}_user`
 * Uses sessionStorage so each tab has its own isolated session.
 * Also sets the generic `token`/`user` keys for backward compatibility.
 */
export const setRoleAuth = (role, token, user) => {
    sessionStorage.setItem(`${role}_token`, token);
    sessionStorage.setItem(`${role}_user`, JSON.stringify(user));
    // Also set generic keys (used by PrivateRoute fallback)
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
};

/**
 * Get token and user for a specific role.
 * Falls back to generic keys if role-specific not found.
 */
export const getRoleAuth = (role) => {
    const token = sessionStorage.getItem(`${role}_token`) || sessionStorage.getItem('token');
    const userStr = sessionStorage.getItem(`${role}_user`) || sessionStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { token, user };
};

/**
 * Clear only a specific role's auth data.
 * Does NOT clear other roles' tokens.
 */
export const clearRoleAuth = (role) => {
    sessionStorage.removeItem(`${role}_token`);
    sessionStorage.removeItem(`${role}_user`);
    // If the generic keys belong to this role, clear them too
    const genericUser = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (genericUser.role === role) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
    }
};

// ============ Socket.IO Client ============

let socket = null;

/**
 * Connect to Socket.IO server and authenticate with JWT.
 * Pass role to use role-specific token. Returns the socket instance.
 */
export const connectSocket = (role) => {
    if (socket && socket.connected) return socket;

    const token = role
        ? (sessionStorage.getItem(`${role}_token`) || sessionStorage.getItem('token'))
        : sessionStorage.getItem('token');
    if (!token) return null;

    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    });

    socket.on('connect', () => {
        socket.emit('authenticate', { token });
    });

    socket.on('authenticated', () => {});
    socket.on('auth_error', () => {});
    socket.on('disconnect', () => {});

    return socket;
};

/**
 * Get the current socket instance. Returns null if not connected.
 */
export const getSocket = () => socket;

/**
 * Disconnect the socket (call on logout).
 */
export const disconnectSocket = (role) => {
    if (socket) {
        const userStr = role
            ? (sessionStorage.getItem(`${role}_user`) || sessionStorage.getItem('user'))
            : sessionStorage.getItem('user');
        const user = JSON.parse(userStr || '{}');
        socket.emit('leave', { user_id: user.user_id, role: user.role });
        socket.disconnect();
        socket = null;
    }
};

// ============ REST API Helpers ============

/**
 * Get auth headers. Pass role to use role-specific token.
 */
export const getAuthHeaders = (role) => {
    const token = role
        ? (sessionStorage.getItem(`${role}_token`) || sessionStorage.getItem('token'))
        : sessionStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const checkAuth = (role) => {
    if (role) {
        return !!(sessionStorage.getItem(`${role}_token`) || sessionStorage.getItem('token'));
    }
    return !!sessionStorage.getItem('token');
};

export const logout = (role) => {
    disconnectSocket(role);
    if (role) {
        clearRoleAuth(role);
    } else {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
    }
    window.location.href = '/';
};

// Format date for display
export const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
};

// Format 24h time string (e.g. '09:00', '22:30') to AM/PM (e.g. '9:00 AM', '10:30 PM')
export const formatTimeAmPm = (time24) => {
    if (!time24) return '';
    try {
        const [h, m] = time24.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return m > 0 ? `${h12}:${String(m).padStart(2, '0')} ${period}` : `${h12}:00 ${period}`;
    } catch {
        return time24;
    }
};

// Check connection status to the backend
export const checkConnectionStatus = async () => {
    try {
        const res = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        return { connected: res.ok };
    } catch {
        return { connected: false };
    }
};

// Handle authentication errors
export const handleAuthError = (error, showNotify) => {
    if (error?.response?.status === 401 || error?.message?.includes('401')) {
        logout();
    } else if (showNotify) {
        showNotify('Network error. Please try again.', 'error');
    }
};