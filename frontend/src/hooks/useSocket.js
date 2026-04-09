/**
 * useSocket.js — Shared Socket.IO hook.
 *
 * Maintains a single global socket connection across the app.
 * Automatically authenticates after connecting using the stored JWT token.
 *
 * Usage:
 *   const socket = useSocket({ new_message: (msg) => {...} });
 *   socket.emit('chat_message', { ... });
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../utils/api';

// Derive the server origin from API_BASE (strip /api suffix)
const SOCKET_URL = API_BASE.replace(/\/api$/, '');

// Single shared socket instance — persists across component mounts
let _sharedSocket = null;

/**
 * Get (or create) the shared socket, then authenticate it.
 */
export const getSocket = () => {
    if (_sharedSocket) return _sharedSocket;

    _sharedSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
    });

    _sharedSocket.on('connect', () => {
        // Authenticate with any available token (doctor, vendor, or generic)
        const token =
            sessionStorage.getItem('doctor_token') ||
            sessionStorage.getItem('vendor_token') ||
            sessionStorage.getItem('token');
        if (token) {
            _sharedSocket.emit('authenticate', { token });
        }
    });

    _sharedSocket.on('auth_error', (err) => {
    });

    _sharedSocket.on('disconnect', (reason) => {
    });

    return _sharedSocket;
};

/**
 * React hook that registers event handlers and returns the shared socket.
 *
 * @param {Object} onEvents - map of { eventName: handlerFn }
 * @returns {SocketIO.Socket}
 */
export const useSocket = (onEvents = {}) => {
    const socketRef = useRef(null);

    useEffect(() => {
        const socket = getSocket();
        socketRef.current = socket;

        // Register all event handlers
        const entries = Object.entries(onEvents);
        entries.forEach(([event, handler]) => {
            socket.on(event, handler);
        });

        // Cleanup handlers on unmount — do NOT disconnect shared socket
        return () => {
            entries.forEach(([event, handler]) => {
                socket.off(event, handler);
            });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return socketRef.current || getSocket();
};
