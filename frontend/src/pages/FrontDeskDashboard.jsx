import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, getRoleAuth, clearRoleAuth, connectSocket } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import PageHeader from '../components/ui/PageHeader';

import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ReceiptOutlinedIcon from '@mui/icons-material/ReceiptOutlined';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

const FrontDeskDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('patients');
    const [patients, setPatients] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [notification, setNotification] = useState(null);

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('front_desk');
        if (u) setUser(u);
        connectSocket('front_desk');
        loadData();
    }, []);

    const loadData = async () => {
        const headers = getAuthHeaders('front_desk');
        try {
            const [patRes, apptRes, invRes] = await Promise.allSettled([
                fetch(`${API_BASE}/frontdesk/patients`, { headers }),
                fetch(`${API_BASE}/frontdesk/appointments`, { headers }),
                fetch(`${API_BASE}/frontdesk/invoices`, { headers }),
            ]);
            if (patRes.status === 'fulfilled' && patRes.value.ok) {
                const d = await patRes.value.json();
                setPatients(d.patients || []);
            }
            if (apptRes.status === 'fulfilled' && apptRes.value.ok) {
                const d = await apptRes.value.json();
                setAppointments(d.appointments || []);
            }
            if (invRes.status === 'fulfilled' && invRes.value.ok) {
                const d = await invRes.value.json();
                setInvoices(d.invoices || []);
            }
        } catch { showNotify('Failed to load data', 'error'); }
    };

    const handleLogout = () => { clearRoleAuth('front_desk'); window.location.href = '/'; };

    const sidebarGroups = [{
        label: 'Front Desk',
        items: [
            { id: 'patients', icon: <PeopleOutlinedIcon fontSize="small" />, label: 'Patients' },
            { id: 'appointments', icon: <CalendarTodayOutlinedIcon fontSize="small" />, label: 'Appointments' },
            { id: 'invoices', icon: <ReceiptOutlinedIcon fontSize="small" />, label: 'Invoices' },
        ]
    }];

    return (
        <DashboardLayout title="Front Desk" sidebarGroups={sidebarGroups} activeView={view} onViewChange={setView}
            user={{ ...user, role: 'front_desk' }} onLogout={handleLogout}>

            {view === 'patients' && (
                <Stack spacing={3}>
                    <PageHeader title="Patient Registry" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Patient ID</TableCell><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Phone</TableCell><TableCell>Gender</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {patients.map((p, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.patient_id || '-'}</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                                        <TableCell>{p.email || '-'}</TableCell>
                                        <TableCell>{p.phone || '-'}</TableCell>
                                        <TableCell>{p.gender || '-'}</TableCell>
                                    </TableRow>
                                ))}
                                {patients.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No patients registered.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'appointments' && (
                <Stack spacing={3}>
                    <PageHeader title="Appointments" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Date</TableCell><TableCell>Time</TableCell><TableCell>Service</TableCell><TableCell>Status</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {appointments.map((a, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell>{a.date}</TableCell>
                                        <TableCell>{a.start_time}</TableCell>
                                        <TableCell>{a.service_name || '-'}</TableCell>
                                        <TableCell><Chip label={a.status} size="small" sx={{ textTransform: 'capitalize' }} /></TableCell>
                                    </TableRow>
                                ))}
                                {appointments.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No appointments.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'invoices' && (
                <Stack spacing={3}>
                    <PageHeader title="Invoices & Billing" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Invoice #</TableCell><TableCell>Service</TableCell><TableCell>Amount</TableCell><TableCell>Status</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {invoices.map((inv, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontFamily: 'monospace' }}>{inv.invoice_number}</TableCell>
                                        <TableCell>{inv.service_code || inv.description || '-'}</TableCell>
                                        <TableCell>₹{inv.total}</TableCell>
                                        <TableCell><Chip label={inv.status} size="small" color={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'error' : 'warning'} /></TableCell>
                                    </TableRow>
                                ))}
                                {invoices.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No invoices.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />
        </DashboardLayout>
    );
};

export default FrontDeskDashboard;
