/**
 * VendorRequests.jsx — Doctor's page for managing incoming vendor connection requests.
 *
 * Tabs: All | Pending | Accepted | Rejected
 * - Pending  : Accept + Reject buttons (with optional reject-reason modal)
 * - Accepted : "Open Chat" button → opens SocketChatRoom inline
 * - Rejected : read-only status view
 *
 * This page is rendered inside DoctorDashboard at view === 'vendor-requests'.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';
import SocketChatRoom from '../components/SocketChatRoom';
import { useSocket } from '../hooks/useSocket';

const VendorRequests = ({ showNotify }) => {
    const [requests, setRequests]     = useState([]);
    const [loading, setLoading]       = useState(true);
    const [activeTab, setActiveTab]   = useState('pending');
    const [activeChat, setActiveChat] = useState(null); // { chat_id, other_participant }
    const [rejectModal, setRejectModal] = useState(null); // request_id or null
    const [rejectReason, setRejectReason] = useState('');
    const [processing, setProcessing] = useState(''); // request_id being processed

    // Prefer doctor role-specific user to avoid cross-role contamination
    // Prefer doctor role-specific user to avoid cross-role contamination
    const user = JSON.parse(
        sessionStorage.getItem('doctor_user') ||
        sessionStorage.getItem('user') ||
        '{}'
    );

    // ── load requests ──────────────────────────────────────────
    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/chat/requests?direction=received`, {
                headers: getAuthHeaders(user.role || 'doctor')
            });
            const data = await res.json();
            if (data.success) {
                setRequests(data.requests || []);
            } else {
            }
        } catch (e) {
        } finally {
            setLoading(false);
        }
    }, [user.role]);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    // Live update when a new vendor request arrives
    useSocket({
        vendor_request: () => { loadRequests(); }
    });

    // ── accept / reject ────────────────────────────────────────
    const respondToRequest = async (requestId, action, reason = '') => {
        setProcessing(requestId);
        try {
            const body = { action };
            if (action === 'reject' && reason) body.reason = reason;

            const res = await fetch(`${API_BASE}/chat/request/${requestId}`, {
                method: 'PUT',
                headers: getAuthHeaders(user.role || 'doctor'),
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (data.success) {
                showNotify?.(
                    action === 'accept'
                        ? '✅ Request accepted — chat room created!'
                        : '❌ Request rejected.',
                    action === 'accept' ? 'success' : 'info'
                );
                await loadRequests();

                // If accepted and chat_id returned, open the chat immediately
                if (action === 'accept' && data.chat_id) {
                    const req = requests.find(r => r.request_id === requestId);
                    if (req) {
                        setActiveChat({
                            chat_id: data.chat_id,
                            other_participant: {
                                user_id: req.vendor_id,
                                name: req.vendor_name,
                                role: 'vendor'
                            }
                        });
                        setActiveTab('accepted');
                    }
                }
            } else {
                showNotify?.(data.error || 'Action failed', 'error');
            }
        } catch (e) {
            showNotify?.('Network error', 'error');
        } finally {
            setProcessing('');
            setRejectModal(null);
            setRejectReason('');
        }
    };

    // ── open chat for an already-accepted request ──────────────
    const openChatForRequest = async (req) => {
        // Fetch the existing chat for this request
        try {
            const res = await fetch(`${API_BASE}/chat/conversations`, {
                headers: getAuthHeaders(user.role || 'doctor')
            });
            const data = await res.json();
            if (data.success) {
                const chat = (data.conversations || []).find(c =>
                    c.participant_ids?.includes(req.vendor_id)
                );
                if (chat) {
                    setActiveChat(chat);
                    return;
                }
            }
        } catch (e) { /* fall through */ }

        // If not found yet, create/get via direct chat
        try {
            const res = await fetch(`${API_BASE}/chat/direct`, {
                method: 'POST',
                headers: getAuthHeaders(user.role || 'doctor'),
                body: JSON.stringify({ target_id: req.vendor_id, target_role: 'vendor' })
            });
            const data = await res.json();
            if (data.success && data.chat) {
                setActiveChat(data.chat);
            }
        } catch (e) {
            showNotify?.('Could not open chat', 'error');
        }
    };

    // ── filter ─────────────────────────────────────────────────
    const filtered = (() => {
        if (activeTab === 'all') return requests;
        if (activeTab === 'pending') return requests.filter(r => r.status === 'pending');
        if (activeTab === 'accepted') return requests.filter(r => r.status === 'accepted');
        if (activeTab === 'rejected') return requests.filter(r => r.status === 'rejected');
        return requests;
    })();

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    // ── if a chat is open, show the chat room full-width ───────
    if (activeChat) {
        return (
            <div className="h-full flex flex-col">
                <SocketChatRoom
                    chat={activeChat}
                    authRole="doctor"
                    onBack={() => setActiveChat(null)}
                />
            </div>
        );
    }

    // ── main requests list ─────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex justify-between items-center border-b border-border pb-4">
                <div>
                    <h2 className="text-3xl font-bold text-foreground">Vendor Requests</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage incoming connection requests from medical vendors
                    </p>
                </div>
                <button
                    onClick={loadRequests}
                    className="px-4 py-2 bg-card border border-border rounded-lg text-sm text-muted-foreground hover:text-white hover:border-primary transition">
                    🔄 Refresh
                </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-2 flex-wrap">
                {[
                    { key: 'pending',  label: '⏳ Pending',  count: requests.filter(r => r.status === 'pending').length },
                    { key: 'accepted', label: '✅ Accepted', count: requests.filter(r => r.status === 'accepted').length },
                    { key: 'rejected', label: '❌ Rejected', count: requests.filter(r => r.status === 'rejected').length },
                    { key: 'all',      label: '📋 All',      count: requests.length },
                ].map(tab => (
                    <button key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                            activeTab === tab.key
                                ? 'bg-primary text-white'
                                : 'bg-card text-muted-foreground hover:text-white border border-border'
                        }`}>
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-amber-500 text-black'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Request cards */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <span className="text-sm animate-pulse">Loading requests…</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <span className="text-5xl mb-3">
                        {activeTab === 'pending' ? '📭' : activeTab === 'accepted' ? '🤝' : '📋'}
                    </span>
                    <p className="font-medium">No {activeTab === 'all' ? '' : activeTab} requests</p>
                    <p className="text-sm mt-1">
                        {activeTab === 'pending'
                            ? 'All clear — no pending vendor requests right now.'
                            : activeTab === 'accepted'
                                ? 'Accept a pending request to start chatting with a vendor.'
                                : 'Nothing to see here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(req => (
                        <div key={req.request_id}
                            className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/50 transition">
                            {/* Vendor info */}
                            <div className="flex items-start gap-4 min-w-0">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#EF4444] flex items-center justify-center text-white font-bold text-lg shrink-0">
                                    {(req.vendor_name || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground">{req.vendor_name}</p>
                                    {req.message && (
                                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                            "{req.message}"
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {req.created_at ? formatDate(req.created_at) : 'Unknown date'}
                                    </p>
                                </div>
                            </div>

                            {/* Status + Actions */}
                            <div className="flex items-center gap-3 shrink-0">
                                {/* Status badge */}
                                <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full border ${
                                    req.status === 'pending'
                                        ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                                        : req.status === 'accepted'
                                            ? 'text-green-400 border-green-400/40 bg-green-400/10'
                                            : 'text-red-400 border-red-400/40 bg-red-400/10'
                                }`}>
                                    {req.status}
                                </span>

                                {/* Pending actions */}
                                {req.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => respondToRequest(req.request_id, 'accept')}
                                            disabled={processing === req.request_id}
                                            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                                            {processing === req.request_id ? '…' : '✓ Accept'}
                                        </button>
                                        <button
                                            onClick={() => { setRejectModal(req.request_id); setRejectReason(''); }}
                                            disabled={processing === req.request_id}
                                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium transition disabled:opacity-50">
                                            ✕ Reject
                                        </button>
                                    </>
                                )}

                                {/* Accepted: open chat */}
                                {req.status === 'accepted' && (
                                    <button
                                        onClick={() => openChatForRequest(req)}
                                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
                                        💬 Open Chat
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reject modal */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
                    onClick={(e) => e.target === e.currentTarget && setRejectModal(null)}>
                    <div className="bg-popover border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold text-foreground mb-1">Reject Request</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Optionally explain why you're declining this vendor's request.
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason (optional)…"
                            rows={3}
                            className="w-full bg-input border border-border rounded-lg p-3 text-sm text-foreground focus:border-primary focus:outline-none resize-none"
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setRejectModal(null)}
                                className="px-4 py-2 bg-card border border-border rounded-lg text-sm text-muted-foreground hover:text-white transition">
                                Cancel
                            </button>
                            <button
                                onClick={() => respondToRequest(rejectModal, 'reject', rejectReason)}
                                disabled={!!processing}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                                {processing ? '…' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorRequests;
