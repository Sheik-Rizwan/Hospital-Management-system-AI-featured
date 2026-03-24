import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, logout, formatDate, handleAuthError } from '../utils/api';
import ProfileModal from '../components/ProfileModal';
import BookAppointment from '../components/BookAppointment';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';

const PatientDashboard = () => {
    const [info, setInfo] = useState(null);
    const [handoffs, setHandoffs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [chatQuestion, setChatQuestion] = useState('');
    const [chatResponse, setChatResponse] = useState('');
    const [user, setUser] = useState({});
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showBookAppointment, setShowBookAppointment] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const showNotify = (msg, type = 'info') => setNotification({ message: msg, type });

    useEffect(() => {
        const u = JSON.parse(sessionStorage.getItem('user'));
        if (u) setUser(u);
        loadData();
    }, []);

    const loadData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            const [infoRes, handoffRes, apptRes] = await Promise.all([
                fetch(`${API_BASE}/patient/my-data`, { headers: getAuthHeaders() }),
                fetch(`${API_BASE}/patient/my-handoffs`, { headers: getAuthHeaders() }),
                fetch(`${API_BASE}/patient/appointments`, { headers: getAuthHeaders() })
            ]);

            const infoData = await infoRes.json();
            const handoffData = await handoffRes.json();
            const apptData = await apptRes.json();

            if (infoData.success) {
                setInfo(infoData.data);
                if (infoData.data.patient_name) {
                    setUser(prev => {
                        const updated = { ...prev, patient_name: infoData.data.patient_name };
                        sessionStorage.setItem('user', JSON.stringify(updated));
                        return updated;
                    });
                }
            }
            if (handoffData.success) setHandoffs(handoffData.handoffs);
            if (apptData.success) {
                const newAppointments = apptData.appointments || [];
                if (background && appointments.length > 0) {
                    newAppointments.forEach(newApt => {
                        const oldApt = appointments.find(a => a.appointment_id === newApt.appointment_id);
                        if (oldApt && oldApt.status !== newApt.status) {
                            if (newApt.status === 'approved' || newApt.status === 'confirmed') {
                                showNotify(`Great news! Your appointment with Dr. ${newApt.doctor_name} has been approved.`, 'success');
                            } else if (newApt.status === 'rejected') {
                                showNotify(`Important: Your appointment with Dr. ${newApt.doctor_name} was rejected. Please check details.`, 'error');
                            }
                        }
                    });
                }
                setAppointments(newAppointments);
            }
        } catch (e) {
            if (!background) handleAuthError(e, showNotify);
        }
        if (!background) setLoading(false);
    };

    useEffect(() => {
        const interval = setInterval(() => { loadData(true); }, 30000);
        return () => clearInterval(interval);
    }, [appointments]);

    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatQuestion.trim()) return;
        setChatResponse('Thinking...');
        try {
            const res = await fetch(`${API_BASE}/patient/chatbot`, {
                method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question: chatQuestion })
            });
            const data = await res.json();
            setChatResponse(data.success ? data.answer : data.error);
        } catch (e) { setChatResponse('Error getting response'); }
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
        try {
            const res = await fetch(`${API_BASE}/patient/appointments/${appointmentId}/cancel`, {
                method: 'PATCH', headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) { showNotify('Appointment cancelled successfully', 'success'); loadData(); }
            else showNotify(data.error || 'Failed to cancel', 'error');
        } catch (e) { showNotify('Failed to cancel appointment', 'error'); }
    };

    const sidebarItems = [
        { id: 'overview', icon: '📋', label: 'Overview' },
        { id: 'appointments', icon: '📅', label: 'Appointments' },
        { id: 'history', icon: '📜', label: 'Care History' },
    ];

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
                <CircularProgress />
            </Box>
        );
    }

    const vitalColorMap = {
        blue: { bg: 'rgba(24,144,255,0.08)', text: 'primary.main' },
        red: { bg: 'rgba(255,77,79,0.08)', text: 'error.main' },
        yellow: { bg: 'rgba(255,193,7,0.08)', text: 'warning.main' },
        green: { bg: 'rgba(82,196,26,0.08)', text: 'success.main' },
        purple: { bg: 'rgba(114,46,209,0.08)', text: 'secondary.main' },
    };

    const renderVitalTile = (label, value, unit, colorClass) => {
        const colors = vitalColorMap[colorClass] || vitalColorMap.blue;
        let displayValue = value;
        if (value && typeof value === 'object') displayValue = value.value || value.reading || JSON.stringify(value);
        return (
            <Card sx={{ bgcolor: colors.bg, textAlign: 'center' }}>
                <CardContent sx={{ py: 2 }}>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ color: colors.text, my: 0.5 }}>{displayValue || '--'}</Typography>
                    <Typography variant="caption" color="text.secondary">{unit}</Typography>
                </CardContent>
            </Card>
        );
    };

    return (
        <DashboardLayout
            title="Patient Portal"
            sidebarItems={sidebarItems}
            activeView={activeTab}
            onViewChange={setActiveTab}
            user={{ ...user, role: 'patient', full_name: user.patient_name }}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
        >
            {/* ── Overview ── */}
            {activeTab === 'overview' && (
                <Stack spacing={3}>
                    <PageHeader title="My Information" />
                    {info ? (
                        <Grid container spacing={2}>
                            {[
                                { label: 'Patient ID', value: info.patient_id },
                                { label: 'Room', value: info.room_number || 'Not Assigned' },
                                { label: 'Status', value: info.status || 'Active' },
                                { label: 'Diagnosis', value: info.diagnosis || 'N/A' },
                                { label: 'Admission Date', value: formatDate(info.admission_date) },
                                { label: 'Total Records', value: String(handoffs.length) },
                            ].map(item => (
                                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item.label}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                                            <Typography variant="h6" fontWeight={600}>{item.value}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    ) : (
                        <Typography color="text.secondary">No patient data available.</Typography>
                    )}

                    {/* Upcoming Appointment Widget */}
                    {(() => {
                        const nextApt = appointments
                            .filter(a => (a.status === 'approved' || a.status === 'confirmed') && new Date(a.date) >= new Date().setHours(0,0,0,0))
                            .sort((a,b) => new Date(a.date) - new Date(b.date))[0];
                        if (!nextApt) return null;
                        return (
                            <Card sx={{ background: 'linear-gradient(135deg, #4f46e5, #2563eb)', color: '#fff' }}>
                                <CardContent>
                                    <Typography variant="h6" fontWeight={700} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        📅 Upcoming Appointment
                                    </Typography>
                                    <Typography variant="h5" fontWeight={700}>
                                        {new Date(nextApt.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </Typography>
                                    <Typography variant="body1" sx={{ opacity: 0.9, mb: 2 }}>{nextApt.start_time} - {nextApt.end_time}</Typography>
                                    <Stack direction="row" spacing={1.5}>
                                        <Box sx={{ bgcolor: 'rgba(255,255,255,0.15)', px: 2, py: 1, borderRadius: 1 }}>👨‍⚕️ Dr. {nextApt.doctor_name}</Box>
                                        <Box sx={{ bgcolor: 'rgba(255,255,255,0.15)', px: 2, py: 1, borderRadius: 1 }}>🩺 {nextApt.doctor_specialization || 'General'}</Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })()}

                    {/* Vitals */}
                    <Card>
                        <CardContent>
                            <Typography variant="h5" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>💓 Latest Vitals</Typography>
                            {info?.latest_vitals ? (
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 6, md: 2.4 }}>{renderVitalTile('Heart Rate', info.latest_vitals.heart_rate, 'bpm', 'blue')}</Grid>
                                    <Grid size={{ xs: 6, md: 2.4 }}>{renderVitalTile('Blood Pressure', info.latest_vitals.blood_pressure, 'mmHg', 'red')}</Grid>
                                    <Grid size={{ xs: 6, md: 2.4 }}>{renderVitalTile('Temperature', info.latest_vitals.temperature, '°F', 'yellow')}</Grid>
                                    <Grid size={{ xs: 6, md: 2.4 }}>{renderVitalTile('SpO2', info.latest_vitals.oxygen_saturation, '%', 'green')}</Grid>
                                    <Grid size={{ xs: 6, md: 2.4 }}>{renderVitalTile('Resp. Rate', info.latest_vitals.respiratory_rate, '/min', 'purple')}</Grid>
                                </Grid>
                            ) : (
                                <Typography color="text.secondary" align="center" sx={{ py: 3 }}>No vitals recorded yet.</Typography>
                            )}
                        </CardContent>
                    </Card>

                    {/* Chatbot */}
                    <Card>
                        <CardContent>
                            <Typography variant="h5" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>🤖 Ask About My Health</Typography>
                            <Box component="form" onSubmit={handleChat} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <TextField
                                    fullWidth
                                    placeholder="e.g., What are my latest vitals? What medications am I on?"
                                    value={chatQuestion}
                                    onChange={(e) => setChatQuestion(e.target.value)}
                                />
                                <Button type="submit" variant="contained" fullWidth>Ask Question</Button>
                            </Box>
                            {chatResponse && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Response:</Typography>
                                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{chatResponse}</Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {/* ── Appointments ── */}
            {activeTab === 'appointments' && (
                <Stack spacing={3}>
                    <Card sx={{ background: 'linear-gradient(135deg, #22c55e, #14b8a6)', color: '#fff' }}>
                        <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                            <Box>
                                <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>📅 Book an Appointment</Typography>
                                <Typography sx={{ opacity: 0.9 }}>Schedule a visit with one of our doctors</Typography>
                            </Box>
                            <Button variant="contained" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                                onClick={() => setShowBookAppointment(true)}>
                                Find a Doctor →
                            </Button>
                        </CardContent>
                    </Card>

                    <PageHeader title="My Appointments" />
                    {appointments.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <Typography sx={{ fontSize: '3rem', mb: 1 }}>📅</Typography>
                            <Typography color="text.secondary">No appointments yet. Book your first appointment above!</Typography>
                        </Box>
                    ) : (
                        <Stack spacing={2}>
                            {appointments.map(apt => (
                                <Card key={apt.appointment_id} variant="outlined" sx={{ '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}>
                                    <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                                <StatusChip status={apt.status} />
                                                <Typography variant="caption" color="text.secondary">{apt.appointment_id}</Typography>
                                            </Stack>
                                            <Typography fontWeight={600}>Dr. {apt.doctor_name || 'Doctor'}</Typography>
                                            <Typography variant="body2" color="text.secondary">📅 {apt.date} | ⏰ {apt.start_time} - {apt.end_time}</Typography>
                                            {apt.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>📝 {apt.notes}</Typography>}
                                            {apt.rejection_reason && <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>❌ {apt.rejection_reason}</Typography>}
                                        </Box>
                                        {['pending', 'pending_doctor_approval', 'approved', 'confirmed'].includes(apt.status) && (
                                            <Button color="error" variant="outlined" size="small" onClick={() => handleCancelAppointment(apt.appointment_id)}>Cancel</Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </Stack>
            )}

            {/* ── History ── */}
            {activeTab === 'history' && (
                <Stack spacing={3}>
                    <PageHeader title="My Care History" />
                    {handoffs.length === 0 ? (
                        <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No care records found.</Typography>
                    ) : (
                        <Stack spacing={2}>
                            {handoffs.map((h, idx) => (
                                <Card key={idx} variant="outlined" sx={{ borderLeft: 4, borderLeftColor: 'success.main', '&:hover': { bgcolor: 'action.hover' }, transition: 'background 0.2s' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                            <Box>
                                                <Typography fontWeight={700} color="success.main">{h.shift} Shift</Typography>
                                                <Typography variant="body2" color="text.secondary">Nurse: {h.nurse_name}</Typography>
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">{formatDate(h.timestamp)}</Typography>
                                        </Box>
                                        {h.structured_report?.vitals && (
                                            <Box sx={{ mt: 1, p: 1.5, bgcolor: 'success.main', borderRadius: 1, opacity: 0.08 }}>
                                                <Typography variant="caption"><strong>Vitals:</strong>{' '}
                                                    HR: {typeof h.structured_report.vitals.heart_rate === 'object' ? h.structured_report.vitals.heart_rate?.value : h.structured_report.vitals.heart_rate || '--'},
                                                    BP: {typeof h.structured_report.vitals.blood_pressure === 'object' ? h.structured_report.vitals.blood_pressure?.value : h.structured_report.vitals.blood_pressure || '--'}
                                                </Typography>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </Stack>
            )}

            {/* Book Appointment Dialog */}
            <Dialog open={showBookAppointment} onClose={() => setShowBookAppointment(false)} maxWidth="md" fullWidth>
                <BookAppointment
                    onClose={() => setShowBookAppointment(false)}
                    onSuccess={() => { loadData(); setActiveTab('appointments'); }}
                />
            </Dialog>

            {/* Notification */}
            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />

            {/* Profile Modal */}
            <ProfileModal
                isOpen={showProfile}
                onClose={() => setShowProfile(false)}
                user={{...user, role: 'patient', full_name: user.patient_name}}
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </DashboardLayout>
    );
};

export default PatientDashboard;