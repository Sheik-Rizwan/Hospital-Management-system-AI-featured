import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE, getAuthHeaders, logout, checkConnectionStatus, formatDate, handleAuthError, connectSocket } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import Notification from '../components/Notification';
import ViewHandoffModal from '../components/ViewHandoffModal';
import PatientsVitalsModal from '../components/PatientsVitalsModal';
import TaskCard from '../components/TaskCard';
import { taskService } from '../services/taskService';
import HandoffFormModal from '../components/HandoffFormModal'; // Import new modal
import ProfileModal from '../components/ProfileModal';
import BookAppointment from '../components/BookAppointment';
import RequestItemModal from '../components/procurement/RequestItemModal';
import InventoryPanel from '../components/procurement/InventoryPanel';
import PatientEditModal from '../components/PatientEditModal';
import ThemeToggle from '../components/ThemeToggle';

const NurseDashboard = () => {
    // View management
    const [view, setView] = useState('dashboard'); // dashboard, patients, handoffs, details
    const viewRef = useRef('dashboard'); // Ref to track current view for interval

    // Sync ref with state
    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    // Data states
    const [stats, setStats] = useState({});
    const [tasks, setTasks] = useState([]); // New Tasks State
    const [nurseStatus, setNurseStatus] = useState('online'); // New Status State
    
    // Task filter and rejection state
    const [taskFilter, setTaskFilter] = useState('all'); // 'today', 'upcoming', 'rejected', 'all'
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
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [patientsWithVitals, setPatientsWithVitals] = useState([]);

    // UI states
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({ connected: false });
    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // User
    const [user, setUser] = useState({});

    // Modal states
    const [showCreatePatient, setShowCreatePatient] = useState(false);
    const [showCreateHandoff, setShowCreateHandoff] = useState(false);
    const [showViewHandoff, setShowViewHandoff] = useState(false);
    const [showRecording, setShowRecording] = useState(false);
    const [showPatientsVitals, setShowPatientsVitals] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showBookAppointment, setShowBookAppointment] = useState(false);
    const [showEditPatient, setShowEditPatient] = useState(false);

    // Inventory real-time refresh key
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

    // Form states
    const [handoffForm, setHandoffForm] = useState({ patient_id: '', shift: '', transcript: '' });

    // Chatbot states
    const [chatQuestion, setChatQuestion] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    const showNotify = useCallback((msg, type = 'info') => setNotification({ message: msg, type }), []);

    // --- Vital Status Helpers ---
    const VITAL_RANGES = {
        heart_rate: { min: 60, max: 100 },
        temperature: { min: 97, max: 99 },
        oxygen_saturation: { min: 95, max: 100 },
        respiratory_rate: { min: 12, max: 20 }
    };

    const isVitalAbnormal = (vitalType, value) => {
        if (!value) return false;
        let numVal = value;
        if (typeof value === 'string') {
            numVal = parseFloat(value.replace(/[^\d.]/g, ''));
        }
        if (vitalType === 'blood_pressure' && typeof value === 'string') {
            const parts = value.split('/');
            if (parts.length === 2) {
                const systolic = parseInt(parts[0]);
                const diastolic = parseInt(parts[1]);
                return systolic > 140 || systolic < 90 || diastolic > 90 || diastolic < 60;
            }
            return false;
        }
        const range = VITAL_RANGES[vitalType];
        if (!range || isNaN(numVal)) return false;
        return numVal < range.min || numVal > range.max;
    };

    const getVitalStatus = (vitals) => {
        if (!vitals) return 'unknown';
        const checks = [
            isVitalAbnormal('heart_rate', vitals.heart_rate),
            isVitalAbnormal('blood_pressure', vitals.blood_pressure),
            isVitalAbnormal('temperature', vitals.temperature),
            isVitalAbnormal('oxygen_saturation', vitals.oxygen_saturation)
        ];
        return checks.some(abnormal => abnormal) ? 'abnormal' : 'normal';
    };

    const calculateAge = (dateOfBirth) => {
        if (!dateOfBirth) return null;
        try {
            const dob = new Date(dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            return age >= 0 ? age : null;
        } catch (e) {
            return null;
        }
    };

    // --- Safe Render Helper for Vitals ---
    const renderVitalValue = (val) => {
        if (!val) return '--';
        if (typeof val === 'object') {
            // Handle BP split keys if prompt fails
            if (!val.value && (val.systolic || val.diastolic)) {
                return `${val.systolic || '?'}/${val.diastolic || '?'} ${val.unit || ''}`.trim();
            }
            
            // Handle { value: 120, unit: 'bpm', ... }
            const v = val.value || val.val || '--';
            const u = val.unit || '';
            return u ? `${v} ${u}` : v;
        }
        return val;
    };


    // Initialize & Polling
    useEffect(() => {
        const u = JSON.parse(sessionStorage.getItem('user'));
        if (u) setUser(u);
        
        // Fetch fresh profile to ensure name is correct
        fetch(`${API_BASE}/nurse/profile`, { headers: getAuthHeaders() })
            .then(res => res.json())
            .then(data => {
                if(data.success) {
                    setUser(data.user);
                    sessionStorage.setItem('user', JSON.stringify(data.user));
                }
            })
            .catch(console.error);

        loadDashboardData();
        loadTasks(); // Load Tasks
        checkConnection();
        connectSocket('nurse');
        
        const interval = setInterval(() => {
            checkConnection();
            refreshData(); // Live tracking
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Real-time events: nurse receives task assignments and appointment updates
    useRealtimeEvents({
        'task_assigned': (data) => { showNotify(`📋 New task: ${data.message || data.description}`, 'info'); loadTasks(); loadDashboardData(); },
        'appointment_status': (data) => { showNotify(`📅 Appointment ${data.status}: ${data.date || ''}`, 'info'); },
        'inventory_updated': (data) => { showNotify(`📦 Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info'); setInventoryRefreshKey(k => k + 1); }
    }, null, null, 'nurse');

    // Unified Refresh using Ref to get fresh state
    const refreshData = () => {
        const currentView = viewRef.current;
        loadDashboardData();
        loadTasks();
        
        // Specifically for the "patient column" issue:
        if (currentView === 'patients') loadPatients();
        if (currentView === 'handoffs') loadHandoffs();
    };
    // Auto scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // --- Connection Status ---
    const checkConnection = async () => {
        const status = await checkConnectionStatus();
        setConnectionStatus(status);
    };

    // --- Data Loading ---
    const loadDashboardData = async () => {
        try {
            const res = await fetch(`${API_BASE}/nurse/stats`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) setStats(data.stats);
        } catch (e) { handleAuthError(e, showNotify); }
    };

    const loadPatients = async () => {
        try {
            const res = await fetch(`${API_BASE}/nurse/patients`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) setPatients(data.patients);
        } catch (e) { handleAuthError(e, showNotify); }
    };

    const loadHandoffs = async () => {
        try {
            const res = await fetch(`${API_BASE}/nurse/handoffs`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) setHandoffs(data.handoffs);
        } catch (e) { handleAuthError(e, showNotify); }
    };

    const searchPatients = async () => {
        if (!searchQuery.trim()) {
            loadPatients();
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/nurse/patients/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) setPatients(data.patients);
        } catch (e) { handleAuthError(e, showNotify); }
    };

    const loadPatientsWithVitals = async () => {
        try {
            const res = await fetch(`${API_BASE}/nurse/patients/with-vitals`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setPatientsWithVitals(data.patients);
                setShowPatientsVitals(true);
            }
        } catch (e) { handleAuthError(e, showNotify); }
    };

    // --- Task Actions ---
    const loadTasks = async () => {
        try {
            const data = await taskService.getNurseTasks();
            if (data.success) setTasks(data.tasks);
        } catch (e) { }
    };

    const handleCompleteTask = async (taskId) => {
        try {
            const res = await taskService.updateTaskStatus(taskId, 'completed');
            if (res.success) {
                showNotify('Task marked completed! ✔', 'success');
                // Optimistic update
                setTasks(prev => prev.filter(t => t.task_id !== taskId));
                // Reload stats
                loadDashboardData();
            } else {
                showNotify(res.error || 'Failed to update task status', 'error');
            }
        } catch (e) { 
            showNotify(`Failed to update task: ${e.message}`, 'error'); 
        }
    };

    // Handle task rejection
    const handleRejectTask = async () => {
        if (!rejectingTask) return;
        try {
            const res = await fetch(`${API_BASE}/nurse/tasks/${rejectingTask.task_id || rejectingTask._id}/reject`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ reason: rejectReason || 'No reason provided' })
            });
            const data = await res.json();
            if (data.success) {
                showNotify(data.message || 'Task rejected', 'success');
                setShowRejectModal(false);
                setRejectingTask(null);
                setRejectReason('');
                loadTasks();
            } else {
                showNotify(data.error || 'Failed to reject task', 'error');
            }
        } catch {
            showNotify('Error rejecting task', 'error');
        }
    };

    // Load filtered tasks
    const loadFilteredTasks = async (filter) => {
        try {
            setTaskFilter(filter);
            const res = await fetch(`${API_BASE}/nurse/tasks/filter/${filter}`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setTasks(data.tasks || []);
            }
        } catch (e) {
        }
    };

    // Check for new tasks (notifications with polling)
    const checkNewTasks = async () => {
        try {
            const res = await fetch(`${API_BASE}/nurse/tasks/new-since/${lastTaskCheckRef.current}`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success && data.count > 0) {
                setNewTasksCount(prev => prev + data.count);
                showNotify(`${data.count} new task${data.count > 1 ? 's' : ''} assigned!`, 'info');
                loadTasks();
            }
            lastTaskCheckRef.current = new Date().toISOString();
        } catch (e) {
            // Silent fail
        }
    };
    const handleStatusChange = async (newStatus) => {
        try {
            const res = await taskService.updateNurseStatus(newStatus);
            if (res.success) {
                setNurseStatus(newStatus);
                showNotify(`Status updated to ${newStatus.toUpperCase()}`, 'success');
                if (res.reassigned_tasks > 0) {
                    showNotify(`⚠️ ${res.reassigned_tasks} tasks were automatically reassigned.`, 'warning');
                    loadTasks(); // Reload tasks to show empty list if reassigned
                }
            } else {
                showNotify(res.error, 'error');
            }
        } catch (e) { showNotify('Failed to update status', 'error'); }
    };

    // --- Actions ---
    const handleCreatePatient = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.allergies = data.allergies ? data.allergies.split(',').map(a => a.trim()) : [];
        
        if (data.password !== data.confirm_password) {
            showNotify('Passwords do not match!', 'error');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/nurse/patients`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showNotify('Patient created successfully!', 'success');
                setShowCreatePatient(false);
                loadPatients();
                loadDashboardData();
                e.target.reset();
            } else {
                showNotify(result.error, 'error');
            }
        } catch (err) { showNotify('Failed to create patient', 'error'); }
    };

    const handleDeletePatient = async (patientId) => {
        if (!window.confirm('Are you sure you want to delete this patient?')) return;

        try {
            const res = await fetch(`${API_BASE}/nurse/patients/${patientId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const result = await res.json();
            if (result.success) {
                showNotify('Patient deleted', 'success');
                loadPatients();
                loadDashboardData();
            } else {
                showNotify(result.error, 'error');
            }
        } catch (err) { showNotify('Failed to delete patient', 'error'); }
    };

    const handleCreateHandoff = async (startData) => {
        // startData is the object { patient_id, shift, transcript, ... } from the modal
        showNotify('Creating handoff report...', 'info');

        try {
            const res = await fetch(`${API_BASE}/nurse/handoffs`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    patient_id: startData.patient_id,
                    shift: startData.shift,
                    transcript: startData.transcript
                })
            });
            const result = await res.json();
            if (result.success) {
                showNotify('Handoff saved successfully!', 'success');
                setShowCreateHandoff(false);
                loadHandoffs();
                loadDashboardData();
            } else {
                showNotify(result.error, 'error');
            }
        } catch (err) { showNotify('Failed to save handoff', 'error'); }
    };

    const viewPatientDetails = async (patientId) => {
        setLoading(true);
        try {
            const [pRes, hRes] = await Promise.all([
                fetch(`${API_BASE}/nurse/patients/${patientId}`, { headers: getAuthHeaders() }),
                fetch(`${API_BASE}/nurse/handoffs?patient_id=${patientId}`, { headers: getAuthHeaders() })
            ]);
            const pData = await pRes.json();
            const hData = await hRes.json();

            if (pData.success && hData.success) {
                setSelectedPatient(pData.patient);
                setPatientHistory(hData.handoffs.reverse());
                setView('details');
            } else {
                showNotify(pData.error || hData.error || 'Failed to load patient details', 'error');
            }
        } catch (e) { showNotify('Error loading details', 'error'); }
        setLoading(false);
    };

    const viewHandoff = async (handoffId) => {
        try {
            const res = await fetch(`${API_BASE}/nurse/handoffs/${handoffId}`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setSelectedHandoff(data.handoff);
                setShowViewHandoff(true);
            } else {
                showNotify(data.error || 'Failed to load handoff details', 'error');
            }
        } catch (e) { showNotify('Error loading handoff', 'error'); }
    };

    // Main chatbot handler
    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatQuestion.trim()) return;

        const userQuestion = chatQuestion;
        setChatMessages(prev => [...prev, { type: 'user', text: userQuestion }]);
        setChatQuestion('');
        setChatLoading(true);

        try {
            const res = await fetch(`${API_BASE}/nurse/chatbot/all-patients`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: userQuestion })
            });
            const data = await res.json();
            setChatMessages(prev => [...prev, { type: 'bot', text: data.success ? data.answer : data.error }]);
        } catch (e) {
            setChatMessages(prev => [...prev, { type: 'bot', text: 'Error getting response' }]);
        }
        setChatLoading(false);
    };

    const handleRecordingComplete = (transcript) => {
        setHandoffForm(prev => ({ ...prev, transcript }));
        showNotify('Recording complete!', 'success');
    };


    // --- Sidebar Component ---
    const Sidebar = () => (
        <aside className={`fixed md:relative left-0 top-0 bottom-0 z-50 h-full transition-all duration-300 ease-in-out border-r border-border/50 bg-card/90 backdrop-blur-xl flex flex-col ${sidebarCollapsed ? 'w-0 md:w-20 -translate-x-full md:translate-x-0' : 'w-72 translate-x-0'}`}>
            <div className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    {!sidebarCollapsed && (
                        <h2 className="font-bold text-xl bg-gradient-to-r from-teal-400 to-purple-400 bg-clip-text text-transparent truncate animate-fade-in">
                            Welcome
                        </h2>
                    )}
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground hover:text-primary transition-colors">
                        {sidebarCollapsed ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                        )}
                    </button>
                </div>

            </div>

            <div className="flex-1 overflow-y-auto px-3 custom-scrollbar space-y-6">
                {/* Navigation */}
                <nav className="space-y-1">
                    {[
                        { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
                        { id: 'patients', icon: '👥', label: 'Patients' },
                        { id: 'handoffs', icon: '📋', label: 'Handoffs' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => { setView(item.id); if (item.id === 'dashboard') loadDashboardData(); else if (item.id === 'patients') loadPatients(); else loadHandoffs(); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                                view === item.id 
                                ? 'bg-primary-soft/80 text-teal-700 text-primary shadow-inner border border-teal-200 dark:border-border' 
                                : 'text-text-secondary text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground hover:text-primary'
                            }`}
                        >
                            <span className="text-xl">{item.icon}</span>
                            {!sidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                    <button
                        onClick={loadPatientsWithVitals}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-text-secondary text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground hover:text-primary"
                    >
                        <span className="text-xl">💓</span>
                        {!sidebarCollapsed && <span>View Vitals</span>}
                    </button>
                    <button
                        onClick={() => setShowRequestItemModal(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-text-secondary text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground hover:text-primary"
                    >
                        <span className="text-xl">📦</span>
                        {!sidebarCollapsed && <span>Request Supply</span>}
                    </button>
                    <button
                        onClick={() => setView('inventory')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                            view === 'inventory'
                            ? 'bg-primary-soft/80 text-teal-700 text-primary shadow-inner border border-teal-200 dark:border-border'
                            : 'text-text-secondary text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground hover:text-primary'
                        }`}
                    >
                        <span className="text-xl">📊</span>
                        {!sidebarCollapsed && <span>Inventory</span>}
                    </button>
                </nav>

                {/* Recent Handoffs */}
                {!sidebarCollapsed && (
                    <div className="px-2">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">Recent Handoffs</h3>
                        <div className="space-y-1">
                            {stats.recent_handoffs?.slice(0, 5).map(h => (
                                <button
                                    key={h.handoff_id}
                                    onClick={() => viewHandoff(h.handoff_id)}
                                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:bg-muted hover:text-primary hover:text-primary-hover transition-colors group"
                                >
                                    <span className="text-text-secondary group-hover:text-primary">📄</span>
                                    <div className="truncate">
                                        <span className="block truncate font-medium">{h.patient_name || h.patient_id}</span>
                                        <span className="text-xs text-text-secondary group-hover:text-muted-foreground">by {h.nurse_name}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* User Section */}
            <div className="p-4 border-t border-border bg-background">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-primary-foreground font-bold text-lg shadow-lg">
                        {(user.full_name || 'N')[0].toUpperCase()}
                    </div>
                    {!sidebarCollapsed && (
                        <div className="flex-1 overflow-hidden">
                            <p className="font-semibold text-foreground truncate">{user.full_name || 'Nurse'}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <select 
                                    value={nurseStatus} 
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className={`text-[10px] uppercase font-bold bg-transparent border-none outline-none cursor-pointer p-0 ${
                                        nurseStatus === 'online' ? 'text-success' : 
                                        nurseStatus === 'offline' ? 'text-muted-foreground' : 'text-error'
                                    }`}
                                >
                                    <option value="online" className="bg-card">● Online</option>
                                    <option value="offline" className="bg-card">○ Offline</option>
                                    <option value="emergency" className="bg-card">🚨 Emergency</option>
                                </select>
                            </div>
                        </div>
                    )}
                    <button onClick={() => setShowProfile(true)} className="p-2 text-muted-foreground hover:text-primary transition-colors" title="Profile">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </button>
                    <button onClick={logout} className="p-2 text-muted-foreground hover:text-error transition-colors" title="Logout">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    </button>
                </div>
            </div>
        </aside>
    );

    // --- Main Content: Dashboard View ---
    const renderDashboard = () => (
        <div className="flex flex-col h-full relative">
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar pb-32">
                {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in-up">
                        <div className="space-y-2">
                            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user.full_name?.split(' ')[0] || 'Nurse'}.
                            </h1>
                            <p className="text-muted-foreground text-lg">Here's your shift overview.</p>
                        </div>

                        {/* My Tasks Section */}
                        <div className="w-full max-w-4xl bg-surface backdrop-blur-md rounded-2xl border border-border p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-primary font-bold text-lg flex items-center gap-2">
                                    <span className="animate-pulse">⚡</span> Upcoming Tasks ({tasks.length})
                                </h3>
                <button onClick={loadTasks} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/></svg>
                                    Refresh
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto custom-scrollbar p-1">
                                {tasks.length === 0 ? (
                                    <div className="col-span-full py-8 flex flex-col items-center text-muted-foreground">
                                        <span className="text-4xl mb-2">🎉</span>
                                        <p>All caught up! No pending tasks.</p>
                                    </div>
                                ) : (
                                    tasks.map((task, index) => (
                                        <TaskCard key={`${task.task_id || task._id}-${index}`} task={task} onComplete={handleCompleteTask} />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                            <div onClick={() => { setView('patients'); loadPatients(); }} className="cursor-pointer group bg-gradient-to-br from-blue-500/10 to-blue-600/5 hover:from-blue-500/20 hover:to-blue-600/10 border border-primary/20 hover:border-blue-400/50 p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-3xl p-3 bg-primary-soft rounded-xl text-blue-400 group-hover:scale-110 transition-transform">👥</span>
                                    <span className="text-xs font-bold text-primary/60 uppercase tracking-widest">Census</span>
                                </div>
                                <span className="text-4xl font-bold text-foreground block mb-1">{stats.total_patients || 0}</span>
                                <span className="text-sm text-muted-foreground">Total Patients</span>
                            </div>
                            
                            <div onClick={() => { setView('handoffs'); loadHandoffs(); }} className="cursor-pointer group bg-gradient-to-br from-purple-500/10 to-purple-600/5 hover:from-purple-500/20 hover:to-purple-600/10 border border-secondary/20 hover:border-purple-400/50 p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-3xl p-3 bg-secondary-soft rounded-xl text-purple-400 group-hover:scale-110 transition-transform">📋</span>
                                    <span className="text-xs font-bold text-secondary/60 uppercase tracking-widest">Reports</span>
                                </div>
                                <span className="text-4xl font-bold text-foreground block mb-1">{stats.total_handoffs || 0}</span>
                                <span className="text-sm text-muted-foreground">Total Handoffs</span>
                            </div>

                            <div onClick={loadPatientsWithVitals} className="cursor-pointer group bg-gradient-to-br from-teal-500/10 to-teal-600/5 hover:from-teal-500/20 hover:to-teal-600/10 border border-accent/20 hover:border-teal-400/50 p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-3xl p-3 bg-accent-soft rounded-xl text-primary group-hover:scale-110 transition-transform">💓</span>
                                    <span className="text-xs font-bold text-accent/60 uppercase tracking-widest">Monitoring</span>
                                </div>
                                <span className="text-4xl font-bold text-foreground block mb-1">{stats.active_patients || 0}</span>
                                <span className="text-sm text-muted-foreground">Active Monitoring</span>
                            </div>
                        </div>

                        {/* Suggestions */}
                        <div className="w-full max-w-4xl">
                            <p className="text-sm text-muted-foreground text-left mb-3 ml-2 font-medium">✨ AI Suggestions</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {[
                                    { icon: '🩺', text: 'Abnormal vitals check', bg: 'hover:bg-red-500/10 hover:border-error/30' },
                                    { icon: '📝', text: 'Summarize recent handoffs', bg: 'hover:bg-purple-500/10 hover:border-purple-500/30' },
                                    { icon: '💊', text: 'Medication review', bg: 'hover:bg-blue-500/10 hover:border-blue-500/30' },
                                    { icon: '👥', text: 'Patient census overview', bg: 'hover:bg-teal-500/10 hover:border-teal-500/30' }
                                ].map((s, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => setChatQuestion(s.text)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border border-border bg-muted transition-all ${s.bg} text-left group`}
                                    >
                                        <span className="text-xl group-hover:scale-110 transition-transform">{s.icon}</span>
                                        <span className="text-sm text-text-secondary group-hover:text-foreground">{s.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setShowCreatePatient(true)} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-primary-foreground rounded-xl font-bold shadow-lg shadow-teal-900/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                                <span>➕</span> Add Patient
                            </button>
                            <button onClick={() => { loadPatients(); setShowCreateHandoff(true); }} className="px-6 py-3 bg-card hover:bg-muted text-foreground rounded-xl font-bold shadow-lg border border-border transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                                <span>🎤</span> Record Handoff
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full max-w-3xl mx-auto space-y-6 pb-24 relative">
                        {/* Close Chat Button */}
                        <div className="flex justify-end sticky top-0 z-10 pt-2 pointer-events-none">
                             <button 
                                onClick={() => setChatMessages([])}
                                className="pointer-events-auto p-2 rounded-full bg-card backdrop-blur border border-border text-muted-foreground hover:text-error hover:bg-error-soft hover:border-error/30 transition-all shadow-lg"
                                title="Close Chat"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex items-start gap-4 ${msg.type === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg text-lg flex-shrink-0 ${
                                    msg.type === 'bot' ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-primary-foreground' : 'bg-border text-text-secondary'
                                }`}>
                                    {msg.type === 'bot' ? '🤖' : (user.full_name || 'U')[0].toUpperCase()}
                                </div>
                                <div className={`p-5 rounded-2xl max-w-[85%] shadow-md leading-relaxed ${
                                    msg.type === 'bot' 
                                    ? 'bg-card border border-border text-foreground rounded-tl-none' 
                                    : 'bg-teal-600 text-primary-foreground rounded-tr-none'
                                }`}>
                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-primary-foreground shadow-lg">🤖</div>
                                <div className="bg-card border border-border p-4 rounded-2xl rounded-tl-none flex gap-2 items-center">
                                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce delay-75"></div>
                                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce delay-150"></div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                )}
            </div>

            {/* Chat Input Floating Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-20">
                <form onSubmit={handleChatSubmit} className="relative group">
                    <div className="absolute inset-0 bg-accent-soft rounded-2xl blur-lg transition opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"></div>
                    <div className="relative bg-popover backdrop-blur-xl border border-border rounded-2xl p-2 shadow-2xl flex items-center gap-2 transition-all group-focus-within:border-primary/50 group-focus-within:bg-surface">
                        <button type="button" className="p-3 text-muted-foreground hover:text-foreground hover:bg-border rounded-xl transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                        <input
                            type="text"
                            value={chatQuestion}
                            onChange={(e) => setChatQuestion(e.target.value)}
                            placeholder="Ask me to summarize handoffs, check vitals, or draft a note..."
                            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder-text-muted text-lg px-2"
                        />
                        <button 
                            type="submit" 
                            disabled={chatLoading || !chatQuestion.trim()}
                            className="p-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-primary text-primary-foreground rounded-xl shadow-lg shadow-teal-900/20 transition-all hover:scale-105 active:scale-95"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                        </button>
                    </div>
                    {/* Disclaimer */}
                    <p className="text-center text-xs text-muted-foreground mt-2 font-medium opacity-0 group-focus-within:opacity-100 transition-opacity">
                        AI assistance can make mistakes. Please verify important clinical details.
                    </p>
                </form>
            </div>
        </div>
    );

    // --- Patients List View ---
    const renderPatients = () => (
        <div className="h-full flex flex-col p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-foreground">Patients Directory</h2>
                    <p className="text-muted-foreground">Manage patient records and view history</p>
                </div>
                <button onClick={() => setShowCreatePatient(true)} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-primary-foreground rounded-xl font-bold shadow-lg shadow-teal-900/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                    <span>➕</span> Add Patient
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-8 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPatients()}
                    placeholder="Search by name, ID, or room number..."
                    className="w-full pl-12 pr-4 py-4 bg-muted border border-border rounded-2xl text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all shadow-sm"
                />
                {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); loadPatients(); }} className="absolute inset-y-0 right-4 text-muted-foreground hover:text-foreground transition-colors">
                        ✕
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                {patients.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-muted-foreground bg-surface rounded-3xl border border-dashed border-border">
                        <span className="text-5xl block mb-4">🔍</span>
                        <p className="text-xl font-medium">No patients found</p>
                        <p className="text-sm opacity-60">Try adjusting your search terms</p>
                    </div>
                ) : (
                    patients.map(p => (
                        <div key={p.patient_id} className="group bg-surface backdrop-blur-md border border-border hover:border-teal-500/30 rounded-2xl p-5 transition-all duration-300 hover:shadow-2xl hover:shadow-teal-900/20 hover:-translate-y-1 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-teal-500/10 to-transparent rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div>
                                    <h3 onClick={() => viewPatientDetails(p.patient_id)} className="text-xl font-bold text-foreground group-hover:text-primary transition-colors cursor-pointer truncate pr-2">
                                        {p.patient_name}
                                    </h3>
                                    <p className="text-xs font-mono text-muted-foreground bg-surface px-2 py-0.5 rounded-md inline-block mt-1 border border-border">{p.patient_id}</p>
                                </div>
                                {p.room_number ? (
                                    <span className="flex flex-col items-center bg-teal-500/10 text-teal-300 px-3 py-1 rounded-lg border border-accent/20 font-bold text-sm">
                                        <span className="text-[10px] uppercase opacity-60">Room</span>
                                        {p.room_number}
                                    </span>
                                ) : (
                                    <span className="bg-border text-muted-foreground px-2 py-1 rounded text-xs">Unassigned</span>
                                )}
                            </div>

                            <div className="space-y-2 mb-6 relative z-10">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="w-5 text-center">🎂</span>
                                    <span>{formatDate(p.date_of_birth)}{calculateAge(p.date_of_birth) !== null && <span className="ml-2 text-teal-300 font-bold">({calculateAge(p.date_of_birth)} yrs)</span>}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="w-5 text-center">⚧</span>
                                    <span>{p.gender}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="w-5 text-center">🏥</span>
                                    <span className="truncate">{p.diagnosis || 'No Diagnosis'}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 relative z-10 pt-4 border-t border-white/5">
                                <button onClick={() => viewPatientDetails(p.patient_id)} className="flex-1 py-2 bg-border hover:bg-primary hover:text-primary-foreground text-text-secondary rounded-lg text-sm font-medium transition-all">
                                    View History
                                </button>
                                <button onClick={() => handleDeletePatient(p.patient_id)} className="p-2 text-muted-foreground hover:bg-error-soft hover:text-error rounded-lg transition-colors" title="Delete Patient">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    // --- Handoffs List View (Timeline) ---
    const renderHandoffs = () => (
        <div className="h-full flex flex-col p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-foreground">Shift Handoffs</h2>
                    <p className="text-muted-foreground">Timeline of all recorded patient handoffs</p>
                </div>
                <div className="flex gap-3">
                     <button onClick={() => { loadPatients(); setShowCreateHandoff(true); }} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-primary-foreground rounded-xl font-bold shadow-lg shadow-teal-900/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                        <span>🎤</span> Record Handoff
                    </button>
                </div>
            </div>

            {/* Alternating Wide Timeline Container - Maximized Width */}
            <div className="relative pb-20 max-w-[99%] mx-auto">
                {/* Center Line */}
                <div className="absolute left-4 md:left-1/2 transform md:-translate-x-1/2 w-1 bg-border h-full top-0 rounded-full"></div>

                {handoffs.length === 0 ? (
                    <div className="relative z-10 text-center py-20">
                         <div className="inline-block p-8 bg-surface backdrop-blur-md rounded-2xl border border-dashed border-border text-muted-foreground">
                             <span className="text-4xl block mb-2">📝</span>
                             <p>No handoff records found.</p>
                         </div>
                    </div>
                ) : (
                    handoffs.map((h, index) => {
                        // Find match
                        const matchedPatient = patients.find(p => p.patient_id === h.patient_id);
                        // Helper to get best name
                        const getValidName = (...candidates) => {
                             return candidates.find(c => c && c !== 'Not mentioned' && c !== 'Unknown' && c.trim() !== '') || h.patient_id;
                        };
                        const patientName = getValidName(
                            h.patient_name,
                            matchedPatient?.patient_name,
                            h.structured_report?.patient_name
                        );
                        const roomNumber = h.room_number || matchedPatient?.room_number || h.structured_report?.room_number;
                        const isLeft = index % 2 === 0;

                        return (
                            <div key={h.handoff_id} className={`flex flex-col md:flex-row items-center justify-between mb-12 w-full relative ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                                
                                {/* Timeline Cube Marker (Center) - Green Dot */}
                                <div className="absolute left-2 md:left-1/2 top-8 w-4 h-4 rounded-full bg-primary shadow-glow z-20 md:-translate-x-1/2 border-4 border-border"></div>
                                
                                {/* Card Container - 49.5% width */}
                                <div className="w-full md:w-[49.5%] pl-12 md:pl-0">
                                    <div 
                                        onClick={() => viewHandoff(h.handoff_id)} 
                                        className="bg-card border border-border p-6 rounded-lg cursor-pointer transition-all hover:scale-[1.01] hover:shadow-xl relative flex flex-col min-h-[500px] overflow-hidden group"
                                    >
                                        {/* Connector Line */}
                                        <div className={`hidden md:block absolute top-[2.4rem] w-4 h-[2px] bg-primary opacity-50 ${isLeft ? '-right-4' : '-left-4'}`}></div>

                                        {/* Header Section */}
                                        <div className="flex flex-col gap-2 mb-6 shrink-0 relative z-10">
                                            <div className="flex justify-between items-start w-full">
                                                <div>
                                                    <h3 className="text-4xl font-bold text-primary tracking-tight leading-tight" title={patientName}>
                                                        {patientName}
                                                    </h3>
                                                    <div className="flex items-center gap-4 mt-2 text-muted-foreground font-mono text-sm">
                                                        <span>ID: {h.patient_id}</span>
                                                        {roomNumber && <span className="text-foreground font-bold">Rm {roomNumber}</span>}
                                                    </div>
                                                </div>
                                                {/* Shift Badge - Minimalist Button Style */}
                                                <div className="bg-muted border border-border px-4 py-2 rounded-lg shadow-sm">
                                                    <span className="text-primary font-bold text-sm tracking-wider uppercase">
                                                        {h.shift}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mt-2">
                                                <span>{formatDate(h.timestamp)}</span>
                                                <span className="text-muted-foreground">•</span>
                                                <span>Nurse: {h.nurse_name}</span>
                                            </div>
                                        </div>

                                        {/* Content Area */}
                                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2"> 
                                            {h.structured_report && (h.structured_report.observation || h.structured_report.vitals) ? (
                                                <div className="space-y-6 pb-4 pr-1">
                                                    
                                                    {/* Vitals Section - Distinct Dark Box */}
                                                    {h.structured_report.vitals && (
                                                        <div className="bg-muted p-5 rounded-xl border border-border/50">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <span className="text-error text-lg">💓</span> 
                                                                <span className="text-primary font-bold text-sm uppercase tracking-wider">VITALS</span>
                                                            </div>
                                                            
                                                            {typeof h.structured_report.vitals === 'string' ? (
                                                                <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{h.structured_report.vitals}</p>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-3">
                                                                    <div className="bg-card px-4 py-3 rounded-lg border border-border flex items-center gap-3 min-w-[140px]">
                                                                        <span className="text-error text-lg">❤️</span>
                                                                        <span className="text-foreground font-bold text-lg">{renderVitalValue(h.structured_report.vitals.heart_rate)}</span>
                                                                    </div>
                                                                    <div className="bg-card px-4 py-3 rounded-lg border border-border flex items-center gap-3 min-w-[140px]">
                                                                        <span className="text-error text-lg">🩸</span>
                                                                        <span className="text-foreground font-bold text-lg">{renderVitalValue(h.structured_report.vitals.blood_pressure)}</span>
                                                                    </div>
                                                                    <div className="bg-card px-4 py-3 rounded-lg border border-border flex items-center gap-3 min-w-[140px]">
                                                                        <span className="text-primary text-lg">🌡</span>
                                                                        <span className="text-foreground font-bold text-lg">{renderVitalValue(h.structured_report.vitals.temperature)}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}


                                                    {/* Handoff Report Summary Box (Always Show) */}
                                                    <div className="bg-muted p-4 rounded-lg border border-border mt-3 flex-1 flex flex-col justify-center min-h-[100px] shadow-sm">
                                                        <div className="flex items-center gap-2 mb-2 border-b border-border/50 pb-2">
                                                            <span className="text-lg">📋</span>
                                                            <span className="text-primary font-bold text-xs uppercase tracking-wider">Handoff Report</span>
                                                        </div>
                                                        <p className="text-sm text-foreground leading-relaxed font-light line-clamp-3 opacity-90">
                                                            {(h.structured_report && (h.structured_report.observation || h.structured_report.Observation)) ? (
                                                                <>
                                                                    {h.structured_report.observation || h.structured_report.Observation}
                                                                    {h.structured_report.recommendation && (
                                                                        <>
                                                                            <span className="mx-1 text-muted-foreground">•</span>
                                                                            <span className="font-medium text-primary">Rec: </span>
                                                                            {h.structured_report.recommendation}
                                                                        </>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                /* Fallback to transcript if no structured observation */
                                                                <span className="italic text-muted-foreground">{h.transcript || "No additional notes recorded."}</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Fallback for when no structured report object exists at all */
                                                <div className="bg-muted p-4 rounded-lg border border-border mt-3 flex-1 flex flex-col justify-center min-h-[100px] shadow-sm">
                                                    <div className="flex items-center gap-2 mb-2 border-b border-border/50 pb-2">
                                                        <span className="text-lg">📋</span>
                                                        <span className="text-primary font-bold text-xs uppercase tracking-wider">Handoff Report</span>
                                                    </div>
                                                    <p className="text-sm text-foreground leading-relaxed font-light line-clamp-3 opacity-90 italic text-muted-foreground">
                                                        {h.transcript || "No additional notes recorded."}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Footer Link */}
                                        <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-2 text-primary text-sm font-bold group-hover:underline shrink-0 cursor-pointer hover:text-primary-hover transition-colors">
                                            View Full Report <span>→</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Empty div for the other side to maintain spacing in flex */}
                                <div className="hidden md:block w-[49.5%]"></div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    // --- Patient Details View ---
    const renderDetails = () => (
        <div className="h-full flex flex-col p-4 md:p-8">
            <button onClick={() => setView('patients')} className="self-start flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 group transition-colors">
                <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Patients
            </button>
            
            {selectedPatient && (
                <div className="flex flex-col gap-6 pb-20">
                    <div className="bg-card/60 backdrop-blur-xl border border-border rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-32 bg-teal-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                        
                        <div className="flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
                            <div>
                                <h2 className="text-4xl font-bold text-foreground mb-2">{selectedPatient.patient_name}</h2>
                                <div className="flex flex-wrap gap-4 text-sm font-mono text-text-secondary mb-6">
                                    <span className="bg-surface px-3 py-1 rounded-lg border border-border">ID: {selectedPatient.patient_id}</span>
                                    <span className="bg-surface px-3 py-1 rounded-lg border border-border">Room: {selectedPatient.room_number || 'N/A'}</span>
                                    <span className="bg-surface px-3 py-1 rounded-lg border border-border">Gender: {selectedPatient.gender || '--'}</span>
                                    <span className="bg-surface px-3 py-1 rounded-lg border border-border">Adm: {selectedPatient.admission_date || '--'}</span>
                                </div>
                                <div className="inline-block px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                    <span className="text-error font-bold block text-xs uppercase tracking-wider mb-1">Diagnosis</span>
                                    <span className="text-error text-lg font-medium">{selectedPatient.diagnosis || 'No diagnosis recorded'}</span>
                                </div>
                            </div>
                            <span className={`px-4 py-2 rounded-xl font-bold uppercase tracking-wider border shadow-lg ${
                                selectedPatient.room_number 
                                ? 'bg-success-soft text-success border-green-500/30' 
                                : 'bg-border text-muted-foreground border-border'
                            }`}>
                                {selectedPatient.room_number ? '● Active' : '○ Discharged'}
                            </span>
                            <button 
                                onClick={() => setShowBookAppointment(true)}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-primary-foreground rounded-xl font-bold shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                            >
                                <span>📅</span> Book Appointment
                            </button>
                            <button 
                                onClick={() => setShowEditPatient(true)}
                                className="px-4 py-2 bg-surface hover:bg-muted text-foreground rounded-xl font-bold border border-border transition flex items-center gap-2"
                            >
                                ✏️ Edit
                            </button>
                        </div>
                    </div>
                    
                    <PatientEditModal 
                        isOpen={showEditPatient} 
                        onClose={() => setShowEditPatient(false)} 
                        patient={selectedPatient} 
                        onUpdate={() => {
                            viewPatientDetails(selectedPatient.patient_id); // Refresh details
                        }} 
                    />

                    {/* Latest Vitals Section */}
                    {patientHistory.length > 0 && patientHistory[patientHistory.length - 1].structured_report?.vitals ? (
                        <div className="space-y-4">
                             <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                                <span className="text-2xl">💓</span> Latest Vitals
                             </h3>
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {Object.entries(patientHistory[patientHistory.length - 1].structured_report.vitals).map(([key, value]) => {
                                    // Vitals Styling Helper
                                    const getVitalStyle = (k) => {
                                        const lowerK = k.toLowerCase();
                                        if (lowerK.includes('heart') || lowerK.includes('pulse') || lowerK.includes('hr')) return { icon: '❤️', color: 'text-error', bg: 'bg-red-500/10', border: 'border-red-500/20' };
                                        if (lowerK.includes('pressure') || lowerK.includes('bp')) return { icon: '🩸', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
                                        if (lowerK.includes('temp')) return { icon: '🌡️', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
                                        if (lowerK.includes('oxygen') || lowerK.includes('spo2')) return { icon: '🌬️', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' };
                                        if (lowerK.includes('respiratory') || lowerK.includes('resp')) return { icon: '🫁', color: 'text-primary', bg: 'bg-teal-500/10', border: 'border-teal-500/20' };
                                        return { icon: '📊', color: 'text-text-secondary', bg: 'bg-border/30', border: 'border-border/30' };
                                    };

                                    const style = getVitalStyle(key);

                                    return (
                                    <div key={key} className={`p-4 rounded-xl border ${style.border} ${style.bg} backdrop-blur-sm transition-all hover:scale-105 hover:shadow-lg`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-2xl opacity-80">{style.icon}</span>
                                            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${value && value !== 'Not mentioned' ? 'bg-green-500 text-green-500' : 'bg-muted text-text-secondary'}`}></div>
                                        </div>
                                        <div>
                                            <span className={`text-xl font-bold block ${style.color} drop-shadow-sm`}>{renderVitalValue(value)}</span>
                                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1 block truncate">{key.replace(/_/g, ' ')}</span>
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-white/5 text-[10px] text-muted-foreground flex items-center gap-1">
                                            <span>🕒</span>
                                            {formatDate(patientHistory[patientHistory.length - 1].timestamp)}
                                        </div>
                                    </div>
                                )})}
                             </div>
                        </div>
                    ) : null}

                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <span className="text-2xl">📋</span> Handoff History
                        </h3>
                        <div className="space-y-4">
                            {patientHistory.length === 0 ? (
                                <p className="text-center py-10 text-muted-foreground bg-card/30 rounded-2xl border border-dashed border-border">No handoff history available.</p>
                            ) : (
                                patientHistory.map(h => (
                                    <div key={h.handoff_id} className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 transition-all hover:border-teal-500/30">
                                        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                                            <span className="px-3 py-1 bg-border rounded-lg text-xs font-bold uppercase tracking-wider text-text-secondary border border-border">
                                                {h.shift} Shift
                                            </span>
                                            <span className="font-mono text-sm text-primary">{formatDate(h.timestamp)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-sm">👩‍⚕️</div>
                                            <p className="text-text-secondary font-medium">{h.nurse_name}</p>
                                        </div>
                                        {h.structured_report?.vitals && (
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                <span className="text-xs bg-red-900/20 text-red-300 px-2 py-1 rounded border border-red-900/30">❤️ HR: {renderVitalValue(h.structured_report.vitals.heart_rate)}</span>
                                                <span className="text-xs bg-purple-900/20 text-purple-300 px-2 py-1 rounded border border-purple-900/30">🩸 BP: {renderVitalValue(h.structured_report.vitals.blood_pressure)}</span>
                                                <span className="text-xs bg-orange-900/20 text-orange-300 px-2 py-1 rounded border border-orange-900/30">🌡 Temp: {renderVitalValue(h.structured_report.vitals.temperature)}</span>
                                            </div>
                                        )}
                                        <div className="bg-black/20 p-4 rounded-xl border border-border">
                                            <p className="text-text-secondary leading-relaxed text-sm whitespace-pre-wrap">{h.transcript}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // --- Main Render ---
    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="fixed inset-0 pointer-events-none" style={{ pointerEvents: 'none', zIndex: 0 }}>
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]"></div>
            </div>

            <Sidebar />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-10 overflow-hidden bg-surface backdrop-blur-sm">
                
                {/* Header (Mobile Toggle & Title) */}
                <header className="flex items-center justify-between p-4 border-b border-border bg-card backdrop-blur-md md:hidden mb-4">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-purple-400 bg-clip-text text-transparent">Welcome </h1>
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 text-muted-foreground">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                    </button>
                </header>

                {/* Connection Status Indicator */}
                <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
                    <ThemeToggle />
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-lg backdrop-blur-md border ${
                        connectionStatus.connected 
                            ? 'bg-accent-soft text-teal-300 border-teal-500/30' 
                            : 'bg-error-soft text-red-300 border-red-500/30 animate-pulse'
                    }`}>
                        <div className={`w-2 h-2 rounded-full ${connectionStatus.connected ? 'bg-teal-400' : 'bg-red-400'}`}></div>
                        {connectionStatus.connected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
                    {/* View Switching */}
                    {view === 'dashboard' && renderDashboard()}
                    {view === 'patients' && renderPatients()}
                    {view === 'handoffs' && renderHandoffs()}
                    {view === 'details' && renderDetails()}
                    {view === 'inventory' && <InventoryPanel showNotify={showNotify} refreshTrigger={inventoryRefreshKey} />}
                </div>

                {/* Modals */}
                {showCreatePatient && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                            {/* Modal Header */}
                            <div className="p-8 border-b border-border bg-gradient-to-r from-teal-900/20 to-slate-900/50 relative overflow-hidden shrink-0">
                                <div className="absolute top-0 right-0 p-16 bg-teal-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                                <div className="flex justify-between items-center relative z-10">
                                    <div>
                                        <h3 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent mb-1">Add New Patient</h3>
                                        <p className="text-muted-foreground text-sm">Enter patient details below to admit them to the system.</p>
                                    </div>
                                    <button 
                                        onClick={() => setShowCreatePatient(false)} 
                                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Modal Form */}
                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                <form onSubmit={handleCreatePatient} className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Patient ID <span className="text-error">*</span></label>
                                        <input 
                                            name="patient_id" 
                                            placeholder="e.g. P-2024-001" 
                                            required 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all font-mono text-sm" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Full Name <span className="text-error">*</span></label>
                                        <input 
                                            name="patient_name" 
                                            placeholder="Enter full name" 
                                            required 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Email <span className="text-error">*</span></label>
                                        <input 
                                            name="email" 
                                            type="email"
                                            required
                                            placeholder="patient@example.com" 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Phone <span className="text-muted-foreground text-xs">(Optional)</span></label>
                                        <input 
                                            name="phone" 
                                            type="tel"
                                            placeholder="+1 (555) 000-0000" 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Date of Birth <span className="text-error">*</span></label>
                                        <input 
                                            name="date_of_birth" 
                                            type="date" 
                                            required 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all [color-scheme:dark]" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Gender <span className="text-error">*</span></label>
                                        <div className="relative">
                                            <select 
                                                name="gender" 
                                                className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground outline-none transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-muted-foreground">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-primary ml-1">Admission Date <span className="text-error">*</span></label>
                                        <input 
                                            name="admission_date" 
                                            type="date" 
                                            required 
                                            className="w-full px-4 py-3 bg-muted border border-primary/50 rounded-xl focus:border-teal-400 focus:ring-1 focus:ring-teal-400 text-foreground placeholder-text-muted outline-none transition-all [color-scheme:dark]" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Room Number</label>
                                        <input 
                                            name="room_number" 
                                            placeholder="e.g. 101-A" 
                                            type="text" 
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-text-secondary ml-1">Primary Diagnosis</label>
                                    <input 
                                        name="diagnosis" 
                                        placeholder="Brief description of diagnosis..." 
                                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                    />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Password <span className="text-error">*</span></label>
                                        <input 
                                            name="password" 
                                            type="password" 
                                            placeholder="••••••••" 
                                            required 
                                            minLength="6"
                                            autoComplete="new-password"
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">Confirm Password <span className="text-error">*</span></label>
                                        <input 
                                            name="confirm_password" 
                                            type="password" 
                                            placeholder="••••••••" 
                                            required 
                                            minLength="6"
                                            autoComplete="new-password"
                                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder-text-muted outline-none transition-all" 
                                        />
                                    </div>
                                </div>
                                
                                <div className="pt-6 flex justify-end gap-3 border-t border-border mt-6 md:mt-8">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowCreatePatient(false)} 
                                        className="px-6 py-3 rounded-xl border border-border text-text-secondary font-medium hover:bg-card hover:text-foreground transition-all active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="px-8 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-primary-foreground font-bold shadow-lg shadow-teal-900/50 hover:shadow-teal-900/30 hover:from-teal-500 hover:to-emerald-500 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex items-center gap-2"
                                    >
                                        <span>Create Patient</span>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg>
                                    </button>
                                </div>
                            </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add other modals here with same dark theme classes if needed */}
                {showCreateHandoff && (
                    <HandoffFormModal 
                        isOpen={showCreateHandoff}
                        onClose={() => setShowCreateHandoff(false)}
                        onSubmit={handleCreateHandoff}
                        patients={patients}
                        user={user}
                    />
                )}

                {showPatientsVitals && (
                    <PatientsVitalsModal 
                        isOpen={showPatientsVitals} 
                        onClose={() => setShowPatientsVitals(false)} 
                        patients={patientsWithVitals} 
                    />
                )}

                {showViewHandoff && selectedHandoff && (
                    <ViewHandoffModal 
                        handoff={selectedHandoff} 
                        onClose={() => setShowViewHandoff(false)} 
                    />
                )}

                {/* Task Rejection Modal */}
                {showRejectModal && rejectingTask && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 m-4">
                            <div className="flex justify-between items-center mb-4 border-b border-border pb-4">
                                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                                    <span className="text-error">⚠️</span> Reject Task
                                </h3>
                                <button onClick={() => setShowRejectModal(false)} className="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                            </div>
                            
                            <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                                <p className="text-sm text-muted-foreground mb-1">Task:</p>
                                <p className="text-foreground font-medium">{rejectingTask.description || rejectingTask.title}</p>
                                <p className="text-xs text-muted-foreground mt-1">Patient: {rejectingTask.patient_name || rejectingTask.patient_id}</p>
                            </div>
                            
                            <div className="mb-4">
                                <label className="block text-sm text-muted-foreground mb-2">Reason for rejection *</label>
                                <textarea 
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="w-full bg-card text-foreground border border-border p-3 rounded-lg resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    rows={3}
                                    placeholder="e.g., Patient not available, Equipment needed..."
                                />
                            </div>
                            
                            <div className="flex gap-3 justify-end">
                                <button 
                                    onClick={() => setShowRejectModal(false)} 
                                    className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-border transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleRejectTask}
                                    className="px-4 py-2 bg-red-600 text-primary-foreground rounded-lg hover:bg-red-500 transition font-medium"
                                >
                                    Reject Task
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Global Notification */}
                {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

                {/* Profile Modal */}
                <ProfileModal 
                    isOpen={showProfile} 
                    onClose={() => setShowProfile(false)} 
                    user={{...user, role: 'nurse'}} 
                    onUpdate={(updatedUser) => setUser(updatedUser)}
                />

                {/* Book Appointment Modal */}
                {showBookAppointment && selectedPatient && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <BookAppointment
                            onClose={() => setShowBookAppointment(false)}
                            onSuccess={() => {
                                setShowBookAppointment(false);
                                showNotify('Appointment booked successfully!', 'success');
                            }}
                            patientData={{
                                patient_id: selectedPatient.patient_id,
                                patient_name: selectedPatient.patient_name
                            }}
                            userRole="nurse"
                        />
                    </div>
                )}

                {/* Request Item Modal */}
                {showRequestItemModal && (
                    <RequestItemModal 
                        onClose={() => setShowRequestItemModal(false)}
                        onSuccess={() => {
                            setShowRequestItemModal(false);
                            showNotify('Item requested successfully!', 'success');
                        }}
                    />
                )}
            </main>
        </div>
    );
};

export default NurseDashboard;