import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';
import SocketChatRoom from '../components/SocketChatRoom';
import { useSocket } from '../hooks/useSocket';

// MUI Components

import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import PageHeader from '../components/ui/PageHeader';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

const VendorRequests = ({ showNotify }) => {
    const [requests, setRequests]     = useState([]);
    const [loading, setLoading]       = useState(true);
    const [activeTab, setActiveTab]   = useState('pending');
    const [activeChat, setActiveChat] = useState(null); // { chat_id, other_participant }
    const [rejectModal, setRejectModal] = useState(null); // request_id or null
    const [rejectReason, setRejectReason] = useState('');
    const [processing, setProcessing] = useState(''); // request_id being processed

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
            }
        } catch (e) {
            console.error('Error loading requests:', e);
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
                        ? 'Request accepted — chat room created!'
                        : 'Request rejected.',
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
        return requests.filter(r => r.status === activeTab);
    })();

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'warning';
            case 'accepted': return 'success';
            case 'rejected': return 'error';
            default: return 'default';
        }
    };

    if (activeChat) {
        return (
            <Box sx={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
                <SocketChatRoom
                    chat={activeChat}
                    authRole="doctor"
                    onBack={() => setActiveChat(null)}
                />
            </Box>
        );
    }

    return (
        <Stack spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <PageHeader 
                title="Vendor Requests" 
                subtitle="Manage incoming connection requests from medical vendors"
                actionLabel="Refresh List"
                onAction={loadRequests}
                actionIcon={<RefreshIcon />}
            />

            {/* Filter Tabs */}
            <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pb: 1 }}>
                {[
                    { key: 'pending', label: 'Pending', icon: <HourglassEmptyOutlinedIcon fontSize="small" /> },
                    { key: 'accepted', label: 'Accepted', icon: <CheckCircleOutlinedIcon fontSize="small" /> },
                    { key: 'rejected', label: 'Rejected', icon: <CancelOutlinedIcon fontSize="small" /> },
                    { key: 'all', label: 'All Requests', icon: <AssignmentOutlinedIcon fontSize="small" /> }
                ].map((tab) => {
                    const count = tab.key === 'all' ? requests.length : requests.filter(r => r.status === tab.key).length;
                    return (
                        <Button
                            key={tab.key}
                            variant={activeTab === tab.key ? 'contained' : 'outlined'}
                            onClick={() => setActiveTab(tab.key)}
                            startIcon={<span>{tab.icon}</span>}
                            sx={{ borderRadius: 2, px: 2, py: 1, whiteSpace: 'nowrap' }}
                        >
                            {tab.label} {count > 0 && (
                                <Chip 
                                    label={count} 
                                    size="small" 
                                    sx={{ 
                                        ml: 1, 
                                        height: 20, 
                                        bgcolor: activeTab === tab.key ? 'white/20' : 'action.selected',
                                        color: activeTab === tab.key ? 'white' : 'text.primary',
                                        fontWeight: 700 
                                    }} 
                                />
                            )}
                        </Button>
                    );
                })}
            </Stack>

            {/* Content List */}
            {loading ? (
                <Box sx={{ py: 12, textAlign: 'center', opacity: 0.5 }}>
                    <Typography variant="body2">Loading requests...</Typography>
                </Box>
            ) : filtered.length === 0 ? (
                <Card variant="outlined" sx={{ py: 12, textAlign: 'center', bgcolor: 'action.hover', borderStyle: 'dashed' }}>
                    <Typography variant="h2" sx={{ opacity: 0.2, mb: 2 }}>
                        {activeTab === 'pending' ? <HourglassEmptyOutlinedIcon sx={{ fontSize: 48 }} /> : activeTab === 'accepted' ? <CheckCircleOutlinedIcon sx={{ fontSize: 48 }} /> : <InboxOutlinedIcon sx={{ fontSize: 48 }} />}
                    </Typography>
                    <Typography variant="h6" color="text.secondary">No {activeTab === 'all' ? '' : activeTab} requests</Typography>
                    <Typography variant="body2" color="text.disabled">Everythings clear!</Typography>
                </Card>
            ) : (
                <Grid container spacing={2}>
                    {filtered.map(req => (
                        <Grid item xs={12} key={req.request_id}>
                            <Card variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }, transition: '0.2s' }}>
                                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 280 }}>
                                            <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontWeight: 800 }}>
                                                {(req.vendor_name || '?')[0].toUpperCase()}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{req.vendor_name}</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mb: 0.5 }}>
                                                    {req.message ? `"${req.message}"` : 'No message provided'}
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">{formatDate(req.created_at)}</Typography>
                                            </Box>
                                        </Box>

                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Chip 
                                                label={req.status.toUpperCase()} 
                                                size="small" 
                                                color={getStatusColor(req.status)} 
                                                variant="soft" 
                                                sx={{ fontWeight: 800, fontSize: '0.65rem' }} 
                                            />
                                            
                                            {req.status === 'pending' && (
                                                <Stack direction="row" spacing={1}>
                                                    <Button 
                                                        size="small" 
                                                        variant="contained" 
                                                        startIcon={<CheckIcon />}
                                                        disabled={!!processing}
                                                        onClick={() => respondToRequest(req.request_id, 'accept')}
                                                    >
                                                        Accept
                                                    </Button>
                                                    <Button 
                                                        size="small" 
                                                        variant="outlined" 
                                                        color="error"
                                                        startIcon={<CloseIcon />}
                                                        disabled={!!processing}
                                                        onClick={() => { setRejectModal(req.request_id); setRejectReason(''); }}
                                                    >
                                                        Reject
                                                    </Button>
                                                </Stack>
                                            )}

                                            {req.status === 'accepted' && (
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    startIcon={<ChatBubbleOutlineIcon />}
                                                    onClick={() => openChatForRequest(req)}
                                                >
                                                    Open Chat
                                                </Button>
                                            )}
                                        </Stack>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Reject Modal */}
            <Dialog open={Boolean(rejectModal)} onClose={() => setRejectModal(null)} fullWidth maxWidth="xs">
                <DialogTitle sx={{ fontWeight: 700 }}>Reject Request</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                        Optionally provide a reason for declining this vendor connection request.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Reason (Optional)"
                        fullWidth
                        multiline
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectModal(null)} color="inherit">Cancel</Button>
                    <Button 
                        onClick={() => respondToRequest(rejectModal, 'reject', rejectReason)}
                        color="error" 
                        variant="contained"
                        disabled={!!processing}
                    >
                        {processing ? 'Declining...' : 'Reject Request'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default VendorRequests;
