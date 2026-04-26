import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, getRoleAuth, clearRoleAuth, connectSocket } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';

import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

const LabDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('requests');
    const [requests, setRequests] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0 });
    const [notification, setNotification] = useState(null);
    const [uploadDialog, setUploadDialog] = useState({ open: false, requestId: null });
    const [resultText, setResultText] = useState('');

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('lab_technician');
        if (u) setUser(u);
        connectSocket('lab_technician');
        loadData();
    }, []);

    const loadData = async () => {
        const headers = getAuthHeaders('lab_technician');
        try {
            const [reqRes, statsRes] = await Promise.allSettled([
                fetch(`${API_BASE}/lab/requests`, { headers }),
                fetch(`${API_BASE}/lab/stats`, { headers }),
            ]);
            if (reqRes.status === 'fulfilled' && reqRes.value.ok) {
                const d = await reqRes.value.json();
                setRequests(d.requests || []);
            }
            if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
                const d = await statsRes.value.json();
                setStats(d.stats || {});
            }
        } catch { showNotify('Failed to load data', 'error'); }
    };

    const handleUploadResult = async () => {
        const headers = getAuthHeaders('lab_technician');
        try {
            const res = await fetch(`${API_BASE}/lab/requests/${uploadDialog.requestId}/results`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ result_text: resultText }),
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Results uploaded!', 'success');
                setUploadDialog({ open: false, requestId: null });
                setResultText('');
                loadData();
            } else { showNotify(data.error || 'Upload failed', 'error'); }
        } catch { showNotify('Error uploading results', 'error'); }
    };

    const handleLogout = () => { clearRoleAuth('lab_technician'); window.location.href = '/'; };

    const sidebarGroups = [{
        label: 'Lab',
        items: [
            { id: 'requests', icon: <AssignmentOutlinedIcon fontSize="small" />, label: 'Requests', badge: stats.pending },
            { id: 'dashboard', icon: <DashboardOutlinedIcon fontSize="small" />, label: 'Overview' },
            { id: 'stats', icon: <BarChartOutlinedIcon fontSize="small" />, label: 'Statistics' },
        ]
    }];

    return (
        <DashboardLayout title="Lab Technician" sidebarGroups={sidebarGroups} activeView={view} onViewChange={setView}
            user={{ ...user, role: 'lab_technician' }} onLogout={handleLogout}>

            {view === 'dashboard' && (
                <Stack spacing={3}>
                    <PageHeader title="Lab Overview" />
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Total Requests" value={stats.total} icon={<ScienceOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Pending" value={stats.pending} icon={<AssignmentOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Completed" value={stats.completed} icon={<BarChartOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                    </Grid>
                </Stack>
            )}

            {view === 'requests' && (
                <Stack spacing={3}>
                    <PageHeader title="Lab Requests" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Test Name</TableCell><TableCell>Category</TableCell><TableCell>Urgency</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {requests.map((r, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{r.test_name}</TableCell>
                                        <TableCell>{r.test_category || '-'}</TableCell>
                                        <TableCell><Chip label={r.urgency} size="small" color={r.urgency === 'stat' ? 'error' : r.urgency === 'urgent' ? 'warning' : 'default'} /></TableCell>
                                        <TableCell><StatusChip status={r.status} /></TableCell>
                                        <TableCell>
                                            {r.status === 'pending' && (
                                                <Button size="small" variant="contained" onClick={() => setUploadDialog({ open: true, requestId: r.id })}>Upload Results</Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {requests.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No lab requests.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'stats' && (
                <Stack spacing={3}>
                    <PageHeader title="Lab Statistics" />
                    <Card><CardContent><Typography color="text.secondary">Detailed statistics and trends coming soon.</Typography></CardContent></Card>
                </Stack>
            )}

            <Dialog open={uploadDialog.open} onClose={() => setUploadDialog({ open: false, requestId: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Upload Lab Results</DialogTitle>
                <DialogContent>
                    <TextField fullWidth multiline rows={6} label="Result Text" value={resultText} onChange={e => setResultText(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setUploadDialog({ open: false, requestId: null })}>Cancel</Button>
                    <Button variant="contained" onClick={handleUploadResult} disabled={!resultText.trim()}>Upload</Button>
                </DialogActions>
            </Dialog>

            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />
        </DashboardLayout>
    );
};

export default LabDashboard;
