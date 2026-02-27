import { useEffect, useRef, useCallback } from 'react';
import { connectSocket, getSocket } from '../utils/api';

/**
 * useRealtimeEvents - Hook to connect Socket.IO and listen for real-time events.
 *
 * @param {Object} eventHandlers - Map of event names to handler functions.
 *   e.g. { 'new_rfq': (data) => { ... }, 'task_assigned': (data) => { ... } }
 * @param {Function} showNotify - Optional notification display function (msg, type).
 * @param {Function} onRefresh - Optional callback to refresh dashboard data on events.
 * @param {string} role - Optional role for socket authentication (e.g. 'doctor', 'nurse').
 *
 * Example usage in a dashboard:
 *   useRealtimeEvents({
 *     'new_rfq': (data) => showNotify(data.message, 'info'),
 *     'task_assigned': (data) => { showNotify(data.message, 'info'); loadData(); }
 *   }, null, null, 'doctor');
 */
export function useRealtimeEvents(eventHandlers = {}, showNotify = null, onRefresh = null, role = null) {
    const handlersRef = useRef(eventHandlers);
    handlersRef.current = eventHandlers;

    const showNotifyRef = useRef(showNotify);
    showNotifyRef.current = showNotify;

    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;

    useEffect(() => {
        // Reuse existing socket if already connected, else connect with role
        let socket = getSocket();
        if (!socket || !socket.connected) {
            socket = connectSocket(role);
        }
        if (!socket) return;

        // Register all event listeners
        const registeredEvents = [];

        const registerEvents = () => {
            Object.entries(handlersRef.current).forEach(([event, handler]) => {
                const wrappedHandler = (data) => {
                    // Always call the latest handler via ref
                    if (handlersRef.current[event]) {
                        handlersRef.current[event](data);
                    }
                };
                socket.on(event, wrappedHandler);
                registeredEvents.push({ event, handler: wrappedHandler });
            });
        };

        // If already connected, register immediately
        if (socket.connected) {
            registerEvents();
        } else {
            // Wait for connection then register
            const onConnect = () => {
                registerEvents();
                socket.off('connect', onConnect);
            };
            socket.on('connect', onConnect);
            registeredEvents.push({ event: 'connect', handler: onConnect });
        }

        // Cleanup on unmount
        return () => {
            const currentSocket = getSocket();
            if (currentSocket) {
                registeredEvents.forEach(({ event, handler }) => {
                    currentSocket.off(event, handler);
                });
            }
        };
    }, []); // Run once on mount
}

export default useRealtimeEvents;
