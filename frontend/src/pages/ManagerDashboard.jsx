import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, getRoleAuth, clearRoleAuth, connectSocket } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';

import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';

const ManagerDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('dashboard');
    const [stats, setStats] = useState({});
    const [staff, setStaff] = useState([]);
    const [patients, setPatients] = useState([]);
    const [notification, setNotification] = useState(null);

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('hospital_manager');
        if (u) setUser(u);
        connectSocket('hospital_manager');
        loadData();
    }, []);

    const loadData = async () => {
        const headers = getAuthHeaders('hospital_manager');
        try {
            const [statsRes, staffRes, patientsRes] = await Promise.allSettled([
                fetch(`${API_BASE}/manager/dashboard`, { headers }),
                fetch(`${API_BASE}/manager/staff`, { headers }),
                fetch(`${API_BASE}/manager/patients`, { headers }),
            ]);
            if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
                const d = await statsRes.value.json();
                if (d.success) setStats(d.stats || {});
            }
            if (staffRes.status === 'fulfilled' && staffRes.value.ok) {
                const d = await staffRes.value.json();
                if (d.success) setStaff(d.staff || []);
            }
            if (patientsRes.status === 'fulfilled' && patientsRes.value.ok) {
                const d = await patientsRes.value.json();
                if (d.success) setPatients(d.patients || []);
            }
        } catch {
            showNotify('Failed to load data', 'error');
        }
    };

    const handleLogout = () => { clearRoleAuth('hospital_manager'); window.location.href = '/'; };

    const sidebarGroups = [
        {
            label: 'Analytics',
            items: [
                { id: 'dashboard', icon: <DashboardOutlinedIcon fontSize="small" />, label: 'Overview' },
                { id: 'staff', icon: <LocalHospitalOutlinedIcon fontSize="small" />, label: 'Staff' },
                { id: 'patients', icon: <PeopleOutlinedIcon fontSize="small" />, label: 'Patient Census' },
                { id: 'reports', icon: <BarChartOutlinedIcon fontSize="small" />, label: 'Reports' },
            ]
        },
    ];

    return (
        <DashboardLayout
            title="Hospital Manager"
            sidebarGroups={sidebarGroups}
            activeView={view}
            onViewChange={setView}
            user={{ ...user, role: 'hospital_manager' }}
            onLogout={handleLogout}
        >
            {view === 'dashboard' && (
                <Stack spacing={3}>
                    <PageHeader title="Hospital Overview" />
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Patients" value={stats.total_patients || 0} icon={<PeopleOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Doctors" value={stats.total_doctors || 0} icon={<LocalHospitalOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Nurses" value={stats.total_nurses || 0} icon={<PersonOutlineOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Users" value={stats.total_users || 0} icon={<PeopleOutlinedIcon sx={{ fontSize: 32 }} />} /></Grid>
                    </Grid>
                </Stack>
            )}

            {view === 'staff' && (
                <Stack spacing={3}>
                    <PageHeader title="Staff Directory" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Email</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {staff.map((s, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{s.name}</TableCell>
                                        <TableCell><Chip label={s.role} size="small" sx={{ textTransform: 'capitalize' }} /></TableCell>
                                        <TableCell>{s.email}</TableCell>
                                    </TableRow>
                                ))}
                                {staff.length === 0 && <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No staff found.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'patients' && (
                <Stack spacing={3}>
                    <PageHeader title="Patient Census (Read-Only)" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Patient ID</TableCell><TableCell>Name</TableCell><TableCell>Gender</TableCell><TableCell>Phone</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {patients.map((p, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.patient_id || '-'}</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                                        <TableCell>{p.gender || '-'}</TableCell>
                                        <TableCell>{p.phone || '-'}</TableCell>
                                    </TableRow>
                                ))}
                                {patients.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No patients found.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'reports' && (
                <Stack spacing={3}>
                    <PageHeader title="Reports & Analytics" />
                    <Card><CardContent><Typography color="text.secondary">Financial and performance reports will be available here.</Typography></CardContent></Card>
                </Stack>
            )}

            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />
        </DashboardLayout>
    );
};

export default ManagerDashboard;
