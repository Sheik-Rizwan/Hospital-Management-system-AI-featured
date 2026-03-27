import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate, connectSocket, getRoleAuth, clearRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ProfileModal from '../components/ProfileModal';
import ProcurementPanel from '../components/procurement/ProcurementPanel';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';


import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DeviceThermostatOutlinedIcon from '@mui/icons-material/DeviceThermostatOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';

const SuperAdminDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('dashboard');
    const [stats, setStats] = useState({ total_patients: 0, total_nurses: 0, total_doctors: 0, total_handoffs: 0, pending_vendors: 0, total_vendors: 0 });

    const [nurses, setNurses] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [patients, setPatients] = useState([]);
    const [handoffs, setHandoffs] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [logs, setLogs] = useState([]);

    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showCreateDoctor, setShowCreateDoctor] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [procurementRefreshKey, setProcurementRefreshKey] = useState(0);

    const [doctorForm, setDoctorForm] = useState({
        email: '', password: '', full_name: '', specialization: '', license_number: '', department: '', phone: ''
    });

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('super_admin');
        if (u) setUser(u);
        connectSocket('super_admin');
        loadData();
    }, []);

    useRealtimeEvents({
        'quotation_submitted': (data) => { showNotify(` ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'order_status_update': (data) => { showNotify(` ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'procurement_updated': (data) => { showNotify(` ${data.message}`, 'info'); setProcurementRefreshKey(k => k + 1); },
        'low_stock_alert': (data) => { showNotify(`️ ${data.message}`, 'error'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'restock_request': (data) => { showNotify(` ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'inventory_updated': (data) => { showNotify(`Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info'); setProcurementRefreshKey(k => k + 1); }
    }, null, null, 'super_admin');

    const loadData = async () => {
        setLoading(true);
        const headers = getAuthHeaders('super_admin');
        try {
            const fetchData = async (url, setter, field = null) => {
                try {
                    const res = await fetch(`${API_BASE}${url}`, { headers });
                    if (!res.ok) throw new Error(`Status: ${res.status}`);
                    const data = await res.json();
                    if (data.success || res.ok) {
                        setter(field ? data[field] : data);
                        return true;
                    }
                } catch (err) { }
                return false;
            };
            await Promise.allSettled([
                fetchData('/admin/stats', (data) => setStats(data.stats)),
                fetchData('/admin/doctors', (data) => setDoctors(data.doctors)),
                fetchData('/admin/nurses', (data) => setNurses(data.nurses)),
                fetchData('/admin/patients', (data) => setPatients(data.patients)),
                fetchData('/admin/handoffs', (data) => setHandoffs(data.handoffs || [])),
                fetchData('/admin/appointment-logs', (data) => setLogs(data.logs || [])),
                fetchData('/admin/vendors', (data) => setVendors(data.vendors || [])),
            ]);
        } catch (error) {
            showNotify('Some data failed to load', 'error');
        }
        setLoading(false);
    };

    const handleCreateDoctor = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/doctor/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(doctorForm)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Doctor created successfully!', 'success');
                setShowCreateDoctor(false);
                setDoctorForm({ email: '', password: '', full_name: '', specialization: '', license_number: '', department: '', phone: '' });
                loadData();
            } else {
                showNotify(data.error || 'Failed to create doctor', 'error');
            }
        } catch (error) {
            showNotify('Error creating doctor', 'error');
        }
        setLoading(false);
    };

    const handleApproveVendor = async (id) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/vendors/${id}/approve`, { method: 'PUT', headers: getAuthHeaders('super_admin') });
            const data = await res.json();
            if (data.success) { showNotify('Vendor approved successfully', 'success'); loadData(); }
            else showNotify(data.error || 'Approval failed', 'error');
        } catch (error) { showNotify('Error approving vendor', 'error'); }
        setLoading(false);
    };

    const handleRejectVendor = async (id) => {
        const reason = window.prompt('Enter rejection reason (optional):');
        if (reason === null) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/vendors/${id}/reject`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) { showNotify('Vendor rejected', 'success'); loadData(); }
            else showNotify(data.error || 'Rejection failed', 'error');
        } catch (error) { showNotify('Error rejecting vendor', 'error'); }
        setLoading(false);
    };

    const handleDelete = async (type, id) => {
        if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/${type}s/${id}`, { method: 'DELETE', headers: getAuthHeaders('super_admin') });
            const data = await res.json();
            if (data.success) { showNotify(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`, 'success'); loadData(); }
            else showNotify(data.error || 'Delete failed', 'error');
        } catch (error) { showNotify('Error deleting item', 'error'); }
        setLoading(false);
    };

    const handleLogout = () => { clearRoleAuth('super_admin'); window.location.href = '/'; };

    const sidebarGroups = [
        {
            label: 'Data Connections',
            items: [
                { id: 'doctors', icon: '', label: 'Doctors' },
                { id: 'nurses', icon: '‍️', label: 'Nurses' },
                { id: 'patients', icon: '', label: 'Patients' },
                { id: 'handoffs', icon: <AssignmentOutlinedIcon fontSize="small" />, label: 'Handoffs' },
                { id: 'logs', icon: '', label: 'Audit Logs' },
                { id: 'procurement', icon: <Inventory2OutlinedIcon fontSize="small" />, label: 'Procurement' },
                { id: 'vendors', icon: '', label: 'Vendors', badge: stats.pending_vendors },
            ]
        },
        {
            label: 'System',
            items: [
                { id: 'dashboard', icon: '', label: 'Overview' },
                { id: 'reports', icon: '', label: 'Reports' },
            ]
        }
    ];

    return (
        <DashboardLayout
            title="Super Admin"
            sidebarGroups={sidebarGroups}
            activeView={view}
            onViewChange={setView}
            user={{ ...user, role: 'super_admin' }}
            onLogout={handleLogout}
            onProfileClick={() => setShowProfile(true)}
        >
            {/* Dashboard Overview */}
            {view === 'dashboard' && (
                <Stack spacing={3}>
                    <PageHeader title="System Overview" />
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Patients" value={patients.length} icon="" /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Total Doctors" value={stats.total_doctors} icon="" /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Active Nurses" value={stats.total_nurses} icon="‍️" /></Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard title="Pending Vendors" value={stats.pending_vendors} icon="" onClick={() => setView('vendors')} /></Grid>
                    </Grid>
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, lg: 6 }}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>System Health</Typography>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                                            <Typography variant="body2">Database Connection</Typography>
                                            <Typography variant="body2" color="success.main" fontWeight={700}>● Active</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                                            <Typography variant="body2">AI Services</Typography>
                                            <Typography variant="body2" color="success.main" fontWeight={700}>● Operational</Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, lg: 6 }}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Quick Actions</Typography>
                                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setView('doctors'); setShowCreateDoctor(true); }}>
                                        Add New Doctor
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Stack>
            )}

            {/* Doctors */}
            {view === 'doctors' && (
                <Stack spacing={3}>
                    <PageHeader title="Medical Staff (Doctors)" actionLabel="+ Add Doctor" onAction={() => setShowCreateDoctor(true)} />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Name</TableCell><TableCell>Specialization</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {doctors.map((d, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{d.full_name}</TableCell>
                                        <TableCell>{d.specialization}</TableCell>
                                        <TableCell><StatusChip status="active" /></TableCell>
                                        <TableCell>
                                            <Button size="small" color="error" onClick={() => handleDelete('doctor', d.user_id)}>Delete</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Nurses */}
            {view === 'nurses' && (
                <Stack spacing={3}>
                    <PageHeader title="Nursing Staff" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Name</TableCell><TableCell>Employee ID</TableCell><TableCell>Department</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {nurses.map((n, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{n.full_name}</TableCell>
                                        <TableCell>{n.employee_id}</TableCell>
                                        <TableCell>{n.department || '-'}</TableCell>
                                        <TableCell>
                                            <Button size="small" color="error" onClick={() => handleDelete('nurse', n.user_id)}>Delete</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Patients */}
            {view === 'patients' && (
                <Stack spacing={3}>
                    <PageHeader title="Patient Database" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Room</TableCell><TableCell>Diagnosis</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {patients.map(p => (
                                    <TableRow key={p.patient_id} hover>
                                        <TableCell sx={{ color: 'text.secondary' }}>{p.patient_id}</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>{p.patient_name}</TableCell>
                                        <TableCell>{p.room_number || '-'}</TableCell>
                                        <TableCell>{p.diagnosis}</TableCell>
                                        <TableCell>
                                            <Button size="small" color="error" onClick={() => handleDelete('patient', p.patient_id)}>Delete</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Handoffs */}
            {view === 'handoffs' && (
                <Stack spacing={3}>
                    <PageHeader title="Handoff Reports" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Date</TableCell><TableCell>Patient</TableCell><TableCell>Nurse</TableCell><TableCell>Shift</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {handoffs.map(h => (
                                    <TableRow key={h.handoff_id} hover>
                                        <TableCell sx={{ color: 'text.secondary' }}>{formatDate(new Date(h.timestamp))}</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>{h.patient_name || h.patient_id}</TableCell>
                                        <TableCell>{h.nurse_name}</TableCell>
                                        <TableCell><Chip label={h.shift} size="small" sx={{ textTransform: 'uppercase' }} /></TableCell>
                                        <TableCell>
                                            <Button size="small" color="error" onClick={() => handleDelete('handoff', h.handoff_id)}>Delete</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Audit Logs */}
            {view === 'logs' && (
                <Stack spacing={3}>
                    <PageHeader title="Appointment Audit Logs" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Timestamp</TableCell><TableCell>Action</TableCell><TableCell>Performed By</TableCell><TableCell>Details</TableCell><TableCell>Appt ID</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {logs.map(log => (
                                    <TableRow key={log.log_id} hover>
                                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{formatDate(new Date(log.timestamp))}</TableCell>
                                        <TableCell><StatusChip status={log.action} /></TableCell>
                                        <TableCell>
                                            <Box>
                                                <Typography variant="body2" fontWeight={500}>{log.performer_name || 'Unknown'}</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{log.performed_by_role}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>{log.details}</TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>{log.appointment_id}</TableCell>
                                    </TableRow>
                                ))}
                                {logs.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No audit logs found.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Reports */}
            {view === 'reports' && (
                <Stack spacing={3}>
                    <PageHeader title="System Reports & Logs" />
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary" sx={{ mb: 2 }}>Recent system handoffs and access logs.</Typography>
                            <Stack spacing={1.5}>
                                {handoffs.slice(0, 5).map(h => (
                                    <Box key={h.handoff_id} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2">Handoff for <strong>{h.patient_name || h.patient_id}</strong></Typography>
                                        <Typography variant="caption" color="text.secondary">{formatDate(h.timestamp)}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {/* Procurement */}
            {view === 'procurement' && (
                <ProcurementPanel showNotify={showNotify} refreshTrigger={procurementRefreshKey} />
            )}

            {/* Vendors */}
            {view === 'vendors' && (
                <Stack spacing={3}>
                    <PageHeader title="Vendor Management" />

                    {vendors.filter(v => !v.is_approved && !v.is_rejected).length > 0 && (
                        <Box>
                            <Typography variant="h6" fontWeight={700} color="warning.main" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                 Approval Requests
                                <Chip label={vendors.filter(v => !v.is_approved && !v.is_rejected).length} color="warning" size="small" />
                            </Typography>
                            <Grid container spacing={2}>
                                {vendors.filter(v => !v.is_approved && !v.is_rejected).map((v, i) => (
                                    <Grid size={{ xs: 12, md: 6 }} key={i}>
                                        <Card sx={{ border: 2, borderColor: 'warning.light', '&:hover': { borderColor: 'warning.main' }, transition: 'border-color 0.2s' }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight={700}>{v.company_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{v.email}</Typography>
                                                    </Box>
                                                    <StatusChip status="pending" />
                                                </Box>
                                                <Grid container spacing={1} sx={{ mb: 2 }}>
                                                    <Grid size={6}><Typography variant="caption" color="text.secondary">Contact:</Typography> <Typography variant="body2">{v.contact_person || '-'}</Typography></Grid>
                                                    <Grid size={6}><Typography variant="caption" color="text.secondary">Phone:</Typography> <Typography variant="body2">{v.phone || '-'}</Typography></Grid>
                                                    <Grid size={6}><Typography variant="caption" color="text.secondary">Category:</Typography> <Typography variant="body2">{v.category || 'general'}</Typography></Grid>
                                                    <Grid size={6}><Typography variant="caption" color="text.secondary">GST:</Typography> <Typography variant="body2">{v.gst_number || '-'}</Typography></Grid>
                                                </Grid>
                                                <Stack direction="row" spacing={1.5}>
                                                    <Button variant="contained" size="small" fullWidth onClick={() => handleApproveVendor(v.user_id)}> Approve</Button>
                                                    <Button variant="outlined" color="error" size="small" fullWidth onClick={() => handleRejectVendor(v.user_id)}> Reject</Button>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    )}

                    <Typography variant="h6" fontWeight={700}>All Vendors</Typography>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Company</TableCell><TableCell>Contact</TableCell><TableCell>Category</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {vendors.map((v, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{v.company_name}</TableCell>
                                        <TableCell>
                                            {v.contact_person}<br />
                                            <Typography variant="caption" color="text.secondary">{v.email}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ textTransform: 'capitalize' }}>{v.category || 'general'}</TableCell>
                                        <TableCell>
                                            <StatusChip status={v.is_approved ? 'approved' : v.is_rejected ? 'rejected' : 'pending'} />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                {!v.is_approved && !v.is_rejected && (
                                                    <Button size="small" variant="contained" onClick={() => handleApproveVendor(v.user_id)}>Approve</Button>
                                                )}
                                                <Button size="small" color="error" onClick={() => handleDelete('vendor', v.user_id)}>Delete</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {vendors.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No vendors registered.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Create Doctor Dialog */}
            <Dialog open={showCreateDoctor} onClose={() => setShowCreateDoctor(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Register New Doctor</DialogTitle>
                <DialogContent>
                    <Box component="form" id="create-doctor-form" onSubmit={handleCreateDoctor} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField label="Full Name" required onChange={e => setDoctorForm({ ...doctorForm, full_name: e.target.value })} value={doctorForm.full_name} />
                        <TextField label="Email" type="email" required onChange={e => setDoctorForm({ ...doctorForm, email: e.target.value })} value={doctorForm.email} />
                        <TextField label="Password" type="password" required autoComplete="new-password" onChange={e => setDoctorForm({ ...doctorForm, password: e.target.value })} value={doctorForm.password} />
                        <TextField label="Specialization" onChange={e => setDoctorForm({ ...doctorForm, specialization: e.target.value })} value={doctorForm.specialization} />
                        <TextField label="License Number" onChange={e => setDoctorForm({ ...doctorForm, license_number: e.target.value })} value={doctorForm.license_number} />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowCreateDoctor(false)}>Cancel</Button>
                    <Button type="submit" form="create-doctor-form" variant="contained">Create Account</Button>
                </DialogActions>
            </Dialog>

            {/* Notification */}
            <AppNotification
                open={!!notification}
                message={notification?.message || ''}
                type={notification?.type}
                onClose={() => setNotification(null)}
            />

            {/* Profile Modal */}
            <ProfileModal
                isOpen={showProfile}
                onClose={() => setShowProfile(false)}
                user={{ ...user, role: 'superadmin' }}
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </DashboardLayout>
    );
};

export default SuperAdminDashboard;
