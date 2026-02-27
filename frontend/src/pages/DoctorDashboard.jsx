import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE, getAuthHeaders, formatDate, connectSocket, getRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ViewHandoffModal from '../components/ViewHandoffModal';
import ProfileModal from '../components/ProfileModal';
import DoctorScheduleManager from '../components/DoctorScheduleManager';
import PatientEditModal from '../components/PatientEditModal';
import ChatInterface from '../components/ChatInterface';
import VendorRequests from './VendorRequests';
import InventoryPanel from '../components/procurement/InventoryPanel';
import ThemeToggle from '../components/ThemeToggle';
import '../App.css';

const DoctorDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('dashboard'); // dashboard, nurses, handoffs, patients, care-plans, tasks, patient-details, nurse-assignments, medication-history, all-nurses, nurse-details
    const [stats, setStats] = useState({ patients: 0, plans: 0, tasks: 0, handoffs: 0 });

    // Data States
    const [patients, setPatients] = useState([]);
    const [carePlans, setCarePlans] = useState([]);
    const [nurses, setNurses] = useState([]);
    const [handoffs, setHandoffs] = useState([]);
    const [tasks, setTasks] = useState([]);

    // Selection
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [selectedHandoff, setSelectedHandoff] = useState(null);
    const [activeCarePlan, setActiveCarePlan] = useState(null);

    // New States for Enhanced Views
    const [nurseAssignments, setNurseAssignments] = useState([]);
    const [selectedNurseDetails, setSelectedNurseDetails] = useState(null);
    const [nurseTaskTab, setNurseTaskTab] = useState('completed');
    const [medicationHistory, setMedicationHistory] = useState([]);
    const [selectedMedicationPatient, setSelectedMedicationPatient] = useState(null);
    const [showEditPatient, setShowEditPatient] = useState(false);
    const [editingPatient, setEditingPatient] = useState(null);


    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);

    // Scheduled Medication State
    const [showScheduledMed, setShowScheduledMed] = useState(false);
    const [scheduledMedForm, setScheduledMedForm] = useState({
        patient_id: '',
        medication_name: '',
        shifts: [],
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: ''
    });
    const [unassignedTasks, setUnassignedTasks] = useState([]);

    // Modals
    const [showCreatePlan, setShowCreatePlan] = useState(false);
    const [showAddNurse, setShowAddNurse] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showScheduleManager, setShowScheduleManager] = useState(false);

    // Appointment States
    const [appointments, setAppointments] = useState([]);
    const [pendingAppointments, setPendingAppointments] = useState(0);
    // Appointment filter tab: 'pending' | 'confirmed' | 'history'
    const [apptTab, setApptTab] = useState('pending');
    // Vendor request badge count
    const [vendorPendingCount, setVendorPendingCount] = useState(0);

    // Forms
    const [planForm, setPlanForm] = useState({
        patient_id: '',
        medications: [{ name: '', dose: '', time: '', frequency: '' }],
        // Added time fields for meals
        meals: {
            morning: '', morning_time: '08:00',
            afternoon: '', afternoon_time: '13:00',
            night: '', night_time: '19:00'
        },
        bathing: { time: '', instructions: '' },
        vitals: [{ name: '', times: [] }],
        injections: [{ name: '', dose: '', time: '' }],
        procedures: [{ name: '', scheduled_time: '', notes: '' }],
        special_instructions: ''
    });

    const [nurseForm, setNurseForm] = useState({
        full_name: '', email: '', password: '', employee_id: '', department: ''
    });

    // Chatbot State
    const [chatQuestion, setChatQuestion] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    // Inventory real-time refresh key
    const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

    // Initial Load — runs once on mount, no interval
    useEffect(() => {
        const { user: u } = getRoleAuth('doctor');
        if (u) setUser(u);
        connectSocket('doctor');
        loadData();
    }, []);

    // Real-time socket events — mutate state directly, no re-fetching
    useRealtimeEvents({
        // Task events: re-fetch tasks/general area AND nurse assignments
        'task_completed': (data) => { showNotify(`✅ Task completed: ${data.description || 'A task'}`, 'success'); loadGeneralData(); loadNurseAssignments(); },
        'task_rejected': (data) => { showNotify(`❌ Task rejected by ${data.nurse_name}: ${data.reason}`, 'error'); loadGeneralData(); loadNurseAssignments(); },
        // Nurse status changed (online/offline/emergency)
        'nurse_status_changed': (data) => {
            const emoji = data.status === 'emergency' ? '🚨' : data.status === 'offline' ? '🔴' : '🟢';
            showNotify(`${emoji} Nurse ${data.nurse_name || ''} is now ${data.status}${data.reassigned_tasks ? ` (${data.reassigned_tasks} tasks reassigned)` : ''}`, data.status === 'emergency' ? 'error' : 'info');
            loadNurseAssignments();
            loadGeneralData();
        },
        // New appointment booked (WhatsApp / patient portal / nurse)
        // Re-fetch so the full card with all fields appears correctly
        'new_appointment': (data) => {
            showNotify(`📅 New appointment: ${data.patient_name || 'Patient'}${data.date ? ' on ' + data.date : ''}`, 'info');
            loadAppointments();
        },
        // Status changed externally (e.g. patient cancels via WhatsApp)
        'appointment_status': (data) => {
            if (data.appointment_id && data.status) {
                setAppointments(prev => {
                    const updated = prev.map(a =>
                        a.appointment_id === data.appointment_id ? { ...a, status: data.status } : a
                    );
                    const pending = updated.filter(a =>
                        a.status === 'pending' || a.status === 'pending_doctor_approval'
                    ).length;
                    setPendingAppointments(pending);
                    return updated;
                });
            }
        },
        // Inventory updated (consume / add / restock)
        'inventory_updated': (data) => {
            showNotify(`📦 Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info');
            setInventoryRefreshKey(k => k + 1);
        }
    }, null, null, 'doctor');

    const fetchCarePlan = async (patientId) => {
        try {
            const res = await fetch(`${API_BASE}/doctor/care-plans/${patientId}`, {
                headers: getAuthHeaders('doctor'),
                cache: 'no-store'
            });
            const data = await res.json();
            if (data.success) {
                setActiveCarePlan(data.plan);
            } else {
                setActiveCarePlan(null);
                // Optional: showNotify('No active care plan found', 'info');
            }
        } catch (e) {
            setActiveCarePlan(null);
        }
    };

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    // Load appointments from API — called only on initial mount and manual Refresh.
    // On any error the existing list stays visible.
    const loadAppointments = async () => {
        try {
            const res = await fetch(`${API_BASE}/doctor/appointments`, {
                headers: getAuthHeaders('doctor'),
                cache: 'no-store'
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) {
                const apts = data.appointments || [];
                setAppointments(apts);
                setPendingAppointments(
                    typeof data.pending_count === 'number'
                        ? data.pending_count
                        : apts.filter(a => a.status === 'pending' || a.status === 'pending_doctor_approval').length
                );
            }
        } catch {
            // Keep whatever is currently shown — do not clear on network error
        }
    };

    // Load general data (patients / handoffs / nurses / tasks) — used by auto-refresh.
    // Does NOT touch appointments so the appointments list stays stable.
    const loadGeneralData = async () => {
        try {
            const headers = getAuthHeaders('doctor');
            const options = { headers, cache: 'no-store' };
            const [pRes, hRes, nRes, tRes] = await Promise.all([
                fetch(`${API_BASE}/doctor/patients/vitals`, options),
                fetch(`${API_BASE}/doctor/handoffs`, options),
                fetch(`${API_BASE}/doctor/nurses`, options),
                fetch(`${API_BASE}/doctor/tasks`, options)
            ]);
            const pData = await pRes.json();
            const hData = await hRes.json();
            const nData = await nRes.json();
            const tData = await tRes.json();
            setPatients(pData.patients || []);
            setHandoffs(hData.handoffs || []);
            setNurses(nData.nurses || []);
            setTasks(tData.tasks || []);
            setStats({
                patients: pData.patients?.length || 0,
                plans: 0,
                tasks: (tData.tasks || []).filter(t => t.status === 'pending').length,
                handoffs: hData.handoffs?.length || 0
            });
        } catch (error) {
        }
    };

    // Full initial load: general data + appointments together
    const loadData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        await Promise.all([loadGeneralData(), loadAppointments()]);
        if (showLoading) setLoading(false);
    };

    // Load unassigned tasks (for warning panel)
    const loadUnassignedTasks = async () => {
        try {
            const res = await fetch(`${API_BASE}/doctor/unassigned-tasks`, {
                headers: getAuthHeaders('doctor')
            });
            const data = await res.json();
            if (data.success) {
                setUnassignedTasks(data.tasks || []);
            }
        } catch (e) {
        }
    };

    const loadVendorRequestCount = async () => {
        try {
            const res = await fetch(`${API_BASE}/chat/requests?direction=received&status=pending`, {
                headers: getAuthHeaders('doctor')
            });
            const data = await res.json();
            if (data.success) setVendorPendingCount(data.count || 0);
        } catch (e) { /* silent */ }
    };

    // Submit scheduled medication
    const submitScheduledMedication = async (e) => {
        e.preventDefault();
        if (!scheduledMedForm.patient_id || !scheduledMedForm.medication_name || scheduledMedForm.shifts.length === 0) {
            showNotify('Please fill all required fields', 'error');
            return;
        }
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/doctor/scheduled-medication`, {
                method: 'POST',
                headers: getAuthHeaders('doctor'),
                body: JSON.stringify(scheduledMedForm)
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`${data.tasks_generated} medication tasks created!`, 'success');
                setShowScheduledMed(false);
                setScheduledMedForm({
                    patient_id: '',
                    medication_name: '',
                    shifts: [],
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    notes: ''
                });
                loadGeneralData();
                loadUnassignedTasks();
                if (data.tasks_unassigned > 0) {
                    showNotify(`Warning: ${data.tasks_unassigned} tasks could not be assigned.`, 'warning');
                }
            } else {
                showNotify(data.error || 'Failed to create medication tasks', 'error');
            }
        } catch (e) {
            showNotify('Error creating medication tasks', 'error');
        } finally {
            setLoading(false);
        }
    };

    const submitCarePlan = async (e) => {
        e.preventDefault();
        try {
            // Filter out empty entries
            const cleanForm = {
                ...planForm,
                doctor_id: user?.user_id,
                medications: planForm.medications.filter(m => m.name.trim() !== ''),
                injections: planForm.injections.filter(i => i.name.trim() !== ''),
                procedures: planForm.procedures.filter(p => p.name.trim() !== ''),
                vitals: planForm.vitals.filter(v => v.name.trim() !== '')
            };


            const res = await fetch(`${API_BASE}/doctor/care-plans`, {
                method: 'POST',
                headers: getAuthHeaders('doctor'),
                body: JSON.stringify(cleanForm)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Care Plan Created', 'success');
                setShowCreatePlan(false);
                loadGeneralData();
            } else showNotify(data.error || 'Failed to create plan', 'error');
        } catch (e) { showNotify('Network Error', 'error'); }
    };

    const handleAddNurse = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/doctor/nurses`, {
                method: 'POST',
                headers: getAuthHeaders('doctor'),
                body: JSON.stringify(nurseForm)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Nurse Added', 'success');
                setShowAddNurse(false);
                loadGeneralData();
            } else showNotify(data.error || 'Failed to add nurse', 'error');
        } catch (e) { showNotify('Network Error', 'error'); }
    };

    const handleDeleteNurse = async (id) => {
        if (!window.confirm('Remove this nurse?')) return;
        try {
            const res = await fetch(`${API_BASE}/doctor/nurses/${id}`, {
                method: 'DELETE', headers: getAuthHeaders('doctor')
            });
            if (res.ok) {
                showNotify('Nurse Removed', 'success');
                setNurses(prev => prev.filter(n => n.user_id !== id));
            } else showNotify('Failed', 'error');
        } catch (e) { showNotify('Network Error', 'error'); }
    };

    // === NEW API FUNCTIONS FOR ENHANCED VIEWS ===
    
    const loadNurseAssignments = async () => {
        try {
            const res = await fetch(`${API_BASE}/doctor/nurse-assignments`, {
                headers: getAuthHeaders('doctor'),
                cache: 'no-store'
            });
            const data = await res.json();
            if (data.success) {
                setNurseAssignments(data.assignments || []);
            } else {
                showNotify(data.error || 'Failed to load nurse assignments', 'error');
            }
        } catch (e) {
            showNotify('Failed to load nurse assignments', 'error');
        }
    };

    const loadMedicationHistory = async (patientId) => {
        try {
            const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/medication-history`, {
                headers: getAuthHeaders('doctor'),
                cache: 'no-store'
            });
            const data = await res.json();
            if (data.success) {
                setMedicationHistory(data.medications || []);
                setSelectedMedicationPatient(patientId);
            } else {
                showNotify(data.error || 'Failed to load medication history', 'error');
            }
        } catch (e) {
            showNotify('Failed to load medication history', 'error');
        }
    };

    const loadNurseDetails = async (nurseId) => {
        try {
            const res = await fetch(`${API_BASE}/doctor/nurse-details/${nurseId}`, {
                headers: getAuthHeaders('doctor'),
                cache: 'no-store'
            });
            const data = await res.json();
            if (data.success) {
                setSelectedNurseDetails(data.nurse);
                setView('nurse-details');
            } else {
                showNotify(data.error || 'Failed to load nurse details', 'error');
            }
        } catch (e) {
            showNotify('Failed to load nurse details', 'error');
        }
    };

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatQuestion.trim()) return;
        const q = chatQuestion;
        setChatMessages(p => [...p, { type: 'user', text: q }]);
        setChatQuestion('');
        setChatLoading(true);
        try {
            const res = await fetch(`${API_BASE}/nurse/chatbot/all-patients`, {
                method: 'POST',
                headers: getAuthHeaders('doctor'),
                body: JSON.stringify({ question: q })
            });
            const data = await res.json();
            setChatMessages(p => [...p, { type: 'bot', text: data.success ? data.answer : 'Error' }]);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (e) {
            setChatMessages(p => [...p, { type: 'bot', text: 'Error' }]);
        }
        setChatLoading(false);
    };

    const handleAppointmentAction = async (appointmentId, action, rejectionReason = '') => {
        const statusMap = { approve: 'approved', reject: 'rejected', complete: 'completed' };
        const newStatus = statusMap[action] || action;

        // --- Optimistic update: change status in local state immediately ---
        // This means the UI never blanks — the card just moves tabs instantly.
        const prevAppointments = appointments;
        const prevPending = pendingAppointments;

        setAppointments(prev =>
            prev.map(a => a.appointment_id === appointmentId ? { ...a, status: newStatus } : a)
        );
        // Recalculate pending badge count straight away
        setAppointments(prev => {
            const pending = prev.filter(a =>
                a.status === 'pending' || a.status === 'pending_doctor_approval'
            ).length;
            setPendingAppointments(pending);
            return prev;
        });

        // --- API call in background ---
        try {
            const res = await fetch(`${API_BASE}/doctor/appointments/${appointmentId}`, {
                method: 'PATCH',
                headers: getAuthHeaders('doctor'),
                body: JSON.stringify({ status: newStatus, rejection_reason: rejectionReason })
            });
            const data = await res.json();
            if (data.success) {
                showNotify(
                    newStatus === 'approved' ? '✅ Appointment approved'
                    : newStatus === 'rejected' ? '❌ Appointment rejected'
                    : '✔️ Appointment marked complete',
                    'success'
                );
            } else {
                // Revert optimistic change if API failed
                setAppointments(prevAppointments);
                setPendingAppointments(prevPending);
                showNotify(data.error || 'Failed to update appointment', 'error');
            }
        } catch {
            // Revert on network error
            setAppointments(prevAppointments);
            setPendingAppointments(prevPending);
            showNotify('Network error — please try again', 'error');
        }
    };

    const getAppointmentStatusBadge = (status) => {
        const badges = {
            pending: 'bg-warning-soft text-warning border-warning/30',
            pending_doctor_approval: 'bg-warning-soft text-warning border-warning/30',
            approved: 'bg-success-soft text-success border-success/30',
            confirmed: 'bg-success-soft text-success border-success/30',
            rejected: 'bg-error-soft text-error border-error/30',
            completed: 'bg-primary-soft text-primary border-primary/30',
            cancelled: 'bg-muted text-muted-foreground border-border'
        };
        return badges[status] || badges.pending;
    };

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/';
    };

    // Helper to safely render vital values (handles objects)
    const renderVitalValue = (val) => {
        if (!val) return '--';
        if (typeof val === 'object') {
            // Handle BP split keys
            if (!val.value && (val.systolic || val.diastolic)) {
                return `${val.systolic || '?'}/${val.diastolic || '?'} ${val.unit || ''}`.trim();
            }
            const v = val.value || val.val || '--';
            const u = val.unit || '';
            return u ? `${v} ${u}` : v;
        }
        return val;
    };

    // Helper to check for abnormal vitals
    const getVitalColor = (type, value) => {
        if (!value || value === '--') return 'text-foreground';
        
        let valToCheck = value;
        if (typeof value === 'object') {
             if (type === 'blood_pressure' && !value.value && value.systolic) {
                 valToCheck = `${value.systolic}/${value.diastolic}`;
             } else {
                 valToCheck = value.value || value.val || '--';
             }
        }

        const num = parseFloat(valToCheck);
        
        switch (type) {
            case 'heart_rate':
                return (num < 60 || num > 100) ? 'text-error font-bold' : 'text-foreground';
            case 'blood_pressure':
                if (typeof valToCheck === 'string' && valToCheck.includes('/')) {
                    const [sys, dia] = valToCheck.split('/').map(v => parseFloat(v));
                    if (sys < 90 || sys > 140 || dia < 60 || dia > 90) return 'text-error font-bold';
                }
                return 'text-foreground';
            case 'temperature':
                return (num < 36.0 || num > 37.8) ? 'text-error font-bold' : 'text-foreground';
            case 'spo2':
                return (num < 95) ? 'text-error font-bold' : 'text-foreground';
            case 'respiratory_rate':
                return (num < 12 || num > 20) ? 'text-error font-bold' : 'text-foreground';
            default:
                return 'text-foreground';
        }
    };

    // Check if a vital value is abnormal (returns bool)
    const isVitalAbnormal = (type, value) => getVitalColor(type, value) === 'text-error font-bold';

    // Build sorted vitals list for patient-details view
    const buildSortedVitals = (v) => {
        if (!v) return [];
        const items = [
            { key: 'heart_rate',      label: 'Heart Rate',       emoji: '❤️',  unit: 'bpm',  value: v.heart_rate,       type: 'heart_rate' },
            { key: 'blood_pressure',  label: 'Blood Pressure',   emoji: '🩸',  unit: 'mmHg', value: v.blood_pressure,    type: 'blood_pressure' },
            { key: 'temperature',     label: 'Temperature',      emoji: '🌡️', unit: '°C',   value: v.temperature,       type: 'temperature' },
            { key: 'spo2',            label: 'SpO₂ / Lungs',     emoji: '🫁',  unit: '%',    value: v.oxygen_saturation || v.spo2, type: 'spo2' },
            { key: 'respiratory_rate',label: 'Respiratory Rate', emoji: '💨',  unit: 'rpm',  value: v.respiratory_rate,  type: 'respiratory_rate' },
        ];
        // Sort: abnormal first
        return items.sort((a, b) => {
            const aAbn = isVitalAbnormal(a.type, a.value) ? 0 : 1;
            const bAbn = isVitalAbnormal(b.type, b.value) ? 0 : 1;
            return aAbn - bAbn;
        });
    };

    // Helper for Timeline
    // Helper for Timeline (Updated to Big Box Layout)
    const renderTimeline = (handoffList) => (
        <div className="relative pb-20 max-w-[99%] mx-auto">
            {/* Center Line */}
            <div className="absolute left-4 md:left-1/2 transform md:-translate-x-1/2 w-[2px] bg-primary h-full top-0"></div>

            {handoffList.length === 0 ? (
                <div className="relative z-10 text-center py-20">
                     <div className="inline-block p-8 bg-card rounded-2xl border border-dashed border-border text-muted-foreground">
                         <span className="text-4xl block mb-2">📝</span>
                         <p>No handoff records found.</p>
                     </div>
                </div>
            ) : (
                handoffList.map((h, idx) => {
                    const matchedPatient = patients.find(p => p.patient_id === h.patient_id);
                    const getValidName = (...candidates) => {
                         return candidates.find(c => c && c !== 'Not mentioned' && c !== 'Unknown' && c.trim() !== '') || h.patient_id;
                    };
                    const patientName = getValidName(h.patient_name, matchedPatient?.patient_name, h.structured_report?.patient_name);
                    const roomNumber = h.room_number || matchedPatient?.room_number || h.structured_report?.room_number;
                    const isLeft = idx % 2 === 0;

                    return (
                        <div key={h.handoff_id} className={`flex flex-col md:flex-row items-center justify-between mb-12 w-full relative ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                            
                            {/* Timeline Cube Marker (Center) */}
                            <div className="absolute left-2 md:left-1/2 top-8 w-4 h-4 bg-primary z-20 md:-translate-x-1/2 border-4 border-border rounded-full shadow-glow"></div>
                            
                            {/* Card Container - 49.5% width */}
                            <div className="w-full md:w-[49.5%] pl-12 md:pl-0">
                                <div 
                                    onClick={() => setSelectedHandoff(h)}
                                    className="bg-card border border-border p-6 rounded-lg cursor-pointer transition-all hover:scale-[1.01] hover:shadow-xl relative flex flex-col min-h-[500px] overflow-hidden group shadow-lg"
                                >
                                    {/* Connector Line */}
                                    <div className={`hidden md:block absolute top-[2.4rem] w-4 h-[2px] bg-primary opacity-50 ${isLeft ? '-right-4' : '-left-4'}`}></div>

                                    {/* Header Section */}
                                    <div className="flex flex-col gap-4 mb-6 shrink-0 relative z-10">
                                        <div className="flex justify-between items-start w-full">
                                            <div className="flex flex-col">
                                                <h3 className="text-3xl font-bold text-primary transition-colors truncate max-w-[350px] leading-tight" title={patientName}>
                                                    {patientName}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs font-mono text-muted-foreground">ID: {h.patient_id}</span>
                                                    {roomNumber && (
                                                        <span className="text-xs font-bold text-foreground whitespace-nowrap">
                                                            Rm {roomNumber}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold uppercase tracking-wider bg-muted text-primary px-3 py-1.5 rounded border border-border shadow-sm whitespace-nowrap shrink-0 ml-2">
                                                {h.shift || 'Shift'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                                            <span>{formatDate(h.timestamp)}</span>
                                            <span className="hidden sm:inline">•</span>
                                            <span className="truncate max-w-[150px]">Nurse: {h.nurse_name}</span>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2"> 
                                        {h.structured_report && (h.structured_report.observation || h.structured_report.vitals || h.structured_report.Observation || h.structured_report.recommendation || h.structured_report.Recommendation) ? (
                                            <div className="space-y-4 pb-4 pr-2">
                                                {h.structured_report.vitals && (
                                                    <div className="bg-muted p-4 rounded border border-border/50">
                                                        <span className="text-primary font-bold text-xs uppercase block mb-2 flex items-center gap-2">
                                                            <span>💓</span> Vitals
                                                        </span>
                                                        {typeof h.structured_report.vitals === 'string' ? (
                                                            <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{h.structured_report.vitals}</p>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-3">
                                                                <span className="text-sm text-foreground bg-card px-3 py-1.5 rounded border border-border font-medium whitespace-nowrap">❤️ {renderVitalValue(h.structured_report.vitals.heart_rate)}</span>
                                                                <span className="text-sm text-foreground bg-card px-3 py-1.5 rounded border border-border font-medium whitespace-nowrap">🩸 {renderVitalValue(h.structured_report.vitals.blood_pressure)}</span>
                                                                <span className="text-sm text-foreground bg-card px-3 py-1.5 rounded border border-border font-medium whitespace-nowrap">🌡 {renderVitalValue(h.structured_report.vitals.temperature)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}



                                                {/* Handoff Report Summary Box */}

                                                {/* Handoff Report Summary Box (Always Show) */}
                                                <div className="bg-border p-4 rounded-lg border border-border mt-3 flex-1 flex flex-col justify-center min-h-[100px] shadow-sm">
                                                    <div className="flex items-center gap-2 mb-2 border-b border-border/50 pb-2">
                                                        <span className="text-lg">📋</span>
                                                        <span className="text-primary font-bold text-xs uppercase tracking-wider">Handoff Report</span>
                                                    </div>
                                                    <p className="text-sm text-foreground leading-relaxed font-light line-clamp-3 opacity-90">
                                                        {(h.structured_report.observation || h.structured_report.Observation) ? (
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
                                                            /* Fallback to transcript if only vitals are present */
                                                            <span className="italic text-muted-foreground">{h.transcript || "No additional notes recorded."}</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-muted p-4 rounded border border-border/50 h-full">
                                                <p className="text-foreground leading-relaxed text-sm whitespace-pre-wrap">{h.transcript}</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-primary text-sm group-hover:underline shrink-0">
                                        View Full Report <span>→</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Spacer */}
                            <div className="hidden md:block w-[49.5%]"></div>
                        </div>
                    );
                })
            )}
        </div>
    );


    return (
        <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Sidebar */}
            <aside className="w-[280px] bg-sidebar flex flex-col border-r border-border flex-shrink-0">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span>🩺</span> Dr. {user?.full_name ? user.full_name.charAt(0).toUpperCase() + user.full_name.slice(1) : ''}
                    </h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowProfile(true)} className="p-2 rounded hover:bg-muted transition" title="Profile">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </button>
                        <button onClick={loadData} className={`p-2 rounded hover:bg-muted transition ${loading ? 'animate-spin' : ''}`} title="Refresh Data">
                            🔄
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-3 border-b border-border">
                    <div onClick={() => setView('patients')} className="bg-muted p-3 rounded-md cursor-pointer hover:bg-border transition">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Active Patients</p>
                        <p className="text-2xl font-bold">{stats.patients}</p>
                    </div>
                    <div onClick={() => setView('tasks')} className="bg-muted p-3 rounded-md cursor-pointer hover:bg-border transition">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Pending Tasks</p>
                        <p className="text-2xl font-bold text-warning">{stats.tasks}</p>
                    </div>
                    <div onClick={() => setView('handoffs')} className="bg-muted p-3 rounded-md cursor-pointer hover:bg-border transition">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Handoffs Today</p>
                        <p className="text-2xl font-bold">{stats.handoffs}</p>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
                    <button onClick={() => setView('dashboard')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'dashboard' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>🖥️</span> Dashboard
                    </button>
                    <button onClick={() => setView('patients')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'patients' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>👥</span> All Patients
                    </button>
                    <button onClick={() => setView('care-plans')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'care-plans' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>🏥</span> Patients Care
                    </button>
                    <button onClick={() => setView('tasks')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'tasks' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>📝</span> Tasks & AI assignments
                    </button>
                    <button onClick={() => { setShowScheduledMed(true); loadUnassignedTasks(); }} className="w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition hover:bg-muted text-primary">
                        <span>💊</span> Schedule Medication
                    </button>
                    <button onClick={() => setView('handoffs')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'handoffs' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>📋</span> Nurse Handoffs
                    </button>
                    <button onClick={() => setView('nurses')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'nurses' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                        <span>👩‍⚕️</span> Manage Nurses
                    </button>
                    
                    {/* New Enhanced Views */}
                    <div className="mt-4 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground uppercase px-3 mb-2">Scheduling</p>
                        <button onClick={() => setShowScheduleManager(true)} className="w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition hover:bg-muted text-primary">
                            <span>📅</span> Manage Schedule
                        </button>
                        <button onClick={() => setView('appointments')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'appointments' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>📋</span> Appointment Requests
                            {pendingAppointments > 0 && (
                                <span className="ml-auto bg-amber-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">{pendingAppointments}</span>
                            )}
                        </button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground uppercase px-3 mb-2">Supply & Communication</p>
                        <button onClick={() => setView('inventory')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'inventory' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>📦</span> Inventory
                        </button>
                        <button onClick={() => setView('vendor-chat')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'vendor-chat' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>💬</span> Vendor Chat
                        </button>
                        <button onClick={() => { setView('vendor-requests'); loadVendorRequestCount(); }} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'vendor-requests' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>📩</span> Vendor Requests
                            {vendorPendingCount > 0 && (
                                <span className="ml-auto bg-amber-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">{vendorPendingCount}</span>
                            )}
                        </button>
                        <button onClick={() => setView('doctor-chat')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'doctor-chat' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>🩺</span> Doctor Chat
                        </button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground uppercase px-3 mb-2">Analytics</p>
                        <button onClick={() => { setView('nurse-assignments'); loadNurseAssignments(); }} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'nurse-assignments' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>📊</span> Nurse Assignments
                        </button>
                        <button onClick={() => setView('medication-history')} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'medication-history' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>💊</span> Medication History
                        </button>
                        <button onClick={() => { setView('all-nurses'); loadNurseAssignments(); }} className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${view === 'all-nurses' ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}>
                            <span>👥</span> All Nurses
                        </button>
                    </div>
                </nav>

                <div className="p-4 border-t border-border">
                    <button onClick={handleLogout} className="w-full px-3 py-2 text-left text-red-400 hover:bg-muted rounded-md transition flex items-center gap-2">
                        <span>🚪</span> Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
                {/* Theme Toggle */}
                <div className="absolute top-4 right-4 z-50">
                    <ThemeToggle />
                </div>
                <div className="flex-1 overflow-y-auto p-6 pb-48 custom-scrollbar">

                    {view === 'dashboard' && (
                        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                            <h2 className="text-4xl font-bold text-foreground">AI Care Orchestrator</h2>
                            <p className="text-text-secondary max-w-lg">Manage assigned tasks, verify nurse handoffs, and monitor patient vitals in real-time.</p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full mt-8">
                                <div onClick={() => setView('tasks')} className="p-6 bg-card rounded-xl hover:bg-border transition cursor-pointer border border-border">
                                    <h3 className="text-xl font-bold mb-2 text-warning">View Pending Tasks</h3>
                                    <p className="text-sm text-muted-foreground">Oversee {stats.tasks} tasks assigned by AI to nurses.</p>
                                </div>
                                <div onClick={() => setView('handoffs')} className="p-6 bg-card rounded-xl hover:bg-border transition cursor-pointer border border-border">
                                    <h3 className="text-xl font-bold mb-2 text-foreground">Detailed Handoffs</h3>
                                    <p className="text-sm text-muted-foreground">Review nurse observations on the timeline.</p>
                                </div>
                                <div onClick={() => setView('appointments')} className="p-6 bg-card rounded-xl hover:bg-border transition cursor-pointer border border-border">
                                    <h3 className="text-xl font-bold mb-2 text-primary">Appointments</h3>
                                    <p className="text-sm text-muted-foreground">{pendingAppointments} pending requests to review.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'appointments' && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            <div className="flex justify-between items-center border-b border-border pb-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-foreground">Appointments</h2>
                                    {appointments.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-1">{appointments.length} total appointments loaded</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => loadAppointments()} className="px-3 py-2 bg-muted hover:bg-border text-foreground rounded-md font-medium transition text-sm flex items-center gap-1 border border-border">
                                        🔄 Refresh
                                    </button>
                                    <button onClick={() => setShowScheduleManager(true)} className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md font-medium transition shadow-lg flex items-center gap-2">
                                        <span>📅</span> Manage My Schedule
                                    </button>
                                </div>
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { key: 'pending', label: '⏳ Pending', statuses: ['pending', 'pending_doctor_approval'] },
                                    { key: 'confirmed', label: '✅ Confirmed', statuses: ['approved', 'confirmed'] },
                                    { key: 'history', label: '📋 History', statuses: ['completed', 'rejected', 'cancelled'] }
                                ].map(({ key, label, statuses }) => {
                                    const count = appointments.filter(a => statuses.includes(a.status)).length;
                                    return (
                                        <button key={key} onClick={() => setApptTab(key)}
                                            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${apptTab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground border border-border'}`}>
                                            {label}
                                            {count > 0 && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${apptTab === key ? 'bg-white/20 text-white' : 'bg-muted text-foreground'}`}>
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Appointment Cards */}
                            {(() => {
                                const statusMap = {
                                    pending: ['pending', 'pending_doctor_approval'],
                                    confirmed: ['approved', 'confirmed'],
                                    history: ['completed', 'rejected', 'cancelled']
                                };
                                const filtered = appointments.filter(a => statusMap[apptTab]?.includes(a.status));
                                if (filtered.length === 0) {
                                    return (
                                        <div className="flex flex-col items-center justify-center py-20 text-center">
                                            <span className="text-5xl mb-4">
                                                {apptTab === 'pending' ? '⏳' : apptTab === 'confirmed' ? '✅' : '📋'}
                                            </span>
                                            <p className="text-xl text-muted-foreground">
                                                {apptTab === 'pending' ? 'No pending requests' : apptTab === 'confirmed' ? 'No confirmed appointments' : 'No history yet'}
                                            </p>
                                            {apptTab === 'pending' && <p className="text-sm text-muted-foreground mt-2">New booking requests will appear here</p>}
                                        </div>
                                    );
                                }
                                return (
                                    <div className="space-y-4">
                                        {filtered.map(apt => (
                                            <div key={apt.appointment_id} className="bg-card p-5 rounded-xl border border-border">
                                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <span className={`px-3 py-1 text-xs font-bold rounded border ${getAppointmentStatusBadge(apt.status)}`}>
                                                                {apt.status?.replace('_', ' ').toUpperCase()}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground font-mono">{apt.appointment_id}</span>
                                                            {apt.shift && (
                                                                <span className="text-xs px-2 py-0.5 rounded bg-primary-soft text-primary font-medium">
                                                                    🕐 {apt.shift}
                                                                </span>
                                                            )}
                                                            {apt.created_by === 'whatsapp' || apt.created_by?.includes('sarvam') ? (
                                                                <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success font-medium">💬 WhatsApp</span>
                                                            ) : null}
                                                        </div>
                                                        <p className="font-bold text-lg text-foreground">{apt.patient_name || 'Patient'}</p>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                                            <p className="text-sm text-muted-foreground">
                                                                📅 {apt.date} &nbsp;|&nbsp; ⏰ {apt.start_time} – {apt.end_time}
                                                            </p>
                                                            {apt.service_name && (
                                                                <p className="text-sm text-muted-foreground">🏥 {apt.service_name}</p>
                                                            )}
                                                            {apt.patient_phone && (
                                                                <p className="text-sm text-muted-foreground">📱 {apt.patient_phone}</p>
                                                            )}
                                                            {apt.whatsapp_number && (
                                                                <p className="text-xs text-success font-medium">💬 {apt.whatsapp_number}</p>
                                                            )}
                                                        </div>
                                                        {apt.notes && (
                                                            <p className="text-sm text-text-secondary mt-2 bg-muted p-2 rounded">📝 {apt.notes}</p>
                                                        )}
                                                    </div>

                                                    {/* Action buttons by status */}
                                                    {(apt.status === 'pending' || apt.status === 'pending_doctor_approval') && (
                                                        <div className="flex gap-2 items-start flex-shrink-0">
                                                            <button
                                                                onClick={() => handleAppointmentAction(apt.appointment_id, 'approve')}
                                                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition font-medium"
                                                            >
                                                                ✓ Approve
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const reason = window.prompt('Rejection reason (optional):');
                                                                    handleAppointmentAction(apt.appointment_id, 'reject', reason || '');
                                                                }}
                                                                className="px-4 py-2 bg-error text-primary-foreground rounded-lg hover:opacity-80 transition font-medium"
                                                            >
                                                                ✗ Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                    {(apt.status === 'approved' || apt.status === 'confirmed') && (
                                                        <button
                                                            onClick={() => handleAppointmentAction(apt.appointment_id, 'complete')}
                                                            className="px-4 py-2 bg-success text-success-foreground rounded-lg hover:opacity-90 transition font-medium flex items-center gap-2 border border-success/30 flex-shrink-0 self-start"
                                                        >
                                                            ✅ Mark as Complete
                                                        </button>
                                                    )}
                                                </div>
                                                {apt.rejection_reason && (
                                                    <p className="text-sm text-error mt-3 border-t border-border pt-3">
                                                        ❌ Rejection Reason: {apt.rejection_reason}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {view === 'vendor-chat' && (
                        <div className="max-w-6xl mx-auto h-[calc(100vh-140px)]">
                            <ChatInterface showNotify={showNotify} filterRole="vendor" userRole="doctor" />
                        </div>
                    )}

                    {view === 'vendor-requests' && (
                        <div className="max-w-5xl mx-auto">
                            <VendorRequests showNotify={showNotify} />
                        </div>
                    )}

                    {view === 'doctor-chat' && (
                        <div className="max-w-6xl mx-auto h-[calc(100vh-140px)]">
                            <ChatInterface showNotify={showNotify} filterRole="doctor" userRole="doctor" />
                        </div>
                    )}

                    {view === 'patients' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <div className="flex justify-between items-center border-b border-border pb-4">
                                <h2 className="text-3xl font-bold text-foreground">Patient Vitals & Plans</h2>
                                <button onClick={() => { setShowCreatePlan(true); }} className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md font-medium transition shadow-lg">
                                    + Create Care Plan
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {patients.map(p => (
                                    <div key={p.patient_id} onClick={() => { setSelectedPatient(p); setView('patient-details'); }} className="bg-card p-5 rounded-xl border border-border shadow-sm hover:border-primary transition cursor-pointer group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition">{p.patient_name}</h3>
                                                <p className="text-xs text-muted-foreground">ID: {p.patient_id}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded font-medium ${p.room_number ? 'bg-primary/20 text-primary' : 'bg-error-soft text-error'}`}>
                                                {p.room_number ? `Room ${p.room_number}` : 'No Room'}
                                            </span>
                                        </div>

                                        {/* Vitals Section */}
                                        <div className="space-y-2 text-sm">
                                            <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Latest Vitals</h4>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="bg-muted p-2 rounded text-center">
                                                    <span className="block text-muted-foreground text-[10px]">HR</span>
                                                    <span className={`font-mono ${getVitalColor('heart_rate', p.latest_vitals?.heart_rate)}`}>
                                                        {renderVitalValue(p.latest_vitals?.heart_rate)}
                                                    </span>
                                                </div>
                                                <div className="bg-muted p-2 rounded text-center">
                                                    <span className="block text-muted-foreground text-[10px]">BP</span>
                                                    <span className={`font-mono ${getVitalColor('blood_pressure', p.latest_vitals?.blood_pressure)}`}>
                                                        {renderVitalValue(p.latest_vitals?.blood_pressure)}
                                                    </span>
                                                </div>
                                                <div className="bg-muted p-2 rounded text-center">
                                                    <span className="block text-muted-foreground text-[10px]">Temp</span>
                                                    <span className={`font-mono ${getVitalColor('temperature', p.latest_vitals?.temperature)}`}>
                                                        {renderVitalValue(p.latest_vitals?.temperature)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-center text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition">Click for detailed report</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'care-plans' && (
                        <div className="h-full flex gap-6 max-h-[calc(100vh-140px)]">
                            {/* Left: Patient List */}
                            <div className="w-1/3 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-border bg-muted">
                                    <h3 className="font-bold text-foreground">Select Patient</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                    {patients.map(p => (
                                        <div 
                                            key={p.patient_id} 
                                            onClick={() => { setSelectedPatient(p); fetchCarePlan(p.patient_id); }}
                                            className={`p-3 rounded-lg cursor-pointer border transition flex justify-between items-center ${selectedPatient?.patient_id === p.patient_id ? 'bg-primary/20 border-primary' : 'bg-muted border-transparent hover:border-border'}`}
                                        >
                                            <div>
                                                <p className="font-bold text-foreground text-sm">{p.patient_name}</p>
                                                <p className="text-xs text-muted-foreground">{p.patient_id}</p>
                                            </div>
                                            {selectedPatient?.patient_id === p.patient_id && <span className="text-primary">●</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Care Plan Details */}
                            <div className="flex-1 bg-card rounded-xl border border-border p-6 overflow-y-auto custom-scrollbar">
                                {selectedPatient ? (
                                    activeCarePlan ? (
                                        <div className="space-y-8 animate-fade-in-up">
                                            <div className="flex justify-between items-start border-b border-border pb-4">
                                                <div>
                                                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                                        <span>🏥</span> Care Plan: {selectedPatient.patient_name}
                                                    </h2>
                                                    <p className="text-muted-foreground text-sm mt-1">Plan ID: {activeCarePlan.plan_id} • Updated: {formatDate(activeCarePlan.updated_at)}</p>
                                                </div>
                                                <span className="px-3 py-1 bg-primary/20 text-primary rounded border border-primary/30 text-sm font-bold">Active</span>
                                            </div>

                                            {/* Medications */}
                                            <div>
                                                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                                    <span className="text-xl">💊</span> Medications
                                                </h3>
                                                <div className="bg-muted rounded-lg border border-border overflow-hidden">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-surface text-muted-foreground">
                                                            <tr>
                                                                <th className="p-3 font-medium">Medication</th>
                                                                <th className="p-3 font-medium">Dose</th>
                                                                <th className="p-3 font-medium">Time</th>
                                                                <th className="p-3 font-medium">Freq</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border">
                                                            {activeCarePlan.medications?.map((m, i) => (
                                                                <tr key={i}>
                                                                    <td className="p-3 text-foreground font-medium">{m.name}</td>
                                                                    <td className="p-3 text-text-secondary">{m.dose || '-'}</td>
                                                                    <td className="p-3 text-primary font-mono">{m.time || '-'}</td>
                                                                    <td className="p-3 text-text-secondary">{m.frequency}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Meals */}
                                            <div>
                                                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                                    <span className="text-xl">🍽️</span> Meal Plan
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="bg-muted p-4 rounded-lg border border-border">
                                                        <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Breakfast • {activeCarePlan.meals?.morning_time}</p>
                                                        <p className="text-foreground font-medium">{activeCarePlan.meals?.morning || 'No selection'}</p>
                                                    </div>
                                                    <div className="bg-muted p-4 rounded-lg border border-border">
                                                        <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Lunch • {activeCarePlan.meals?.afternoon_time}</p>
                                                        <p className="text-foreground font-medium">{activeCarePlan.meals?.afternoon || 'No selection'}</p>
                                                    </div>
                                                    <div className="bg-muted p-4 rounded-lg border border-border">
                                                        <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Dinner • {activeCarePlan.meals?.night_time}</p>
                                                        <p className="text-foreground font-medium">{activeCarePlan.meals?.night || 'No selection'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Instructions */}
                                            {activeCarePlan.special_instructions && (
                                                <div className="bg-card p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                                                    <h4 className="text-warning font-bold mb-2 text-sm uppercase">Special Instructions</h4>
                                                    <p className="text-foreground text-sm">{activeCarePlan.special_instructions}</p>
                                                </div>
                                            )}

                                            {/* Create New Care Plan */}
                                            <div className="pt-4 border-t border-border flex justify-end">
                                                <button
                                                    onClick={() => { setShowCreatePlan(true); setPlanForm(prev => ({ ...prev, patient_id: selectedPatient.patient_id })); }}
                                                    className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg font-medium transition flex items-center gap-2 shadow-lg"
                                                >
                                                    <span>➕</span> Create New Care Plan
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                                            <span className="text-4xl mb-4">📋</span>
                                            <p className="text-xl font-bold">No Active Care Plan</p>
                                            <p className="text-sm">Create a care plan for this patient to see details here.</p>
                                            <button onClick={() => { setShowCreatePlan(true); setPlanForm(prev => ({ ...prev, patient_id: selectedPatient.patient_id })); }} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary-hover">
                                                Create Care Plan
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                                        <span className="text-4xl mb-4">👈</span>
                                        <p className="text-xl font-bold">Select a Patient</p>
                                        <p className="text-sm">Choose a patient from the list to view their care plan.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {view === 'patient-details' && selectedPatient && (
                        <div className="space-y-8 max-w-5xl mx-auto">
                            <button onClick={() => setView('patients')} className="text-muted-foreground hover:text-foreground mb-4">← Back to Patients</button>

                            {/* Patient Header */}
                            <div className="bg-card p-6 rounded-xl border border-border shadow-lg flex justify-between items-start">
                                <div>
                                    <h2 className="text-3xl font-bold text-foreground">{selectedPatient.patient_name}</h2>
                                    <p className="text-muted-foreground text-sm">ID: {selectedPatient.patient_id} • Age: {selectedPatient.age || 'N/A'}</p>
                                    <p className="mt-2 text-text-secondary">Diagnosis: <span className="font-medium text-foreground">{selectedPatient.diagnosis}</span></p>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-bold text-primary bg-primary/10 px-4 py-2 rounded-lg border border-primary/20">
                                        Room {selectedPatient.room_number || 'N/A'}
                                    </span>
                                    <button 
                                        onClick={() => setShowEditPatient(true)}
                                        className="ml-4 px-4 py-2 bg-card hover:bg-muted text-foreground rounded-lg border border-border transition"
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
                                    loadGeneralData();
                                    setView('patients');
                                }} 
                            />

                            {/* Latest Vitals & Stats — abnormal highlighted first, with emojis */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {buildSortedVitals(selectedPatient.latest_vitals).map(vital => {
                                    const isAbnormal = isVitalAbnormal(vital.type, vital.value);
                                    return (
                                        <div key={vital.key} className={`p-4 rounded-lg border text-center relative transition ${
                                            isAbnormal
                                                ? 'bg-error/10 border-error/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                                : 'bg-muted border-border'
                                        }`}>
                                            {isAbnormal && (
                                                <span className="absolute top-1.5 right-2 text-[10px] text-error font-bold uppercase tracking-wide">⚠ Alert</span>
                                            )}
                                            <span className="text-2xl block mb-1">{vital.emoji}</span>
                                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide block">{vital.label}</span>
                                            <p className={`text-2xl font-mono mt-1 ${getVitalColor(vital.type, vital.value)}`}>
                                                {renderVitalValue(vital.value)}
                                                <span className="text-xs text-muted-foreground ml-1">{vital.unit}</span>
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* Nurse Observations & Recommendations */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-card p-6 rounded-xl border border-border">
                                    <h3 className="text-lg font-bold text-foreground mb-4 border-b border-border pb-2">Latest Nurse Observations</h3>
                                    {selectedPatient.latest_observations?.length > 0 ? (
                                        <ul className="space-y-2 list-disc pl-5 text-text-secondary">
                                            {selectedPatient.latest_observations.map((obs, i) => <li key={i}>{obs}</li>)}
                                        </ul>
                                    ) : <p className="text-muted-foreground italic">No observations recorded.</p>}
                                </div>
                                <div className="bg-card p-6 rounded-xl border border-border">
                                    <h3 className="text-lg font-bold text-foreground mb-4 border-b border-border pb-2">Recommendations / Action Items</h3>
                                    {selectedPatient.action_items?.length > 0 ? (
                                        <ul className="space-y-2 list-none pl-0">
                                            {selectedPatient.action_items.map((item, i) => (
                                                <li key={i} className="flex items-center gap-2 text-text-secondary">
                                                    <span className="text-warning">⚠</span> {item}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : <p className="text-muted-foreground italic">No specific recommendations.</p>}
                                </div>
                            </div>

                            {/* Detailed Handoff History (Timeline) */}
                            <div className="mt-8">
                                <h3 className="text-2xl font-bold text-foreground mb-6 text-center">Recent Handoff History</h3>
                                {renderTimeline(handoffs.filter(h => h.patient_id === selectedPatient.patient_id))}
                            </div>
                        </div>
                    )}

                    {view === 'tasks' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <div className="flex justify-between items-center border-b border-border pb-4">
                                <h2 className="text-3xl font-bold text-foreground">Pending Tasks & AI Assignment</h2>
                                <button onClick={() => { setShowScheduledMed(true); loadUnassignedTasks(); }} className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md font-medium transition shadow-lg flex items-center gap-2">
                                    <span>💊</span> Schedule Medication
                                </button>
                            </div>

                            {/* Unassigned Tasks Warning */}
                            {unassignedTasks.length > 0 && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">⚠️</span>
                                        <h3 className="text-lg font-bold text-warning">
                                            {unassignedTasks.length} Task{unassignedTasks.length > 1 ? 's' : ''} Unassigned
                                        </h3>
                                    </div>
                                    <p className="text-text-secondary text-sm mb-3">These tasks have no nurse assigned. Consider adding more nurses for the relevant shifts.</p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {unassignedTasks.slice(0, 5).map((t, idx) => (
                                            <div key={t.task_id || idx} className="flex justify-between items-center bg-muted rounded px-3 py-2 text-sm">
                                                <span className="text-foreground">{t.description}</span>
                                                <span className="text-muted-foreground">{t.patient_name || t.patient_id} • {t.shift || 'Any'}</span>
                                            </div>
                                        ))}
                                        {unassignedTasks.length > 5 && (
                                            <p className="text-muted-foreground text-xs text-center">+ {unassignedTasks.length - 5} more</p>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="bg-card rounded-lg overflow-hidden border border-border shadow-lg">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-surface text-muted-foreground text-sm uppercase">
                                        <tr>
                                            <th className="p-4 border-b border-border">Task Description</th>
                                            <th className="p-4 border-b border-border">Patient</th>
                                            <th className="p-4 border-b border-border">Scheduled</th>
                                            <th className="p-4 border-b border-border">Assigned Nurse (AI)</th>
                                            <th className="p-4 border-b border-border">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {tasks.filter(t => t.status !== 'completed').map(t => {
                                            const taskPatient = patients.find(p => p.patient_id === t.patient_id);
                                            return (
                                            <tr key={t.task_id || t._id || `${t.patient_id}-${t.scheduled_time}-${t.task_type}`} className="hover:bg-border transition">
                                                <td className="p-4 font-medium text-foreground">{t.description || <span className="text-muted-foreground italic">No Description</span>}</td>
                                                <td className="p-4">
                                                    <p className="text-foreground font-medium">{taskPatient?.patient_name || t.patient_name || '—'}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{t.patient_id}</p>
                                                </td>
                                                <td className="p-4 text-text-secondary">{formatDate(t.scheduled_time)}</td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-primary font-bold">{t.assigned_nurse_name || 'Unassigned'}</span>
                                                        {t.ai_score && (
                                                            <span className="text-[10px] text-muted-foreground" title={t.assignment_reason}>
                                                                AI Score: {t.ai_score}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${t.status === 'pending' ? 'bg-warning-soft text-warning' : 'bg-primary/20 text-primary'}`}>
                                                        {t.status}
                                                    </span>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                        {tasks.length === 0 && (
                                            <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No tasks found. Create a care plan to generate tasks.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {view === 'handoffs' && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            <h2 className="text-3xl font-bold text-foreground text-center mb-8">Nurse Observations Timeline</h2>
                            {renderTimeline(handoffs)}
                        </div>
                    )}

                    {view === 'nurses' && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            {/* ... same nurse table ... */}
                            <div className="flex justify-between items-center border-b border-border pb-4">
                                <h2 className="text-3xl font-bold text-foreground">Manage Nursing Staff</h2>
                                <button onClick={() => setShowAddNurse(true)} className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md font-medium transition shadow-lg">
                                    + Add New Nurse
                                </button>
                            </div>
                            <div className="bg-card rounded-lg overflow-hidden border border-border shadow-md">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-surface text-muted-foreground text-sm uppercase tracking-wider">
                                        <tr>
                                            <th className="p-4 font-medium border-b border-border">Name</th>
                                            <th className="p-4 font-medium border-b border-border">Employee ID</th>
                                            <th className="p-4 font-medium border-b border-border">Department</th>
                                            <th className="p-4 font-medium border-b border-border">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {nurses.map(n => (
                                            <tr key={n.user_id} className="hover:bg-border transition">
                                                <td className="p-4 text-foreground font-medium">{n.full_name}</td>
                                                <td className="p-4 text-text-secondary">{n.employee_id}</td>
                                                <td className="p-4 text-text-secondary">{n.department || '-'}</td>
                                                <td className="p-4">
                                                    <button onClick={() => handleDeleteNurse(n.user_id)} className="text-error hover:text-error font-medium text-sm transition bg-error-soft px-3 py-1 rounded">Remove</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Nurse Assignments View */}
                    {view === 'nurse-assignments' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <h2 className="text-3xl font-bold text-foreground border-b border-border pb-4">📊 Nurse Assignments & Completed Tasks</h2>
                            {nurseAssignments.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground">
                                    <span className="text-5xl block mb-4">📭</span>
                                    <p>No nurse assignment data available</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {nurseAssignments.map(nurse => (
                                        <div key={nurse.nurse_id} onClick={() => loadNurseDetails(nurse.nurse_id)} className="bg-card rounded-xl border border-border p-5 hover:border-primary transition cursor-pointer group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition">{nurse.nurse_name}</h3>
                                                    <p className="text-xs text-muted-foreground">Current Shift: <span className="text-primary">{nurse.current_shift}</span></p>
                                                </div>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    nurse.status === 'online' ? 'bg-success-soft text-success' 
                                                    : nurse.status === 'emergency' ? 'bg-error/20 text-error'
                                                    : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {nurse.status === 'emergency' ? '🚨 Emergency' : nurse.status || 'offline'}
                                                </span>
                                            </div>
                                            
                                            {/* Shifts breakdown */}
                                            {nurse.shifts?.length > 0 ? (
                                                <div className="space-y-3">
                                                    {nurse.shifts.map((shift, idx) => (
                                                        <div key={idx} className="bg-muted p-3 rounded-lg border border-border">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="font-medium text-foreground">{shift.shift} Shift</span>
                                                                <span className="text-xs text-muted-foreground">{shift.completed_tasks}/{shift.total_tasks} completed</span>
                                                            </div>
                                                            {shift.patients?.map((patient, pidx) => (
                                                                <div key={pidx} className="ml-4 mt-2 text-sm">
                                                                    <p className="text-text-secondary">👤 {patient.patient_name}</p>
                                                                    <ul className="ml-4 text-xs text-muted-foreground">
                                                                        {patient.tasks?.slice(0, 3).map((task, tidx) => (
                                                                            <li key={tidx} className="flex items-center gap-2">
                                                                                <span className={task.status === 'completed' ? 'text-success' : 'text-warning'}>
                                                                                    {task.status === 'completed' ? '✓' : '○'}
                                                                                </span>
                                                                                {task.description || task.task_type}
                                                                            </li>
                                                                        ))}
                                                                        {patient.tasks?.length > 3 && (
                                                                            <li className="text-muted-foreground">...+{patient.tasks.length - 3} more</li>
                                                                        )}
                                                                    </ul>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-muted-foreground text-sm italic">No tasks assigned yet</p>
                                            )}
                                            
                                            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                                                <span>Total Handoffs: {nurse.total_handoffs}</span>
                                                <span className="text-primary opacity-0 group-hover:opacity-100 transition">View details →</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Medication History View */}
                    {view === 'medication-history' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <h2 className="text-3xl font-bold text-foreground border-b border-border pb-4">💊 Patient Medication History</h2>
                            
                            <div className="flex gap-6">
                                {/* Patient Selector */}
                                <div className="w-64 bg-card rounded-xl border border-border p-4 h-fit">
                                    <h3 className="text-sm font-medium text-muted-foreground uppercase mb-3">Select Patient</h3>
                                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                        {patients.map(p => (
                                            <button key={p.patient_id} onClick={() => loadMedicationHistory(p.patient_id)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${selectedMedicationPatient === p.patient_id ? 'bg-primary text-primary-foreground' : 'bg-muted text-text-secondary hover:bg-border'}`}>
                                                {p.patient_name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Medication List */}
                                <div className="flex-1 bg-card rounded-xl border border-border p-5">
                                    {selectedMedicationPatient ? (
                                        medicationHistory.length > 0 ? (
                                            <div className="space-y-4">
                                                {medicationHistory.map((med, idx) => (
                                                    <div key={idx} className="bg-muted p-4 rounded-lg border border-border">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h4 className="font-bold text-foreground">{med.medication_name || 'Unnamed Medication'}</h4>
                                                                <p className="text-sm text-text-secondary">Dose: {med.dose || 'N/A'} • Frequency: {med.frequency || 'N/A'}</p>
                                                                <p className="text-xs text-muted-foreground mt-1">Time: {med.time || 'N/A'}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className={`text-xs px-2 py-1 rounded ${med.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>
                                                                    {med.is_active ? 'Active' : 'Past'}
                                                                </span>
                                                                <p className="text-xs text-muted-foreground mt-2">{formatDate(med.prescribed_date)}</p>
                                                            </div>
                                                        </div>
                                                        {med.doctor_name && (
                                                            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">Prescribed by: {med.doctor_name}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 text-muted-foreground">
                                                <span className="text-4xl block mb-3">💊</span>
                                                <p>No medication history found</p>
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <span className="text-4xl block mb-3">👈</span>
                                            <p>Select a patient to view medication history</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* All Nurses View */}
                    {view === 'all-nurses' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <h2 className="text-3xl font-bold text-foreground border-b border-border pb-4">👥 All Nurses Overview</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {nurseAssignments.map(nurse => (
                                    <div key={nurse.nurse_id} onClick={() => loadNurseDetails(nurse.nurse_id)}
                                        className="bg-card rounded-xl border border-border p-5 hover:border-primary transition cursor-pointer group">
                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition">{nurse.nurse_name}</h3>
                                            <span className={`px-2 py-1 rounded text-xs ${
                                                nurse.status === 'online' ? 'bg-success-soft text-success' 
                                                : nurse.status === 'emergency' ? 'bg-error/20 text-error'
                                                : 'bg-muted text-muted-foreground'
                                            }`}>
                                                {nurse.status === 'emergency' ? '🚨 Emergency' : nurse.status || 'offline'}
                                            </span>
                                        </div>
                                        <div className="space-y-2 text-sm text-text-secondary">
                                            <p>Shift: <span className="text-primary">{nurse.current_shift}</span></p>
                                            <p>Tasks: {nurse.shifts?.reduce((sum, s) => sum + (s.completed_tasks || 0), 0) || 0} completed</p>
                                            <p>Handoffs: {nurse.total_handoffs || 0}</p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-border">
                                            <span className="text-xs text-muted-foreground">Click to view details →</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Nurse Details View */}
                    {view === 'nurse-details' && selectedNurseDetails && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            <button onClick={() => setView('all-nurses')} className="text-muted-foreground hover:text-foreground mb-4">← Back to All Nurses</button>
                            
                            {/* Nurse Header */}
                            <div className="bg-card p-6 rounded-xl border border-border">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-3xl font-bold text-foreground">{selectedNurseDetails.nurse_name}</h2>
                                        <p className="text-muted-foreground">{selectedNurseDetails.email}</p>
                                        <p className="text-text-secondary mt-2">Department: {selectedNurseDetails.department || 'N/A'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                            selectedNurseDetails.current_status === 'online' ? 'bg-success-soft text-success' 
                                            : selectedNurseDetails.current_status === 'emergency' ? 'bg-error/20 text-error'
                                            : 'bg-muted text-muted-foreground'
                                        }`}>
                                            {selectedNurseDetails.current_status === 'emergency' ? '🚨 Emergency' : selectedNurseDetails.current_status || 'offline'}
                                        </span>
                                        <p className="text-muted-foreground text-sm mt-2">Current: {selectedNurseDetails.current_shift} Shift</p>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-muted p-4 rounded-lg border border-border text-center">
                                    <span className="text-muted-foreground text-xs uppercase">Completed</span>
                                    <p className="text-3xl font-bold text-success mt-1">{selectedNurseDetails.total_tasks_completed || 0}</p>
                                </div>
                                <div className="bg-muted p-4 rounded-lg border border-border text-center">
                                    <span className="text-muted-foreground text-xs uppercase">Pending</span>
                                    <p className="text-3xl font-bold text-warning mt-1">{selectedNurseDetails.pending_tasks || 0}</p>
                                </div>
                                <div className="bg-muted p-4 rounded-lg border border-border text-center">
                                    <span className="text-muted-foreground text-xs uppercase">Reassigned</span>
                                    <p className="text-3xl font-bold text-primary mt-1">{selectedNurseDetails.reassigned_tasks || 0}</p>
                                </div>
                                <div className="bg-muted p-4 rounded-lg border border-border text-center">
                                    <span className="text-muted-foreground text-xs uppercase">Handoffs</span>
                                    <p className="text-3xl font-bold text-foreground mt-1">{selectedNurseDetails.total_handoffs || 0}</p>
                                </div>
                            </div>

                            {/* Task Breakdown Tabs */}
                            <div className="bg-card p-5 rounded-xl border border-border">
                                <div className="flex gap-2 mb-4 border-b border-border pb-3">
                                    {[
                                        { key: 'completed', label: '✅ Completed', count: selectedNurseDetails.total_tasks_completed || 0 },
                                        { key: 'pending', label: '⏳ Pending', count: selectedNurseDetails.pending_tasks || 0 },
                                        { key: 'reassigned', label: '🔄 Reassigned', count: selectedNurseDetails.reassigned_tasks || 0 }
                                    ].map(tab => (
                                        <button key={tab.key}
                                            onClick={() => setNurseTaskTab?.(tab.key)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                                (nurseTaskTab || 'completed') === tab.key
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-foreground hover:bg-border'
                                            }`}>
                                            {tab.label} ({tab.count})
                                        </button>
                                    ))}
                                </div>

                                {/* Completed Tasks */}
                                {(nurseTaskTab || 'completed') === 'completed' && (
                                    selectedNurseDetails.recent_completed_tasks?.length > 0 ? (
                                        <div className="space-y-2">
                                            {selectedNurseDetails.recent_completed_tasks.map((task, idx) => (
                                                <div key={idx} className="bg-muted p-3 rounded-lg flex justify-between items-center text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-success">✓</span>
                                                        <div>
                                                            <span className="text-foreground">{task.description || task.task_type}</span>
                                                            {task.patient_name && <span className="text-muted-foreground ml-2">• {task.patient_name}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-muted-foreground text-xs">{formatDate(task.completed_at)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-muted-foreground italic py-4 text-center">No completed tasks</p>
                                )}

                                {/* Pending Tasks */}
                                {(nurseTaskTab || 'completed') === 'pending' && (
                                    selectedNurseDetails.recent_pending_tasks?.length > 0 ? (
                                        <div className="space-y-2">
                                            {selectedNurseDetails.recent_pending_tasks.map((task, idx) => (
                                                <div key={idx} className="bg-muted p-3 rounded-lg flex justify-between items-center text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-warning">○</span>
                                                        <div>
                                                            <span className="text-foreground">{task.description || task.task_type}</span>
                                                            {task.patient_name && <span className="text-muted-foreground ml-2">• {task.patient_name}</span>}
                                                        </div>
                                                    </div>
                                                    <span className={`text-xs px-2 py-0.5 rounded ${task.priority === 'high' ? 'bg-error/20 text-error' : 'bg-warning/20 text-warning'}`}>
                                                        {task.priority || 'normal'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-muted-foreground italic py-4 text-center">No pending tasks</p>
                                )}

                                {/* Reassigned Tasks */}
                                {(nurseTaskTab || 'completed') === 'reassigned' && (
                                    selectedNurseDetails.recent_reassigned_tasks?.length > 0 ? (
                                        <div className="space-y-2">
                                            {selectedNurseDetails.recent_reassigned_tasks.map((task, idx) => (
                                                <div key={idx} className="bg-muted p-3 rounded-lg flex justify-between items-center text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-primary">🔄</span>
                                                        <div>
                                                            <span className="text-foreground">{task.description || task.task_type}</span>
                                                            {task.patient_name && <span className="text-muted-foreground ml-2">• {task.patient_name}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-muted-foreground text-xs">{task.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-muted-foreground italic py-4 text-center">No reassigned tasks</p>
                                )}
                            </div>

                            {/* Shifts Worked */}
                            <div className="bg-card p-5 rounded-xl border border-border">
                                <h3 className="text-lg font-bold text-foreground mb-4 border-b border-border pb-2">Recent Shifts Worked</h3>
                                {selectedNurseDetails.shifts_worked?.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedNurseDetails.shifts_worked.slice(0, 10).map((shift, idx) => (
                                            <div key={idx} className="bg-muted p-3 rounded-lg flex justify-between items-center">
                                                <div>
                                                    <span className="font-medium text-foreground">{shift.date}</span>
                                                    <span className="ml-2 text-sm text-primary">{shift.shift} Shift</span>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {shift.tasks_completed} tasks • {shift.patients?.length || 0} patients
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground italic">No shift history available</p>
                                )}
                            </div>
                        </div>
                    )}

                    {view === 'inventory' && (
                        <InventoryPanel showNotify={showNotify} refreshTrigger={inventoryRefreshKey} />
                    )}


                </div>

                {/* Persistent Chatbot */}
                <div className="absolute bottom-0 left-0 right-0 bg-muted border-t border-border p-4 z-40 shadow-lg">
                    <div className="max-w-4xl mx-auto">
                        {chatMessages.length > 0 && (
                            <div className="mb-4 relative">
                                <button onClick={() => setChatMessages([])} className="absolute top-2 right-2 z-10 p-1 bg-border hover:bg-error text-text-secondary hover:text-foreground rounded-full transition text-xs w-6 h-6 flex items-center justify-center" title="Close chat">✕</button>
                                <div className="space-y-3 p-4 bg-surface rounded-lg border border-border h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                {chatMessages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] rounded-lg px-4 py-2 text-sm leading-relaxed ${msg.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground border border-border'}`}>
                                            {msg.text}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            </div>
                        )}
                        <form onSubmit={handleChatSubmit} className="relative">
                            <input type="text" value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)} placeholder="Ask AI..." className="w-full bg-input text-foreground rounded-xl pl-5 pr-12 py-4 shadow-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition-all placeholder-muted-foreground" />
                            <button type="submit" disabled={chatLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary transition rounded-md"><span className="text-xl">➤</span></button>
                        </form>
                    </div>
                </div>
            </main>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded shadow-lg text-primary-foreground font-medium animate-fade-in-down ${notification.type === 'error' ? 'bg-error' : 'bg-primary'}`}>{notification.message}</div>
            )}

            {/* Show Add Nurse Modal (reused) */}
            {showAddNurse && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-surface p-8 rounded-xl w-96 border border-border shadow-2xl">
                        <h2 className="text-xl font-bold mb-6 text-foreground">Add New Nurse</h2>
                        <form onSubmit={handleAddNurse} className="space-y-4">
                            <input placeholder="Full Name" required className="w-full bg-muted text-foreground border border-border rounded p-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring" onChange={e => setNurseForm({ ...nurseForm, full_name: e.target.value })} />
                            <input placeholder="Email" required className="w-full bg-muted text-foreground border border-border rounded p-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring" onChange={e => setNurseForm({ ...nurseForm, email: e.target.value })} />
                            <input placeholder="Password" type="password" required autoComplete="new-password" className="w-full bg-muted text-foreground border border-border rounded p-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring" onChange={e => setNurseForm({ ...nurseForm, password: e.target.value })} />
                            <input placeholder="Employee ID" required className="w-full bg-muted text-foreground border border-border rounded p-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring" onChange={e => setNurseForm({ ...nurseForm, employee_id: e.target.value })} />
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowAddNurse(false)} className="px-4 py-2 bg-card text-foreground rounded hover:bg-muted transition">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary rounded text-primary-foreground hover:bg-primary-hover transition">Add Nurse</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Care Plan Modal */}
            {showCreatePlan && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-surface p-6 rounded-xl w-full max-w-2xl border border-border max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-border">
                            <h2 className="text-xl font-bold text-foreground">Create Care Plan</h2>
                            <button onClick={() => setShowCreatePlan(false)} className="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                        </div>
                        <form onSubmit={submitCarePlan} className="space-y-6">
                            <div>
                                <label className="block text-text-secondary mb-2 font-medium">Select Patient</label>
                                <select className="w-full bg-muted text-foreground border border-border p-3 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring"
                                    onChange={e => setPlanForm({ ...planForm, patient_id: e.target.value })} required>
                                    <option value="">Select Patient...</option>
                                    {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_id})</option>)}
                                </select>
                            </div>

                            {/* Medications */}
                            <div className="bg-card p-4 rounded-lg border border-border">
                                <label className="block text-foreground mb-3 font-medium">💊 Medications (with timing)</label>
                                {planForm.medications.map((m, i) => (
                                    <div key={i} className="flex gap-2 mb-2">
                                        <input placeholder="Name" className="flex-1 bg-muted text-foreground border border-border p-2 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring"
                                            value={m.name} onChange={e => {
                                                const newMeds = [...planForm.medications];
                                                newMeds[i].name = e.target.value;
                                                setPlanForm({ ...planForm, medications: newMeds });
                                            }} />
                                        <input placeholder="13:00" className="w-24 bg-muted text-foreground border border-border p-2 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring"
                                            value={m.time} onChange={e => {
                                                const newMeds = [...planForm.medications];
                                                newMeds[i].time = e.target.value;
                                                setPlanForm({ ...planForm, medications: newMeds });
                                            }} />
                                        <input placeholder="Freq (once)" className="w-24 bg-muted text-foreground border border-border p-2 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring"
                                            value={m.frequency} onChange={e => {
                                                const newMeds = [...planForm.medications];
                                                newMeds[i].frequency = e.target.value;
                                                setPlanForm({ ...planForm, medications: newMeds });
                                            }} />
                                    </div>
                                ))}
                                <button type="button" onClick={() => setPlanForm({ ...planForm, medications: [...planForm.medications, { name: '', dose: '', time: '', frequency: '' }] })} className="text-sm text-primary hover:underline mt-2">+ Add Another Medication</button>
                            </div>

                            {/* Meals */}
                            <div className="bg-card p-4 rounded-lg border border-border">
                                <label className="block text-foreground mb-3 font-medium">🍽️ Meal Plan (with timing)</label>
                                <div className="space-y-3">
                                    <div className="flex gap-2 items-center">
                                        <label className="w-20 text-muted-foreground text-sm">Breakfast</label>
                                        <input placeholder="Meal info" className="flex-1 bg-muted text-foreground border border-border p-2 rounded"
                                            onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, morning: e.target.value } })} />
                                        <input type="time" className="w-32 bg-muted text-foreground border border-border p-2 rounded"
                                            value={planForm.meals.morning_time} onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, morning_time: e.target.value } })} />
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <label className="w-20 text-muted-foreground text-sm">Lunch</label>
                                        <input placeholder="Meal info" className="flex-1 bg-muted text-foreground border border-border p-2 rounded"
                                            onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, afternoon: e.target.value } })} />
                                        <input type="time" className="w-32 bg-muted text-foreground border border-border p-2 rounded"
                                            value={planForm.meals.afternoon_time} onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, afternoon_time: e.target.value } })} />
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <label className="w-20 text-muted-foreground text-sm">Dinner</label>
                                        <input placeholder="Meal info" className="flex-1 bg-muted text-foreground border border-border p-2 rounded"
                                            onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, night: e.target.value } })} />
                                        <input type="time" className="w-32 bg-muted text-foreground border border-border p-2 rounded"
                                            value={planForm.meals.night_time} onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, night_time: e.target.value } })} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                                <button type="button" onClick={() => setShowCreatePlan(false)} className="px-5 py-2 bg-card text-foreground rounded hover:bg-muted transition">Cancel</button>
                                <button type="submit" className="px-5 py-2 bg-primary rounded text-primary-foreground hover:bg-primary-hover transition">Create Care Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Handoff Modal */}
            {selectedHandoff && (
                <ViewHandoffModal 
                    handoff={selectedHandoff} 
                    onClose={() => setSelectedHandoff(null)} 
                />
            )}

            {/* Scheduled Medication Modal */}
            {showScheduledMed && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
                    <div className="bg-surface rounded-xl max-w-lg w-full p-6 shadow-2xl border border-border max-h-[90vh] overflow-y-auto animate-fade-in">
                        <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                <span>💊</span> Schedule Medication Tasks
                            </h2>
                            <button onClick={() => setShowScheduledMed(false)} className="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                        </div>

                        <form onSubmit={submitScheduledMedication} className="space-y-5">
                            {/* Patient Selection */}
                            <div>
                                <label className="block text-muted-foreground text-sm mb-2">Patient *</label>
                                <select 
                                    value={scheduledMedForm.patient_id}
                                    onChange={e => setScheduledMedForm({ ...scheduledMedForm, patient_id: e.target.value })}
                                    className="w-full bg-card text-foreground border border-border p-3 rounded focus:border-primary focus:outline-none"
                                    required
                                >
                                    <option value="">Select Patient</option>
                                    {patients.map(p => (
                                        <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_id})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Medication Name */}
                            <div>
                                <label className="block text-muted-foreground text-sm mb-2">Medication Name *</label>
                                <input 
                                    type="text"
                                    value={scheduledMedForm.medication_name}
                                    onChange={e => setScheduledMedForm({ ...scheduledMedForm, medication_name: e.target.value })}
                                    className="w-full bg-card text-foreground border border-border p-3 rounded focus:border-primary focus:outline-none"
                                    placeholder="e.g., Paracetamol 500mg"
                                    required
                                />
                            </div>

                            {/* Shifts Selection */}
                            <div>
                                <label className="block text-muted-foreground text-sm mb-3">Shifts (when to administer) *</label>
                                <div className="flex gap-4">
                                    {['day', 'afternoon', 'night'].map(shift => (
                                        <label key={shift} className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                checked={scheduledMedForm.shifts.includes(shift)}
                                                onChange={e => {
                                                    const newShifts = e.target.checked 
                                                        ? [...scheduledMedForm.shifts, shift]
                                                        : scheduledMedForm.shifts.filter(s => s !== shift);
                                                    setScheduledMedForm({ ...scheduledMedForm, shifts: newShifts });
                                                }}
                                                className="w-5 h-5 accent-primary"
                                            />
                                            <span className="text-foreground capitalize">
                                                {shift === 'day' ? '☀️ Day (9am)' : shift === 'afternoon' ? '🌅 Afternoon (2pm)' : '🌙 Night (9pm)'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-muted-foreground text-sm mb-2">Start Date *</label>
                                    <input 
                                        type="date"
                                        value={scheduledMedForm.start_date}
                                        onChange={e => setScheduledMedForm({ ...scheduledMedForm, start_date: e.target.value })}
                                        className="w-full bg-muted text-foreground border border-border p-3 rounded"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-muted-foreground text-sm mb-2">End Date *</label>
                                    <input 
                                        type="date"
                                        value={scheduledMedForm.end_date}
                                        onChange={e => setScheduledMedForm({ ...scheduledMedForm, end_date: e.target.value })}
                                        className="w-full bg-muted text-foreground border border-border p-3 rounded"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Duration Preview */}
                            {scheduledMedForm.start_date && scheduledMedForm.end_date && scheduledMedForm.shifts.length > 0 && (
                                <div className="bg-primary/10 border border-primary/30 rounded p-3 text-sm">
                                    <span className="text-primary font-medium">📋 Preview: </span>
                                    <span className="text-text-secondary">
                                        {(() => {
                                            const days = Math.ceil((new Date(scheduledMedForm.end_date) - new Date(scheduledMedForm.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                                            const totalTasks = days * scheduledMedForm.shifts.length;
                                            return `${totalTasks} tasks will be created (${days} days × ${scheduledMedForm.shifts.length} shift${scheduledMedForm.shifts.length > 1 ? 's' : ''})`;
                                        })()}
                                    </span>
                                </div>
                            )}

                            {/* Notes */}
                            <div>
                                <label className="block text-muted-foreground text-sm mb-2">Notes (optional)</label>
                                <textarea 
                                    value={scheduledMedForm.notes}
                                    onChange={e => setScheduledMedForm({ ...scheduledMedForm, notes: e.target.value })}
                                    className="w-full bg-muted text-foreground border border-border p-3 rounded resize-none"
                                    rows={2}
                                    placeholder="e.g., Take with food"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                <button 
                                    type="button" 
                                    onClick={() => setShowScheduledMed(false)} 
                                    className="px-5 py-2 bg-card text-foreground rounded hover:bg-muted transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="px-5 py-2 bg-primary rounded text-primary-foreground hover:bg-primary-hover transition disabled:opacity-50"
                                >
                                    {loading ? 'Creating...' : 'Create Medication Tasks'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfile} 
                onClose={() => setShowProfile(false)} 
                user={{...user, role: 'doctor'}} 
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />

            {/* Schedule Manager Modal */}
            {showScheduleManager && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <DoctorScheduleManager
                        onClose={() => setShowScheduleManager(false)}
                        onSuccess={() => {
                            showNotify('Schedule updated successfully', 'success');
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default DoctorDashboard;
