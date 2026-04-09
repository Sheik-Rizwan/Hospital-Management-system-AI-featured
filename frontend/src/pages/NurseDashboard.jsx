import React, { useState, useEffect, useCallback, useRef, Component } from 'react';

// Error Boundary — catches any crash inside PatientsVitalsModal without blanking the dashboard
class VitalsErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.error('[VitalsModal crash]', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                    <p style={{ fontSize: '2rem' }}><WarningAmberOutlinedIcon sx={{ fontSize: 32 }} /></p>
                    <p>Vitals panel encountered a display error. Please reload and try again.</p>
                    <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 8, cursor: 'pointer' }}>Retry</button>
                </div>
            );
        }
        return this.props.children;
    }
}
import { API_BASE, getAuthHeaders, logout, checkConnectionStatus, formatDate, handleAuthError, connectSocket } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ViewHandoffModal from '../components/ViewHandoffModal';
import PatientsVitalsModal from '../components/PatientsVitalsModal';
import TaskCard from '../components/TaskCard';
import { taskService } from '../services/taskService';
import HandoffFormModal from '../components/HandoffFormModal';
import ProfileModal from '../components/ProfileModal';
import BookAppointment from '../components/BookAppointment';
import RequestItemModal from '../components/procurement/RequestItemModal';
import InventoryPanel from '../components/procurement/InventoryPanel';
import PatientEditModal from '../components/PatientEditModal';
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
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Divider from '@mui/material/Divider';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const NurseDashboard = () => {
    const [view, setView] = useState('dashboard');
    const viewRef = useRef('dashboard');
    useEffect(() => { viewRef.current = view; }, [view]);

    const [stats, setStats] = useState({});
    const [tasks, setTasks] = useState([]);
    const [nurseStatus, setNurseStatus] = useState('online');
    const [taskFilter, setTaskFilter] = useState('all');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectingTask, setRejectingTask] = useState(null);
    const [showRequestItemModal, setShowRequestItemModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [newTasksCount, setNewTasksCount] = useState(0);
    const lastTaskCheckRef = useRef(new Date().toISOString());
    const [patients, setPatients] = useState([]);
    const [handoffs, setHandoffs] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientHistory, setPatientHistory] = useState([]);
    const [selectedHandoff, setSelectedHandoff] = useState(null);
    const [patientsWithVitals, setPatientsWithVitals] = useState([]);

    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({ connected: false });
    const [searchQuery, setSearchQuery] = useState('');
    const [user, setUser] = useState({});

    const [showCreatePatient, setShowCreatePatient] = useState(false);
    const [showCreateHandoff, setShowCreateHandoff] = useState(false);
    const [showViewHandoff, setShowViewHandoff] = useState(false);
    const [showPatientsVitals, setShowPatientsVitals] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showBookAppointment, setShowBookAppointment] = useState(false);
    const [showEditPatient, setShowEditPatient] = useState(false);
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
    const [handoffForm, setHandoffForm] = useState({ patient_id: '', shift: '', transcript: '' });

    const [chatQuestion, setChatQuestion] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    const showNotify = useCallback((msg, type = 'info') => setNotification({ message: msg, type }), []);

    // --- Vital Status Helpers ---
    const VITAL_RANGES = { heart_rate: { min: 60, max: 100 }, temperature: { min: 97, max: 99 }, oxygen_saturation: { min: 95, max: 100 }, respiratory_rate: { min: 12, max: 20 } };

    const isVitalAbnormal = (vitalType, value) => {
        if (!value) return false;
        let numVal = value;
        if (typeof value === 'string') numVal = parseFloat(value.replace(/[^\d.]/g, ''));
        if (vitalType === 'blood_pressure' && typeof value === 'string') {
            const parts = value.split('/');
            if (parts.length === 2) { const s = parseInt(parts[0]), d = parseInt(parts[1]); return s > 140 || s < 90 || d > 90 || d < 60; }
            return false;
        }
        const range = VITAL_RANGES[vitalType];
        if (!range || isNaN(numVal)) return false;
        return numVal < range.min || numVal > range.max;
    };

    const calculateAge = (dateOfBirth) => {
        if (!dateOfBirth) return null;
        try { const dob = new Date(dateOfBirth), today = new Date(); let age = today.getFullYear() - dob.getFullYear(); if (today.getMonth() - dob.getMonth() < 0 || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--; return age >= 0 ? age : null; } catch { return null; }
    };

    const renderVitalValue = (val) => {
        if (!val) return '--';
        if (typeof val === 'object') {
            if (!val.value && (val.systolic || val.diastolic)) return `${val.systolic || '?'}/${val.diastolic || '?'} ${val.unit || ''}`.trim();
            const v = val.value || val.val || '--', u = val.unit || '';
            return u ? `${v} ${u}` : v;
        }
        return val;
    };

    // --- Initialize & Polling ---
    useEffect(() => {
        const u = JSON.parse(sessionStorage.getItem('user'));
        if (u) setUser(u);
        fetch(`${API_BASE}/nurse/profile`, { headers: getAuthHeaders() })
            .then(r => r.json()).then(d => { if (d.success) { setUser(d.user); sessionStorage.setItem('user', JSON.stringify(d.user)); } }).catch(() => {});
        loadDashboardData(); loadTasks(); checkConnection(); connectSocket('nurse');
        const interval = setInterval(() => { checkConnection(); refreshData(); }, 5000);
        return () => clearInterval(interval);
    }, []);

    useRealtimeEvents({
        'task_assigned': (data) => { showNotify(` New task: ${data.message || data.description}`, 'info'); loadTasks(); loadDashboardData(); },
        'appointment_status': (data) => { showNotify(` Appointment ${data.status}: ${data.date || ''}`, 'info'); },
        'inventory_updated': (data) => { showNotify(`Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info'); setInventoryRefreshKey(k => k + 1); }
    }, null, null, 'nurse');

    const refreshData = () => { loadDashboardData(); loadTasks(); if (viewRef.current === 'patients') loadPatients(); if (viewRef.current === 'handoffs') loadHandoffs(); };
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

    const checkConnection = async () => { const status = await checkConnectionStatus(); setConnectionStatus(status); };

    const loadDashboardData = async () => { try { const res = await fetch(`${API_BASE}/nurse/stats`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success) setStats(data.stats); } catch (e) { handleAuthError(e, showNotify); } };
    const loadPatients = async () => { try { const res = await fetch(`${API_BASE}/nurse/patients`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success) setPatients(data.patients); } catch (e) { handleAuthError(e, showNotify); } };
    const loadHandoffs = async () => { try { const res = await fetch(`${API_BASE}/nurse/handoffs`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success) setHandoffs(data.handoffs); } catch (e) { handleAuthError(e, showNotify); } };
    const searchPatients = async () => { if (!searchQuery.trim()) { loadPatients(); return; } try { const res = await fetch(`${API_BASE}/nurse/patients/search?q=${encodeURIComponent(searchQuery)}`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success) setPatients(data.patients); } catch (e) { handleAuthError(e, showNotify); } };
    const loadPatientsWithVitals = async () => { try { const res = await fetch(`${API_BASE}/nurse/patients/with-vitals`, { headers: getAuthHeaders() }); if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); } const data = await res.json(); if (data.success) { // Filter out any null/non-object entries to prevent React child crash
            const safePatients = (Array.isArray(data.patients) ? data.patients : []).filter(p => p != null && typeof p === 'object'); setPatientsWithVitals(safePatients); setShowPatientsVitals(true); } else { showNotify(data.error || 'Failed to load vitals from server', 'error'); } } catch (e) { showNotify('Failed to load vitals: ' + e.message, 'error'); handleAuthError(e, showNotify); } };
    const loadTasks = async () => { try { const data = await taskService.getNurseTasks(); if (data.success) setTasks(data.tasks); } catch {} };
    const handleCompleteTask = async (taskId) => { try { const res = await taskService.updateTaskStatus(taskId, 'completed'); if (res.success) { showNotify('Task marked completed! ', 'success'); setTasks(prev => prev.filter(t => t.task_id !== taskId)); loadDashboardData(); } else showNotify(res.error || 'Failed', 'error'); } catch (e) { showNotify(`Failed: ${e.message}`, 'error'); } };
    const handleRejectTask = async () => { if (!rejectingTask) return; try { const res = await fetch(`${API_BASE}/nurse/tasks/${rejectingTask.task_id || rejectingTask._id}/reject`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ reason: rejectReason || 'No reason provided' }) }); const data = await res.json(); if (data.success) { showNotify(data.message || 'Task rejected', 'success'); setShowRejectModal(false); setRejectingTask(null); setRejectReason(''); loadTasks(); } else showNotify(data.error || 'Failed', 'error'); } catch { showNotify('Error rejecting task', 'error'); } };
    const handleStatusChange = async (newStatus) => { try { const res = await taskService.updateNurseStatus(newStatus); if (res.success) { setNurseStatus(newStatus); showNotify(`Status: ${newStatus.toUpperCase()}`, 'success'); if (res.reassigned_tasks > 0) { showNotify(`️ ${res.reassigned_tasks} tasks reassigned`, 'warning'); loadTasks(); } } else showNotify(res.error, 'error'); } catch { showNotify('Failed to update status', 'error'); } };
    const handleCreatePatient = async (e) => { e.preventDefault(); const f = new FormData(e.target); const data = Object.fromEntries(f.entries()); data.allergies = data.allergies ? data.allergies.split(',').map(a => a.trim()) : []; if (data.password !== data.confirm_password) { showNotify('Passwords do not match!', 'error'); return; } try { const res = await fetch(`${API_BASE}/nurse/patients`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) }); const result = await res.json(); if (result.success) { showNotify('Patient created!', 'success'); setShowCreatePatient(false); loadPatients(); loadDashboardData(); e.target.reset(); } else showNotify(result.error, 'error'); } catch { showNotify('Failed to create patient', 'error'); } };
    const handleDeletePatient = async (patientId) => { if (!window.confirm('Delete this patient?')) return; try { const res = await fetch(`${API_BASE}/nurse/patients/${patientId}`, { method: 'DELETE', headers: getAuthHeaders() }); const result = await res.json(); if (result.success) { showNotify('Patient deleted', 'success'); loadPatients(); loadDashboardData(); } else showNotify(result.error, 'error'); } catch { showNotify('Failed to delete', 'error'); } };
    const handleCreateHandoff = async (startData) => { showNotify('Creating handoff...', 'info'); try { const res = await fetch(`${API_BASE}/nurse/handoffs`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ patient_id: startData.patient_id, shift: startData.shift, transcript: startData.transcript }) }); const result = await res.json(); if (result.success) { showNotify('Handoff saved!', 'success'); setShowCreateHandoff(false); loadHandoffs(); loadDashboardData(); } else showNotify(result.error, 'error'); } catch { showNotify('Failed to save handoff', 'error'); } };
    const viewPatientDetails = async (patientId) => { setLoading(true); try { const [pRes, hRes] = await Promise.all([fetch(`${API_BASE}/nurse/patients/${patientId}`, { headers: getAuthHeaders() }), fetch(`${API_BASE}/nurse/handoffs?patient_id=${patientId}`, { headers: getAuthHeaders() })]); const pData = await pRes.json(), hData = await hRes.json(); if (pData.success && hData.success) { setSelectedPatient(pData.patient); setPatientHistory(hData.handoffs.reverse()); setView('details'); } else showNotify(pData.error || hData.error || 'Failed to load', 'error'); } catch { showNotify('Error loading details', 'error'); } setLoading(false); };
    const viewHandoff = async (handoffId) => { try { const res = await fetch(`${API_BASE}/nurse/handoffs/${handoffId}`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success) { setSelectedHandoff(data.handoff); setShowViewHandoff(true); } else showNotify(data.error || 'Failed to load', 'error'); } catch { showNotify('Error loading handoff', 'error'); } };
    const handleChatSubmit = async (e) => { e.preventDefault(); if (!chatQuestion.trim()) return; const q = chatQuestion; setChatMessages(prev => [...prev, { type: 'user', text: q }]); setChatQuestion(''); setChatLoading(true); try { const res = await fetch(`${API_BASE}/nurse/chatbot/all-patients`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question: q }) }); const data = await res.json(); setChatMessages(prev => [...prev, { type: 'bot', text: data.success ? data.answer : data.error }]); } catch { setChatMessages(prev => [...prev, { type: 'bot', text: 'Error getting response' }]); } setChatLoading(false); };

    const handleViewChange = (newView) => {
        setView(newView);
        if (newView === 'dashboard') loadDashboardData();
        else if (newView === 'patients') loadPatients();
        else if (newView === 'handoffs') loadHandoffs();
    };

    const sidebarGroups = [
        {
            label: 'Navigation',
            items: [
                { id: 'dashboard', icon: <DashboardOutlinedIcon fontSize="small" />, label: 'Dashboard' },
                { id: 'patients', icon: <PeopleOutlinedIcon fontSize="small" />, label: 'Patients' },
                { id: 'handoffs', icon: <AssignmentOutlinedIcon fontSize="small" />, label: 'Handoffs' },
                { id: 'inventory', icon: <Inventory2OutlinedIcon fontSize="small" />, label: 'Inventory' },
            ]
        },
        {
            label: 'Quick Actions',
            items: [
                { id: '_vitals', icon: <MonitorHeartOutlinedIcon fontSize="small" />, label: 'View Vitals' },
                { id: '_request', icon: <Inventory2OutlinedIcon fontSize="small" />, label: 'Request Supply' },
            ]
        }
    ];

    const handleSidebarSelect = (id) => {
        if (id === '_vitals') { loadPatientsWithVitals(); return; }
        if (id === '_request') { setShowRequestItemModal(true); return; }
        handleViewChange(id);
    };

    // --- Connection status indicator ---
    const connectionIndicator = (
        <Chip
            size="small"
            label={connectionStatus.connected ? 'ONLINE' : 'OFFLINE'}
            color={connectionStatus.connected ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.05em' }}
        />
    );

    // --- Vital style helper ---
    const getVitalStyle = (k) => {
        const l = k.toLowerCase();
        if (l.includes('heart') || l.includes('pulse') || l.includes('hr')) return { icon: <FavoriteBorderOutlinedIcon fontSize="small" />, color: 'error.main', bg: 'rgba(255,77,79,0.08)' };
        if (l.includes('pressure') || l.includes('bp')) return { icon: <WaterDropOutlinedIcon fontSize="small" />, color: 'secondary.main', bg: 'rgba(114,46,209,0.08)' };
        if (l.includes('temp')) return { icon: <DeviceThermostatOutlinedIcon fontSize="small" />, color: 'warning.main', bg: 'rgba(255,152,0,0.08)' };
        if (l.includes('oxygen') || l.includes('spo2')) return { icon: <AirOutlinedIcon fontSize="small" />, color: 'info.main', bg: 'rgba(3,169,244,0.08)' };
        if (l.includes('respiratory') || l.includes('resp')) return { icon: <AutoFixHighOutlinedIcon fontSize="small" />, color: 'primary.main', bg: 'rgba(24,144,255,0.08)' };
        return { icon: <MonitorHeartOutlinedIcon fontSize="small" />, color: 'text.secondary', bg: 'action.hover' };
    };

    return (
        <DashboardLayout
            title="Nurse Station"
            sidebarGroups={sidebarGroups}
            activeView={view}
            onViewChange={handleSidebarSelect}
            user={{ ...user, role: 'nurse' }}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
            headerActions={connectionIndicator}
        >
            {/* ─── Dashboard View (Chat + Stats) ─── */}
            {view === 'dashboard' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', position: 'relative' }}>
                    {/* Chat Area */}
                    <Box sx={{ flex: 1, overflowY: 'auto', pb: 14 }}>
                        {chatMessages.length === 0 ? (
                            <Stack spacing={4} alignItems="center" justifyContent="center" sx={{ minHeight: '60vh', textAlign: 'center' }}>
                                <Box>
                                    <Typography variant="h3" fontWeight={700} sx={{ background: 'linear-gradient(135deg, #1890ff, #722ed1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user.full_name?.split(' ')[0] || 'Nurse'}.
                                    </Typography>
                                    <Typography color="text.secondary" variant="h6">Here's your shift overview.</Typography>
                                </Box>

                                {/* Tasks Section */}
                                <Card sx={{ width: '100%', maxWidth: 900 }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AssignmentOutlinedIcon /> Upcoming Tasks ({tasks.length})</Typography>
                                            <Button size="small" startIcon={<RefreshIcon />} onClick={loadTasks}>Refresh</Button>
                                        </Box>
                                        <Grid container spacing={2} sx={{ maxHeight: 320, overflowY: 'auto' }}>
                                            {tasks.length === 0 ? (
                                                <Grid size={12}><Box sx={{ py: 6, textAlign: 'center' }}><CheckCircleOutlinedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} /><Typography color="text.secondary">All caught up!</Typography></Box></Grid>
                                            ) : tasks.map((task, i) => (
                                                <Grid size={{ xs: 12, md: 6 }} key={`${task.task_id || task._id}-${i}`}>
                                                    <TaskCard task={task} onComplete={handleCompleteTask} />
                                                </Grid>
                                            ))}
                                        </Grid>
                                    </CardContent>
                                </Card>

                                {/* Quick Stats */}
                                <Grid container spacing={2.5} sx={{ maxWidth: 900 }}>
                                    <Grid size={{ xs: 12, md: 4 }}><StatCard title="Total Patients" value={stats.total_patients || 0} icon={<PeopleOutlinedIcon sx={{ fontSize: 32 }} />} onClick={() => handleViewChange('patients')} /></Grid>
                                    <Grid size={{ xs: 12, md: 4 }}><StatCard title="Total Handoffs" value={stats.total_handoffs || 0} icon={<AssignmentOutlinedIcon sx={{ fontSize: 32 }} />} onClick={() => handleViewChange('handoffs')} /></Grid>
                                    <Grid size={{ xs: 12, md: 4 }}><StatCard title="Active Monitoring" value={stats.active_patients || 0} icon={<MonitorHeartOutlinedIcon sx={{ fontSize: 32 }} />} onClick={loadPatientsWithVitals} /></Grid>
                                </Grid>

                                {/* AI Suggestions */}
                                <Box sx={{ width: '100%', maxWidth: 900 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 0.5 }}><SmartToyOutlinedIcon fontSize="small" /> AI Suggestions</Typography>
                                    <Grid container spacing={1.5}>
                                        {[
                                            { icon: <WarningAmberOutlinedIcon fontSize="small" />, text: 'Abnormal vitals check' },
                                            { icon: <AssignmentOutlinedIcon fontSize="small" />, text: 'Summarize recent handoffs' },
                                            { icon: <MedicationOutlinedIcon fontSize="small" />, text: 'Medication review' },
                                            { icon: <PeopleOutlinedIcon fontSize="small" />, text: 'Patient census overview' }
                                        ].map((s, i) => (
                                            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                                                <Card variant="outlined" sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main', boxShadow: 2 }, transition: 'all 0.2s' }} onClick={() => setChatQuestion(s.text)}>
                                                    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
                                                        <Box sx={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center' }}>{s.icon}</Box>
                                                        <Typography variant="body2">{s.text}</Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>

                                {/* Quick Actions */}
                                <Stack direction="row" spacing={2}>
                                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowCreatePatient(true)}>Add Patient</Button>
                                    <Button variant="outlined" startIcon={<AssignmentOutlinedIcon />} onClick={() => { loadPatients(); setShowCreateHandoff(true); }}>Record Handoff</Button>
                                </Stack>
                            </Stack>
                        ) : (
                            <Box sx={{ maxWidth: 720, mx: 'auto', pb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', position: 'sticky', top: 0, zIndex: 10, pt: 1 }}>
                                    <IconButton size="small" onClick={() => setChatMessages([])} sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { color: 'error.main' } }}><CloseIcon fontSize="small" /></IconButton>
                                </Box>
                                <Stack spacing={2.5}>
                                    {chatMessages.map((msg, idx) => (
                                        <Box key={idx} sx={{ display: 'flex', flexDirection: msg.type === 'user' ? 'row-reverse' : 'row', gap: 1.5, alignItems: 'flex-start' }}>
                                            <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem', bgcolor: msg.type === 'bot' ? 'primary.main' : 'action.hover', color: msg.type === 'bot' ? '#fff' : 'text.secondary' }}>
                                                {msg.type === 'bot' ? <SmartToyOutlinedIcon fontSize="small" /> : (user.full_name || 'U')[0].toUpperCase()}
                                            </Box>
                                            <Card sx={{ maxWidth: '85%', bgcolor: msg.type === 'user' ? 'primary.main' : 'background.paper', color: msg.type === 'user' ? '#fff' : 'text.primary', borderRadius: msg.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}>
                                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.text}</Typography>
                                                </CardContent>
                                            </Card>
                                        </Box>
                                    ))}
                                    {chatLoading && (
                                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                            <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><SmartToyOutlinedIcon fontSize="small" /></Box>
                                            <Card><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><CircularProgress size={18} /></CardContent></Card>
                                        </Box>
                                    )}
                                    <div ref={chatEndRef} />
                                </Stack>
                            </Box>
                        )}
                    </Box>

                    {/* Chat Input */}
                    <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 720, px: 2, zIndex: 20 }}>
                        <Box component="form" onSubmit={handleChatSubmit} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'background.paper', borderRadius: 3, boxShadow: 6, border: 1, borderColor: 'divider' }}>
                            <TextField
                                fullWidth size="small" value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)}
                                placeholder="Ask about vitals, summarize handoffs, draft a note..."
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}
                            />
                            <IconButton type="submit" disabled={chatLoading || !chatQuestion.trim()} color="primary" sx={{ bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, '&:disabled': { opacity: 0.4 } }}>
                                <SendIcon fontSize="small" />
                            </IconButton>
                        </Box>
                        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
                            AI assistance can make mistakes. Verify clinical details.
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* ─── Patients View ─── */}
            {view === 'patients' && (
                <Stack spacing={3}>
                    <PageHeader title="Patients Directory" subtitle="Manage patient records and view history" actionLabel="Add Patient" onAction={() => setShowCreatePatient(true)} actionIcon={<AddIcon />} />
                    <TextField
                        fullWidth placeholder="Search by name, ID, or room number..." value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchPatients()}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                            endAdornment: searchQuery ? <InputAdornment position="end"><IconButton size="small" onClick={() => { setSearchQuery(''); loadPatients(); }}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : null
                        }}
                    />
                    <Grid container spacing={2.5}>
                        {patients.length === 0 ? (
                            <Grid item xs={12}><Box sx={{ textAlign: 'center', py: 10, border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}><PersonOutlineOutlinedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} /><Typography variant="h6" color="text.secondary">No patients found</Typography></Box></Grid>
                        ) : patients.map(p => (
                            <Grid item key={p.patient_id}>
                                <Card sx={{ width: 252.55, height: 222.81, display: 'flex', flexDirection: 'column', '&:hover': { boxShadow: 6, transform: 'translateY(-2px)' }, transition: 'all 0.2s' }}>
                                    <CardContent sx={{ display: 'flex', flexDirection: 'column', flex: 1, pb: '16px !important' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight={700} sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }} onClick={() => viewPatientDetails(p.patient_id)}>{p.patient_name}</Typography>
                                                <Chip label={p.patient_id} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', mt: 0.5 }} />
                                            </Box>
                                            {p.room_number ? <Chip label={`Rm ${p.room_number}`} color="primary" size="small" variant="outlined" /> : <Chip label="Unassigned" size="small" />}
                                        </Box>
                                        <Stack spacing={0.5}>
                                            <Typography variant="body2" color="text.secondary"><CalendarTodayOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} /> {formatDate(p.date_of_birth)}{calculateAge(p.date_of_birth) !== null && <Typography component="span" variant="body2" color="primary.main" fontWeight={700}> ({calculateAge(p.date_of_birth)} yrs)</Typography>}</Typography>
                                            <Typography variant="body2" color="text.secondary"><PersonOutlineOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} /> {p.gender}</Typography>
                                            <Typography variant="body2" color="text.secondary" noWrap><MedicationOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} /> {p.diagnosis || 'No Diagnosis'}</Typography>
                                        </Stack>
                                    </CardContent>
                                    <CardActions sx={{ mt: 'auto', borderTop: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
                                        <Button size="small" fullWidth onClick={() => viewPatientDetails(p.patient_id)}>View History</Button>
                                        <IconButton size="small" color="error" onClick={() => handleDeletePatient(p.patient_id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                                    </CardActions>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Stack>
            )}

            {/* ─── Handoffs View (Timeline) ─── */}
            {view === 'handoffs' && (
                <Stack spacing={3}>
                    <PageHeader title="Shift Handoffs" subtitle="Timeline of all recorded patient handoffs" actionLabel="Record Handoff" onAction={() => { loadPatients(); setShowCreateHandoff(true); }} actionIcon={<AssignmentOutlinedIcon />} />
                    {handoffs.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 10, border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}><InboxOutlinedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} /><Typography color="text.secondary">No handoff records found.</Typography></Box>
                    ) : (
                        <Stack spacing={2.5}>
                            {handoffs.map((h) => {
                                const matchedPatient = patients.find(p => p.patient_id === h.patient_id);
                                const getValidName = (...c) => c.find(x => x && x !== 'Not mentioned' && x !== 'Unknown' && x.trim() !== '') || h.patient_id;
                                const patientName = getValidName(h.patient_name, matchedPatient?.patient_name, h.structured_report?.patient_name);
                                const roomNumber = h.room_number || matchedPatient?.room_number || h.structured_report?.room_number;
                                return (
                                    <Card key={h.handoff_id} sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 }, transition: 'all 0.2s' }} onClick={() => viewHandoff(h.handoff_id)}>
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                <Box>
                                                    <Typography variant="h5" fontWeight={700} color="primary.main">{patientName}</Typography>
                                                    <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>ID: {h.patient_id}</Typography>
                                                        {roomNumber && <Typography variant="caption" fontWeight={700}>Rm {roomNumber}</Typography>}
                                                    </Stack>
                                                </Box>
                                                <Chip label={h.shift} size="small" variant="outlined" sx={{ textTransform: 'uppercase', fontWeight: 700 }} />
                                            </Box>
                                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{formatDate(h.timestamp)}</Typography>
                                                <Typography variant="caption" color="text.secondary">•</Typography>
                                                <Typography variant="caption" color="text.secondary">Nurse: {h.nurse_name}</Typography>
                                            </Stack>
                                            {/* Vitals Summary */}
                                            {h.structured_report?.vitals && (
                                                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1.5, mb: 2 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                                        <MonitorHeartOutlinedIcon fontSize="small" color="primary" />
                                                        <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>VITALS</Typography>
                                                    </Stack>
                                                    {typeof h.structured_report.vitals === 'string' ? (
                                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{h.structured_report.vitals}</Typography>
                                                    ) : (
                                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                            {h.structured_report.vitals.heart_rate && <Chip size="small" icon={<FavoriteBorderOutlinedIcon />} label={`${renderVitalValue(h.structured_report.vitals.heart_rate)}`} variant="outlined" />}
                                                            {h.structured_report.vitals.blood_pressure && <Chip size="small" icon={<WaterDropOutlinedIcon />} label={`${renderVitalValue(h.structured_report.vitals.blood_pressure)}`} variant="outlined" />}
                                                            {h.structured_report.vitals.temperature && <Chip size="small" icon={<DeviceThermostatOutlinedIcon />} label={`${renderVitalValue(h.structured_report.vitals.temperature)}`} variant="outlined" />}
                                                        </Stack>
                                                    )}
                                                </Box>
                                            )}
                                            {/* Observation */}
                                            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                                                    <AssignmentOutlinedIcon fontSize="small" color="primary" />
                                                    <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Handoff Report</Typography>
                                                </Stack>
                                                <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {(h.structured_report?.observation || h.structured_report?.Observation) || <em>{h.transcript || 'No additional notes recorded.'}</em>}
                                                </Typography>
                                            </Box>
                                            <Typography variant="body2" color="primary.main" fontWeight={700} sx={{ mt: 2 }}>View Full Report</Typography>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Stack>
                    )}
                </Stack>
            )}

            {/* ─── Patient Details View ─── */}
            {view === 'details' && selectedPatient && (
                <Stack spacing={3}>
                    <Button startIcon={<ArrowBackIcon />} onClick={() => setView('patients')} sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}>Back to Patients</Button>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                                <Box>
                                    <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>{selectedPatient.patient_name}</Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                        <Chip label={`ID: ${selectedPatient.patient_id}`} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                                        <Chip label={`Room: ${selectedPatient.room_number || 'N/A'}`} size="small" variant="outlined" />
                                        <Chip label={`Gender: ${selectedPatient.gender || '--'}`} size="small" variant="outlined" />
                                        <Chip label={`Adm: ${selectedPatient.admission_date || '--'}`} size="small" variant="outlined" />
                                    </Stack>
                                    <Chip label={selectedPatient.diagnosis || 'No diagnosis recorded'} color="error" variant="outlined" />
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <StatusChip status={selectedPatient.room_number ? 'active' : 'discharged'} />
                                    <Button variant="contained" size="small" startIcon={<CalendarTodayOutlinedIcon />} onClick={() => setShowBookAppointment(true)}>Book Appt</Button>
                                    <Button variant="outlined" size="small" startIcon={<EditOutlinedIcon />} onClick={() => setShowEditPatient(true)}>Edit</Button>
                                </Stack>
                            </Box>
                        </CardContent>
                    </Card>

                    <PatientEditModal isOpen={showEditPatient} onClose={() => setShowEditPatient(false)} patient={selectedPatient} onUpdate={() => viewPatientDetails(selectedPatient.patient_id)} />

                    {/* Latest Vitals */}
                    {patientHistory.length > 0 && patientHistory[patientHistory.length - 1].structured_report?.vitals && (
                        <Box>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><MonitorHeartOutlinedIcon /> Latest Vitals</Typography>
                            <Grid container spacing={2}>
                                {Object.entries(patientHistory[patientHistory.length - 1].structured_report.vitals).map(([key, value]) => {
                                    const style = getVitalStyle(key);
                                    return (
                                        <Grid key={key} size={{ xs: 6, sm: 4, md: 2.4 }}>
                                            <Card sx={{ bgcolor: style.bg, textAlign: 'center', '&:hover': { transform: 'scale(1.03)' }, transition: 'transform 0.2s' }}>
                                                <CardContent sx={{ py: 2 }}>
                                                    <Typography sx={{ fontSize: '1.5rem', opacity: 0.8, mb: 0.5 }}>{style.icon}</Typography>
                                                    <Typography variant="h5" fontWeight={700} sx={{ color: style.color }}>{renderVitalValue(value)}</Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{key.replace(/_/g, ' ')}</Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontSize: '0.6rem' }}><CalendarTodayOutlinedIcon sx={{ fontSize: 10, mr: 0.3, verticalAlign: 'middle' }} /> {formatDate(patientHistory[patientHistory.length - 1].timestamp)}</Typography>
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Box>
                    )}

                    {/* Handoff History */}
                    <Box>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><AssignmentOutlinedIcon /> Handoff History</Typography>
                        {patientHistory.length === 0 ? (
                            <Typography align="center" color="text.secondary" sx={{ py: 6 }}>No handoff history available.</Typography>
                        ) : (
                            <Stack spacing={2}>
                                {patientHistory.map(h => (
                                    <Card key={h.handoff_id} variant="outlined">
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                                <Chip label={`${h.shift} Shift`} size="small" variant="outlined" sx={{ textTransform: 'uppercase', fontWeight: 700 }} />
                                                <Typography variant="body2" color="primary.main" sx={{ fontFamily: 'monospace' }}>{formatDate(h.timestamp)}</Typography>
                                            </Box>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                                                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}><PersonOutlineOutlinedIcon sx={{ fontSize: 16 }} /></Box>
                                                <Typography variant="body2">{h.nurse_name}</Typography>
                                            </Stack>
                                            {h.structured_report?.vitals && (
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                                    <Chip size="small" icon={<FavoriteBorderOutlinedIcon />} label={`HR: ${renderVitalValue(h.structured_report.vitals.heart_rate)}`} variant="outlined" color="error" />
                                                    <Chip size="small" icon={<WaterDropOutlinedIcon />} label={`BP: ${renderVitalValue(h.structured_report.vitals.blood_pressure)}`} variant="outlined" color="secondary" />
                                                    <Chip size="small" icon={<DeviceThermostatOutlinedIcon />} label={`Temp: ${renderVitalValue(h.structured_report.vitals.temperature)}`} variant="outlined" color="warning" />
                                                </Stack>
                                            )}
                                            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{h.transcript}</Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Stack>
                        )}
                    </Box>
                </Stack>
            )}

            {/* ─── Inventory View ─── */}
            {view === 'inventory' && <InventoryPanel showNotify={showNotify} refreshTrigger={inventoryRefreshKey} />}

            {/* ═══ Modals ═══ */}

            {/* Create Patient */}
            <Dialog open={showCreatePatient} onClose={() => setShowCreatePatient(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Add New Patient</DialogTitle>
                <DialogContent>
                    <Box component="form" id="create-patient-form" onSubmit={handleCreatePatient} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                        <Grid container spacing={2}>
                            <Grid size={6}><TextField name="patient_id" label="Patient ID" required fullWidth placeholder="e.g. P-2024-001" /></Grid>
                            <Grid size={6}><TextField name="patient_name" label="Full Name" required fullWidth /></Grid>
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid size={6}><TextField name="email" label="Email" type="email" required fullWidth /></Grid>
                            <Grid size={6}><TextField name="phone" label="Phone" type="tel" fullWidth /></Grid>
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid size={6}><TextField name="date_of_birth" label="Date of Birth" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
                            <Grid size={6}>
                                <TextField name="gender" label="Gender" select required fullWidth defaultValue="Male">
                                    <MenuItem value="Male">Male</MenuItem><MenuItem value="Female">Female</MenuItem><MenuItem value="Other">Other</MenuItem>
                                </TextField>
                            </Grid>
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid size={6}><TextField name="admission_date" label="Admission Date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
                            <Grid size={6}><TextField name="room_number" label="Room Number" fullWidth placeholder="e.g. 101-A" /></Grid>
                        </Grid>
                        <TextField name="diagnosis" label="Primary Diagnosis" fullWidth />
                        <Grid container spacing={2}>
                            <Grid size={6}><TextField name="password" label="Password" type="password" required fullWidth autoComplete="new-password" inputProps={{ minLength: 6 }} /></Grid>
                            <Grid size={6}><TextField name="confirm_password" label="Confirm Password" type="password" required fullWidth autoComplete="new-password" inputProps={{ minLength: 6 }} /></Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowCreatePatient(false)}>Cancel</Button>
                    <Button type="submit" form="create-patient-form" variant="contained">Create Patient</Button>
                </DialogActions>
            </Dialog>

            {/* Handoff Form */}
            {showCreateHandoff && <HandoffFormModal isOpen={showCreateHandoff} onClose={() => setShowCreateHandoff(false)} onSubmit={handleCreateHandoff} patients={patients} user={user} />}

            {/* Vitals Modal — wrapped in Error Boundary so a crash here never blanks the dashboard */}
            {showPatientsVitals && (
                <VitalsErrorBoundary>
                    <PatientsVitalsModal isOpen={showPatientsVitals} onClose={() => setShowPatientsVitals(false)} patients={patientsWithVitals} />
                </VitalsErrorBoundary>
            )}

            {/* View Handoff */}
            {showViewHandoff && selectedHandoff && <ViewHandoffModal handoff={selectedHandoff} onClose={() => setShowViewHandoff(false)} />}

            {/* Task Rejection Modal */}
            <Dialog open={showRejectModal} onClose={() => setShowRejectModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}><WarningAmberOutlinedIcon color="warning" /> Reject Task</DialogTitle>
                <DialogContent>
                    {rejectingTask && (
                        <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="body2" color="text.secondary">Task:</Typography>
                            <Typography fontWeight={500}>{rejectingTask.description || rejectingTask.title}</Typography>
                            <Typography variant="caption" color="text.secondary">Patient: {rejectingTask.patient_name || rejectingTask.patient_id}</Typography>
                        </Box>
                    )}
                    <TextField fullWidth label="Reason for rejection" required multiline rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g., Patient not available, Equipment needed..." />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowRejectModal(false)}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={handleRejectTask}>Reject Task</Button>
                </DialogActions>
            </Dialog>

            {/* Notification */}
            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />

            {/* Profile */}
            <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} user={{...user, role: 'nurse'}} onUpdate={(u) => setUser(u)} />

            {/* Book Appointment */}
            {showBookAppointment && selectedPatient && (
                <Dialog open={showBookAppointment} onClose={() => setShowBookAppointment(false)} maxWidth="md" fullWidth>
                    <BookAppointment onClose={() => setShowBookAppointment(false)} onSuccess={() => { setShowBookAppointment(false); showNotify('Appointment booked!', 'success'); }} patientData={{ patient_id: selectedPatient.patient_id, patient_name: selectedPatient.patient_name }} userRole="nurse" />
                </Dialog>
            )}

            {/* Request Item */}
            {showRequestItemModal && <RequestItemModal onClose={() => setShowRequestItemModal(false)} onSuccess={() => { setShowRequestItemModal(false); showNotify('Item requested!', 'success'); }} />}
        </DashboardLayout>
    );
};

export default NurseDashboard;