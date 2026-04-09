import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE, getAuthHeaders, formatDate, formatTimeAmPm, connectSocket, getRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ViewHandoffModal from '../components/ViewHandoffModal';
import ProfileModal from '../components/ProfileModal';
import DoctorScheduleManager from '../components/DoctorScheduleManager';
import PatientEditModal from '../components/PatientEditModal';
import ChatInterface from '../components/ChatInterface';
import VendorRequests from './VendorRequests';
import InventoryPanel from '../components/procurement/InventoryPanel';
import ThemeToggle from '../components/ThemeToggle';
import AppointmentCalendar from '../components/AppointmentCalendar';

// MUI Components
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Snackbar from '@mui/material/Snackbar';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';

// MUI Icons
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

import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import RefreshIcon from '@mui/icons-material/Refresh';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';

const DRAWER_WIDTH = 260;
const DRAWER_WIDTH_COLLAPSED = 72;

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

    // Dashboard KPI Stats
    const [dashboardStats, setDashboardStats] = useState(null);

    // Global Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState({ patients: [], tasks: [] });
    const [showSearchResults, setShowSearchResults] = useState(false);
    const searchTimeout = useRef(null);

    // Notification System
    const [notifications, setNotifications] = useState([]);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        full_name: '', employee_id: '', email: '', password: '', confirm_password: '', department: '', phone: ''
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

        // Fetch fresh profile so name/details reflect edits without re-login
        fetch(`${API_BASE}/user/profile`, { headers: getAuthHeaders('doctor') })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.user) {
                    setUser(data.user);
                    sessionStorage.setItem('doctor_user', JSON.stringify(data.user));
                }
            })
            .catch(console.error);

        connectSocket('doctor');
        loadData();
        loadDashboardStats();
    }, []);

    // Push a notification into the bell
    const pushNotification = useCallback((msg, type = 'info') => {
        setNotifications(prev => [{ id: Date.now(), message: msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
    }, []);

    // Real-time socket events — mutate state directly, no re-fetching
    useRealtimeEvents({
        // Task events: re-fetch tasks/general area AND nurse assignments
        'task_completed': (data) => { const msg = `Task completed: ${data.description || 'A task'}`; showNotify(msg, 'success'); pushNotification(msg, 'success'); loadGeneralData(); loadNurseAssignments(); loadDashboardStats(); },
        'task_rejected': (data) => { const msg = `Task rejected by ${data.nurse_name}: ${data.reason}`; showNotify(msg, 'error'); pushNotification(msg, 'error'); loadGeneralData(); loadNurseAssignments(); loadDashboardStats(); },
        // Nurse status changed (online/offline/emergency)
        'nurse_status_changed': (data) => {
            const msg = `Nurse ${data.nurse_name || ''} is now ${data.status}${data.reassigned_tasks ? ` (${data.reassigned_tasks} tasks reassigned)` : ''}`;
            showNotify(msg, data.status === 'emergency' ? 'error' : 'info');
            pushNotification(msg, data.status === 'emergency' ? 'error' : 'info');
            loadNurseAssignments();
            loadGeneralData();
        },
        // New appointment booked (WhatsApp / patient portal / nurse)
        'new_appointment': (data) => {
            const msg = `New appointment: ${data.patient_name || 'Patient'}${data.date ? ' on ' + data.date : ''}`;
            showNotify(msg, 'info');
            pushNotification(msg, 'info');
            loadAppointments();
            loadDashboardStats();
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
            showNotify(`Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info');
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

    // Load dashboard KPI stats
    const loadDashboardStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/doctor/dashboard-stats`, {
                headers: getAuthHeaders('doctor'), cache: 'no-store'
            });
            const data = await res.json();
            if (data.success) setDashboardStats(data.stats);
        } catch { /* silent */ }
    };

    // Debounced global search
    const handleSearch = (query) => {
        setSearchQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query || query.length < 2) {
            setSearchResults({ patients: [], tasks: [] });
            setShowSearchResults(false);
            return;
        }
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/doctor/search?q=${encodeURIComponent(query)}`, {
                    headers: getAuthHeaders('doctor')
                });
                const data = await res.json();
                if (data.success) {
                    setSearchResults({ patients: data.patients || [], tasks: data.tasks || [] });
                    setShowSearchResults(true);
                }
            } catch { /* silent */ }
        }, 300);
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
        if (nurseForm.password !== nurseForm.confirm_password) {
            return showNotify("Passwords don't match", 'error');
        }
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
                setNurseForm({ full_name: '', employee_id: '', email: '', password: '', confirm_password: '', department: '', phone: '' });
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
                    newStatus === 'approved' ? 'Appointment approved'
                    : newStatus === 'rejected' ? 'Appointment rejected'
                    : 'Appointment marked complete',
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
            { key: 'heart_rate',      label: 'Heart Rate',       icon: <FavoriteBorderOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle', color: 'error.main' }}/>,  unit: 'bpm',  value: v.heart_rate,       type: 'heart_rate' },
            { key: 'blood_pressure',  label: 'Blood Pressure',   icon: <WaterDropOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle', color: 'error.main' }}/>,  unit: 'mmHg', value: v.blood_pressure,    type: 'blood_pressure' },
            { key: 'temperature',     label: 'Temperature',      icon: <DeviceThermostatOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle', color: 'warning.main' }}/>, unit: '°C',   value: v.temperature,       type: 'temperature' },
            { key: 'spo2',            label: 'SpO₂ / Lungs',     icon: <AirOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle', color: 'info.main' }}/>,  unit: '%',    value: v.oxygen_saturation || v.spo2, type: 'spo2' },
            { key: 'respiratory_rate',label: 'Respiratory Rate', icon: <AutoFixHighOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle', color: 'info.main' }}/>,  unit: 'rpm',  value: v.respiratory_rate,  type: 'respiratory_rate' },
        ];
        // Sort: abnormal first
        return items.sort((a, b) => {
            const aAbn = isVitalAbnormal(a.type, a.value) ? 0 : 1;
            const bAbn = isVitalAbnormal(b.type, b.value) ? 0 : 1;
            return aAbn - bAbn;
        });
    };

    // Helper for Timeline
    const renderTimeline = (handoffList) => (
        <Stack spacing={4} sx={{ position: 'relative', py: 4 }}>
            {/* Vertical Line */}
            <Box sx={{ position: 'absolute', left: { xs: 24, md: '50%' }, top: 0, bottom: 0, width: 2, bgcolor: 'divider', transform: 'translateX(-50%)' }} />
            
            {handoffList.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 4 }}>
                    <AssignmentOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                    <Typography color="text.secondary">No observations recorded for this patient.</Typography>
                </Paper>
            ) : (
                handoffList.map((h, idx) => {
                    const matchedPatient = patients.find(p => p.patient_id === h.patient_id);
                    const getValidName = (...candidates) => {
                         return candidates.find(c => c && c !== 'Not mentioned' && c !== 'Unknown' && c.trim() !== '') || h.patient_id;
                    };
                    const patientName = getValidName(h.patient_name, matchedPatient?.patient_name, h.structured_report?.patient_name);
                    const isLeft = idx % 2 === 0;

                    return (
                        <Box key={h.handoff_id || idx} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: isLeft ? 'flex-start' : 'flex-end' }, position: 'relative', width: '100%' }}>
                            {/* Dot */}
                            <Box 
                                sx={{ 
                                    position: 'absolute', 
                                    left: { xs: 24, md: '50%' }, 
                                    top: 24, 
                                    width: 12, 
                                    height: 12, 
                                    borderRadius: '50%', 
                                    bgcolor: 'primary.main', 
                                    border: 4, 
                                    borderColor: 'background.default',
                                    transform: 'translateX(-50%)',
                                    zIndex: 2
                                }} 
                            />
                            
                            <Card 
                                variant="outlined" 
                                onClick={() => setSelectedHandoff(h)}
                                sx={{ 
                                    width: { xs: 'calc(100% - 56px)', md: '45%' }, 
                                    ml: { xs: '56px', md: 0 },
                                    cursor: 'pointer',
                                    transition: '0.2s',
                                    borderRadius: 3,
                                    '&:hover': { boxShadow: 4, transform: 'translateY(-2px)', borderColor: 'primary.main' }
                                }}
                            >
                                <CardContent sx={{ p: 2.5 }}>
                                    <Stack spacing={2}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', lineHeight: 1.2 }}>{patientName}</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>Nurse: {h.nurse_name} • {h.shift || 'Shift'}</Typography>
                                            </Box>
                                            <Chip label={formatDate(h.timestamp)} size="small" variant="soft" />
                                        </Box>

                                        {h.structured_report?.vitals && (
                                            <Stack direction="row" spacing={1} sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 2 }}>
                                                {typeof h.structured_report.vitals !== 'string' && (
                                                    <>
                                                        <Typography variant="caption" sx={{ fontWeight: 700 }}><FavoriteBorderOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "bottom", color: "error.main" }} /> {renderVitalValue(h.structured_report.vitals.heart_rate)}</Typography>
                                                        <Typography variant="caption" sx={{ fontWeight: 700 }}><WaterDropOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "bottom", color: "error.main" }} /> {renderVitalValue(h.structured_report.vitals.blood_pressure)}</Typography>
                                                        <Typography variant="caption" sx={{ fontWeight: 700 }}><DeviceThermostatOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "bottom", color: "warning.main" }} /> {renderVitalValue(h.structured_report.vitals.temperature)}</Typography>
                                                    </>
                                                )}
                                            </Stack>
                                        )}

                                        <Box sx={{ bgcolor: 'background.default', p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                                            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                                {h.structured_report?.observation || h.structured_report?.Observation || h.transcript || "No notes."}
                                            </Typography>
                                            {(h.structured_report?.recommendation || h.structured_report?.Recommendation) && (
                                                <Typography variant="caption" sx={{ mt: 1, display: 'block', fontWeight: 600, color: 'warning.main' }}>
                                                    Rec: {h.structured_report?.recommendation || h.structured_report?.Recommendation}
                                                </Typography>
                                            )}
                                        </Box>

                                        <Typography variant="caption" sx={{ textAlign: 'right', fontWeight: 700, color: 'primary.main', display: 'block' }}>
                                            View Full Report 
                                        </Typography>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Box>
                    );
                })
            )}
        </Stack>
    );


    // Notification popover anchor
    const [notifAnchor, setNotifAnchor] = useState(null);
    const [profileAnchor, setProfileAnchor] = useState(null);
    const [searchAnchor, setSearchAnchor] = useState(null);

    const drawerWidth = sidebarCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

    // Sidebar nav sections
    const navSections = [
        {
            title: 'Overview',
            items: [
                { key: 'dashboard', icon: <DashboardOutlinedIcon />, label: 'Dashboard' },
                { key: 'patients', icon: <PeopleOutlineIcon />, label: 'Patients' },
                { key: 'tasks', icon: <AssignmentOutlinedIcon />, label: 'Tasks' },
                { key: 'appointments', icon: <CalendarTodayOutlinedIcon />, label: 'Schedule' },
            ]
        },
        {
            title: 'Clinical',
            items: [
                { key: 'care-plans', icon: <LocalHospitalOutlinedIcon />, label: 'Care Plans' },
                { key: 'handoffs', icon: <SwapHorizIcon />, label: 'Handoffs' },
                { key: 'nurses', icon: <GroupsOutlinedIcon />, label: 'Manage Nurses' },
                { key: 'medication-history', icon: <MedicationOutlinedIcon />, label: 'Medications' },
            ]
        },
        {
            title: 'Scheduling',
            items: [
                { key: 'appointment-requests', icon: <EventNoteOutlinedIcon />, label: 'Requests', badge: pendingAppointments },
                { key: '_schedule_mgr', icon: <SettingsOutlinedIcon />, label: 'Manage Slots', onClick: () => setShowScheduleManager(true) },
                { key: '_schedule_med', icon: <MedicationOutlinedIcon />, label: 'Schedule Meds', onClick: () => { setShowScheduledMed(true); loadUnassignedTasks(); } },
            ]
        },
        {
            title: 'Communication',
            items: [
                { key: 'inventory', icon: <InventoryOutlinedIcon />, label: 'Inventory' },
                { key: 'vendor-chat', icon: <ForumOutlinedIcon />, label: 'Vendor Chat' },
                { key: 'vendor-requests', icon: <MailOutlineIcon />, label: 'Vendor Requests', badge: vendorPendingCount, action: () => loadVendorRequestCount() },
                { key: 'doctor-chat', icon: <MedicalServicesOutlinedIcon />, label: 'Doctor Chat' },
            ]
        },
        {
            title: 'Analytics',
            items: [
                { key: 'nurse-assignments', icon: <BarChartOutlinedIcon />, label: 'Nurse Stats', action: () => loadNurseAssignments() },
                { key: 'all-nurses', icon: <PeopleOutlineIcon />, label: 'All Nurses', action: () => loadNurseAssignments() },
            ]
        }
    ];

    // KPI card config
    const kpiCards = [
        { key: 'patients', label: 'Active Patients', color: '#1890ff', icon: <PeopleOutlineIcon />, nav: 'patients' },
        { key: 'pending_tasks', label: 'Pending Tasks', color: '#faad14', icon: <AssignmentOutlinedIcon />, nav: 'tasks' },
        { key: 'handoffs_today', label: 'Handoffs Today', color: '#722ed1', icon: <SwapHorizIcon />, nav: 'handoffs' },
        { key: 'appointments', label: 'Appointments', color: '#13c2c2', icon: <CalendarTodayOutlinedIcon />, nav: 'appointments' },
    ];

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
            {/* ======================== SIDEBAR ======================== */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    transition: 'width 0.3s',
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        transition: 'width 0.3s',
                        overflowX: 'hidden',
                        bgcolor:'background.paper'
                    }
                }}
            >
                {/* Logo / Brand */}
                <Box sx={{ 
                    px: sidebarCollapsed ? 1 : 2, 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: 1.5, 
                    borderBottom: 1, 
                    borderColor: 'divider',
                    height: 64, // Explicitly match header height
                    minHeight: 64,
                    boxSizing: 'border-box'
                }}>
                    {!sidebarCollapsed && (
                        <>
                            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.lighter', color: 'primary.main', flexShrink: 0 }}>
                                <LocalHospitalOutlinedIcon fontSize="small" />
                            </Avatar>
                            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                MedCore AI 🩺
                            </Typography>
                        </>
                    )}
                    <IconButton 
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
                        size="small" 
                        sx={{ 
                            ml: sidebarCollapsed ? 0 : 'auto', 
                            color: 'text.secondary',
                            p: 1 // make touch area larger
                        }}
                    >
                        <MenuOpenIcon />
                    </IconButton>
                </Box>

                {/* Nav Sections */}
                <Box sx={{ flex: 1, overflowY: 'auto', py: 1, px: 1 }}>
                    {navSections.map((section) => (
                        <Box key={section.title} sx={{ mb: 1 }}>
                            {!sidebarCollapsed && (
                                <Typography variant="caption" sx={{ px: 1.5, pt: 2, pb: 0.5, display: 'block', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, fontSize: '0.65rem' }}>
                                    {section.title}
                                </Typography>
                            )}
                            <List disablePadding>
                                {section.items.map((item) => (
                                    <Tooltip key={item.key} title={sidebarCollapsed ? item.label : ''} placement="right">
                                        <ListItemButton
                                            selected={view === item.key}
                                            onClick={() => { item.onClick ? item.onClick() : setView(item.key); if (item.action) item.action(); }}
                                            sx={{
                                                borderRadius: 1.5,
                                                mb: 0.3,
                                                minHeight: 40,
                                                px: sidebarCollapsed ? 1.5 : 1.5,
                                                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                                            }}
                                        >
                                            <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 36, justifyContent: 'center', color: view === item.key ? 'primary.main' : 'text.secondary' }}>
                                                {item.icon}
                                            </ListItemIcon>
                                            {!sidebarCollapsed && (
                                                <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2', fontWeight: view === item.key ? 600 : 400 }} />
                                            )}
                                            {!sidebarCollapsed && item.badge > 0 && (
                                                <Chip label={item.badge} size="small" color="error" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                                            )}
                                        </ListItemButton>
                                    </Tooltip>
                                ))}
                            </List>
                        </Box>
                    ))}
                </Box>

                {/* Logout */}
                <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
                    <ListItemButton onClick={handleLogout} sx={{ borderRadius: 1.5, color: 'error.main' }}>
                        <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 36, justifyContent: 'center', color: 'error.main' }}>
                            <LogoutIcon fontSize="small" />
                        </ListItemIcon>
                        {!sidebarCollapsed && <ListItemText primary="Logout" primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} />}
                    </ListItemButton>
                </Box>
            </Drawer>

            {/* ======================== MAIN AREA ======================== */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* ── TOP BAR ── */}
                <AppBar position="static" color="inherit" sx={{ zIndex: 40, boxShadow: 'none', borderBottom: 1, borderColor: 'divider' }}>
                    <Toolbar sx={{ gap: 2, minHeight: 64, height: 64, px: { xs: 2, sm: 3 } }}>
                        {/* Global Search */}
                        <Box sx={{ position: 'relative', flex: 1, maxWidth: 420 }}>
                            <OutlinedInput
                                size="small"
                                fullWidth
                                placeholder="Search patients, tasks..."
                                value={searchQuery}
                                onChange={e => handleSearch(e.target.value)}
                                onFocus={() => searchResults.patients.length + searchResults.tasks.length > 0 && setSearchAnchor(document.activeElement)}
                                onBlur={() => setTimeout(() => setSearchAnchor(null), 200)}
                                startAdornment={<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>}
                                sx={{ bgcolor: 'action.hover', '& fieldset': { borderColor: 'divider' } }}
                            />
                            {/* Search Results Dropdown */}
                            {showSearchResults && (searchResults.patients.length > 0 || searchResults.tasks.length > 0) && (
                                <Paper sx={{ position: 'absolute', top: '100%', left: 0, right: 0, mt: 0.5, zIndex: 50, maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'divider' }}>
                                    {searchResults.patients.length > 0 && (
                                        <>
                                            <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block', bgcolor: 'action.hover', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled', fontWeight: 600 }}>Patients</Typography>
                                            {searchResults.patients.map(p => (
                                                <MenuItem key={p.patient_id} onClick={() => { setSearchQuery(''); setShowSearchResults(false); setSelectedPatient(patients.find(pat => pat.patient_id === p.patient_id) || p); setView('patient-details'); }}>
                                                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.lighter', color: 'primary.main', fontSize: '0.75rem', fontWeight: 700, mr: 1.5 }}>{(p.patient_name || '?')[0]}</Avatar>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={500}>{p.patient_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{p.room_number ? `Room ${p.room_number}` : p.patient_id} • {p.diagnosis || ''}</Typography>
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </>
                                    )}
                                    {searchResults.tasks.length > 0 && (
                                        <>
                                            <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block', bgcolor: 'action.hover', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled', fontWeight: 600, borderTop: 1, borderColor: 'divider' }}>Tasks</Typography>
                                            {searchResults.tasks.map((t, i) => (
                                                <MenuItem key={t.task_id || i} onClick={() => { setSearchQuery(''); setShowSearchResults(false); setView('tasks'); }}>
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', mr: 1.5, flexShrink: 0, bgcolor: t.status === 'completed' ? 'success.main' : t.status === 'pending' ? 'warning.main' : 'text.disabled' }} />
                                                    <Box>
                                                        <Typography variant="body2">{t.description || t.task_type || 'Task'}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{t.patient_name || ''} • {t.status}</Typography>
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </>
                                    )}
                                </Paper>
                            )}
                        </Box>

                        <Box sx={{ flex: 1 }} />
                        
                        <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mr: 2, display: { xs: 'none', md: 'block' } }}>
                            {getTimeGreeting()}, Dr. {user?.full_name?.split(' ')[0] || ''}
                        </Typography>

                        {/* Refresh */}
                        <Tooltip title="Refresh">
                            <IconButton onClick={() => { loadData(); loadDashboardStats(); }} size="small" sx={{ color: 'text.secondary' }}>
                                <RefreshIcon fontSize="small" sx={{ animation: loading ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                            </IconButton>
                        </Tooltip>

                        {/* Notifications */}
                        <Tooltip title="Notifications">
                            <IconButton onClick={(e) => { setNotifAnchor(notifAnchor ? null : e.currentTarget); setProfileAnchor(null); }} size="small" sx={{ color: 'text.secondary' }}>
                                <Badge variant="dot" invisible={notifications.length === 0} color="error">
                                    <NotificationsNoneIcon fontSize="small" />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                        <Popover
                            open={Boolean(notifAnchor)}
                            anchorEl={notifAnchor}
                            onClose={() => setNotifAnchor(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            slotProps={{ paper: { sx: { width: 320, maxHeight: 400, mt: 1 } } }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="subtitle1">Notifications</Typography>
                                {notifications.length > 0 && <Button size="small" color="error" onClick={() => setNotifications([])}>Clear</Button>}
                            </Box>
                            {notifications.length === 0 ? (
                                <Typography variant="body2" sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>No notifications</Typography>
                            ) : (
                                notifications.map(n => (
                                    <Box key={n.id} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                                        <Typography variant="body2">{n.message}</Typography>
                                        <Typography variant="caption" color="text.disabled">{n.time}</Typography>
                                    </Box>
                                ))
                            )}
                        </Popover>

                        {/* Messages */}
                        <Tooltip title="Messages">
                            <IconButton onClick={() => setView('doctor-chat')} size="small" sx={{ color: 'text.secondary' }}>
                                <ChatBubbleOutlineIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>

                        <ThemeToggle />

                        {/* Profile */}
                        <Tooltip title="Profile">
                            <IconButton onClick={(e) => { setProfileAnchor(profileAnchor ? null : e.currentTarget); setNotifAnchor(null); }} size="small" sx={{ p: 0.25 }}>
                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem', fontWeight: 700 }}>
                                    {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'D'}
                                </Avatar>
                            </IconButton>
                        </Tooltip>
                        <Menu
                            anchorEl={profileAnchor}
                            open={Boolean(profileAnchor)}
                            onClose={() => setProfileAnchor(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            slotProps={{ paper: { sx: { width: 200, mt: 1 } } }}
                        >
                            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="subtitle2" fontWeight={700}>Dr. {user?.full_name || ''}</Typography>
                                <Typography variant="caption" color="text.secondary">{user?.email || ''}</Typography>
                            </Box>
                            <MenuItem onClick={() => { setShowProfile(true); setProfileAnchor(null); }}>
                                <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Profile</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={() => { setShowScheduleManager(true); setProfileAnchor(null); }}>
                                <ListItemIcon><CalendarTodayOutlinedIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>My Schedule</ListItemText>
                            </MenuItem>
                            <Divider />
                            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
                                <ListItemText>Logout</ListItemText>
                            </MenuItem>
                        </Menu>
                    </Toolbar>
                </AppBar>

                {/* ── CONTENT ── */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 3, pb: 10 }}>

                    {view === 'dashboard' && (() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const todayAppts = appointments.filter(a => a.date === todayStr && a.status !== 'cancelled' && a.status !== 'rejected').sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

                        return (
                            <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                                {/* Welcome */}
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="h4">Dashboard Overview</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Here's what's happening today across your practice.</Typography>
                                </Box>

                                {/* KPI Cards */}
                                <Grid container spacing={3} sx={{ mb: 3 }}>
                                    {kpiCards.map(card => {
                                        const stat = dashboardStats?.[card.key];
                                        const current = stat?.current ?? (card.key === 'patients' ? stats.patients : card.key === 'pending_tasks' ? stats.tasks : card.key === 'handoffs_today' ? stats.handoffs : appointments.length);
                                        const trend = stat?.trend_percent ?? 0;
                                        const historyData = (stat?.history || []).map(d => d.count);

                                        return (
                                            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={card.key}>
                                                <Card sx={{ cursor: 'pointer', transition: '0.2s', '&:hover': { boxShadow: 6 } }} onClick={() => setView(card.nav)}>
                                                    <CardContent>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                                            <Box>
                                                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{card.label}</Typography>
                                                                <Typography variant="h3" sx={{ mt: 0.5 }}>{current}</Typography>
                                                            </Box>
                                                            <Avatar sx={{ width: 40, height: 40, bgcolor: `${card.color}15`, color: card.color }}>
                                                                {card.icon}
                                                            </Avatar>
                                                        </Stack>
                                                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1 }}>
                                                            {trend > 0 ? <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} /> : trend < 0 ? <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} /> : null}
                                                            <Typography variant="caption" sx={{ color: trend > 0 ? 'success.main' : trend < 0 ? 'error.main' : 'text.disabled', fontWeight: 600 }}>
                                                                {Math.abs(trend)}%
                                                            </Typography>
                                                            <Typography variant="caption" color="text.disabled">vs yesterday</Typography>
                                                        </Stack>
                                                        {historyData.length > 0 && (
                                                            <Box sx={{ mt: 1.5, height: 40 }}>
                                                                <SparkLineChart data={historyData} height={40} curve="natural" colors={[card.color]} area showHighlight showTooltip />
                                                            </Box>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        );
                                    })}
                                </Grid>

                                {/* Bottom Grid: Handoffs Table + Today's Appointments */}
                                <Grid container spacing={3}>
                                    {/* Handoffs Table */}
                                    <Grid size={{ xs: 12, lg: 8 }}>
                                        <Card>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
                                                <Typography variant="subtitle1">Recent Handoffs</Typography>
                                                <Button size="small" onClick={() => setView('handoffs')}>View All </Button>
                                            </Box>
                                            <TableContainer>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Status</TableCell>
                                                            <TableCell>Patient</TableCell>
                                                            <TableCell>Nurse</TableCell>
                                                            <TableCell>Shift</TableCell>
                                                            <TableCell>Time</TableCell>
                                                            <TableCell>Action</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {handoffs.slice(0, 8).map(h => (
                                                            <TableRow key={h._id || h.handoff_id || `${h.patient_id}-${h.timestamp}`} hover>
                                                                <TableCell>
                                                                    <Chip
                                                                        label={h.status || 'pending'}
                                                                        size="small"
                                                                        color={h.status === 'completed' || h.status === 'approved' ? 'success' : 'warning'}
                                                                        variant="outlined"
                                                                        sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.7rem' }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell><Typography variant="body2" fontWeight={500}>{h.patient_name || h.patient_id}</Typography></TableCell>
                                                                <TableCell><Typography variant="body2" color="text.secondary">{h.nurse_name || '—'}</Typography></TableCell>
                                                                <TableCell><Chip label={h.shift || '—'} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.7rem' }} /></TableCell>
                                                                <TableCell><Typography variant="caption" color="text.secondary">{h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Typography></TableCell>
                                                                <TableCell>
                                                                    <Button size="small" startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 14 }} />} onClick={() => setSelectedHandoff(h)}>View</Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {handoffs.length === 0 && (
                                                            <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.disabled' }}>No handoffs recorded yet</TableCell></TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </Card>
                                    </Grid>

                                    {/* Today's Appointments */}
                                    <Grid size={{ xs: 12, lg: 4 }}>
                                        <Card sx={{ height: '100%' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
                                                <Typography variant="subtitle1">Today's Schedule</Typography>
                                                <Button size="small" onClick={() => setView('appointments')}>View All </Button>
                                            </Box>
                                            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                                                {todayAppts.length === 0 ? (
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                                                        <CalendarTodayOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                                                        <Typography variant="body2" color="text.disabled">No appointments today</Typography>
                                                    </Box>
                                                ) : (
                                                    <List disablePadding>
                                                        {todayAppts.map(apt => (
                                                            <React.Fragment key={apt.appointment_id}>
                                                                <ListItemButton sx={{ px: 2.5, py: 1.5 }}>
                                                                    <Typography variant="subtitle2" sx={{ width: 60, flexShrink: 0, color: 'primary.main', fontFamily: 'monospace' }}>
                                                                        {formatTimeAmPm(apt.start_time)}
                                                                    </Typography>
                                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                                        <Typography variant="body2" fontWeight={500} noWrap>{apt.patient_name || 'Patient'}</Typography>
                                                                        <Typography variant="caption" color="text.secondary" noWrap>{apt.service_name || apt.notes || 'General'}</Typography>
                                                                    </Box>
                                                                    <Chip
                                                                        label={apt.status}
                                                                        size="small"
                                                                        color={apt.status === 'confirmed' || apt.status === 'approved' ? 'success' : apt.status === 'completed' ? 'default' : 'warning'}
                                                                        variant="outlined"
                                                                        sx={{ textTransform: 'capitalize', fontSize: '0.65rem' }}
                                                                    />
                                                                </ListItemButton>
                                                                <Divider />
                                                            </React.Fragment>
                                                        ))}
                                                    </List>
                                                )}
                                            </Box>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        );
                    })()}

                    {view === 'appointments' && (
                        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Appointment Calendar" 
                                subtitle="View and manage your monthly schedule"
                                actionLabel="Manage Slots"
                                onAction={() => setShowScheduleManager(true)}
                                actionIcon={<SettingsOutlinedIcon />}
                            />
                            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', mt: 3 }}>
                                <AppointmentCalendar
                                    appointments={appointments}
                                    handleAppointmentAction={handleAppointmentAction}
                                    loadAppointments={loadAppointments}
                                    onManageSchedule={() => setShowScheduleManager(true)}
                                />
                            </Paper>
                        </Box>
                    )}

                    {view === 'appointment-requests' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Appointment Requests" 
                                subtitle={`${appointments.length} total appointments loaded`}
                                actionLabel="Manage My Schedule"
                                onAction={() => setShowScheduleManager(true)}
                                actionIcon={<CalendarTodayOutlinedIcon />}
                            />

                            {/* Filter Tabs */}
                            <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pb: 1 }}>
                                {[
                                    { key: 'pending', label: 'Pending', icon: <HourglassEmptyOutlinedIcon fontSize="small" />, statuses: ['pending', 'pending_doctor_approval'] },
                                    { key: 'confirmed', label: 'Confirmed', icon: <CheckCircleOutlinedIcon fontSize="small" />, statuses: ['approved', 'confirmed'] },
                                    { key: 'history', label: 'History', icon: <AssignmentOutlinedIcon fontSize="small" />, statuses: ['completed', 'rejected', 'cancelled'] }
                                ].map(({ key, label, icon, statuses }) => {
                                    const count = appointments.filter(a => statuses.includes(a.status)).length;
                                    return (
                                        <Button
                                            key={key}
                                            variant={apptTab === key ? 'contained' : 'outlined'}
                                            onClick={() => setApptTab(key)}
                                            startIcon={<span>{icon}</span>}
                                            sx={{ borderRadius: 2, px: 2, whiteSpace: 'nowrap' }}
                                        >
                                            {label} {count > 0 && <Chip label={count} size="small" sx={{ ml: 1, height: 20, bgcolor: apptTab === key ? 'white' : 'action.selected', color: apptTab === key ? 'primary.main' : 'text.primary', fontWeight: 700 }} />}
                                        </Button>
                                    );
                                })}
                                <IconButton onClick={() => loadAppointments()} size="small" sx={{ border: 1, borderColor: 'divider' }}>
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </Stack>

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
                                        <Box sx={{ py: 10, textAlign: 'center', opacity: 0.5 }}>
                                            <Typography variant="h1" sx={{ mb: 2 }}>
                                                {apptTab === 'pending' ? <HourglassEmptyOutlinedIcon /> : apptTab === 'confirmed' ? <CheckCircleOutlinedIcon /> : <AssignmentOutlinedIcon />}
                                            </Typography>
                                            <Typography variant="h6">No {apptTab} requests found</Typography>
                                            <Typography variant="body2">New booking requests will appear here</Typography>
                                        </Box>
                                    );
                                }
                                return (
                                    <Stack spacing={2}>
                                        {filtered.map(apt => (
                                            <Card key={apt.appointment_id}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 2 }}>
                                                        <Box sx={{ flex: 1 }}>
                                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                                                                <StatusChip status={apt.status} />
                                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>#{apt.appointment_id}</Typography>
                                                                {apt.shift && <Chip label={apt.shift} size="small" variant="soft" color="primary" sx={{ height: 22, fontSize: '0.65rem' }} />}
                                                                {apt.whatsapp_number && <Chip label="WhatsApp" size="small" variant="soft" color="success" sx={{ height: 22, fontSize: '0.65rem' }} />}
                                                            </Stack>
                                                            
                                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{apt.patient_name || 'Patient'}</Typography>
                                                            
                                                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                                                <Grid item>
                                                                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                        <CalendarTodayOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} /> {apt.date}
                                                                    </Typography>
                                                                </Grid>
                                                                <Grid item>
                                                                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                         {apt.start_time} – {apt.end_time}
                                                                    </Typography>
                                                                </Grid>
                                                                {apt.service_name && (
                                                                    <Grid item><Typography variant="body2" color="text.secondary"><LocalHospitalOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} /> {apt.service_name}</Typography></Grid>
                                                                )}
                                                            </Grid>

                                                            {apt.notes && (
                                                                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                                                                    <Typography variant="body2" color="text.secondary"><EditNoteOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} /> {apt.notes}</Typography>
                                                                </Box>
                                                            )}
                                                        </Box>

                                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                                            {(apt.status === 'pending' || apt.status === 'pending_doctor_approval') && (
                                                                <>
                                                                    <Button variant="contained" size="small" onClick={() => handleAppointmentAction(apt.appointment_id, 'approve')}>Approve</Button>
                                                                    <Button variant="outlined" color="error" size="small" onClick={() => {
                                                                        const reason = window.prompt('Rejection reason:');
                                                                        handleAppointmentAction(apt.appointment_id, 'reject', reason || '');
                                                                    }}>Reject</Button>
                                                                </>
                                                            )}
                                                            {(apt.status === 'approved' || apt.status === 'confirmed') && (
                                                                <Button variant="contained" color="success" size="small" onClick={() => handleAppointmentAction(apt.appointment_id, 'complete')}>Mark Complete</Button>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                    {apt.rejection_reason && (
                                                        <Typography variant="caption" color="error" sx={{ mt: 2, display: 'block', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                                            <CancelOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle", color: "error.main" }} /> Reason: {apt.rejection_reason}
                                                        </Typography>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </Stack>
                                );
                            })()}
                        </Stack>
                    )}

                    {view === 'vendor-chat' && (
                        <Box sx={{ maxWidth: 1200, mx: 'auto', height: 'calc(100vh - 160px)' }}>
                            <ChatInterface showNotify={showNotify} filterRole="vendor" userRole="doctor" />
                        </Box>
                    )}

                    {view === 'vendor-requests' && (
                        <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
                            <VendorRequests showNotify={showNotify} />
                        </Box>
                    )}

                    {view === 'doctor-chat' && (
                        <Box sx={{ maxWidth: 1200, mx: 'auto', height: 'calc(100vh - 160px)' }}>
                            <ChatInterface showNotify={showNotify} filterRole="doctor" userRole="doctor" />
                        </Box>
                    )}

                    {view === 'patients' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Patient Vitals & Plans" 
                                subtitle="Monitor patient health status and active care routines"
                                actionLabel="Create Care Plan"
                                onAction={() => setShowCreatePlan(true)}
                            />
                            <Grid container spacing={3}>
                                {patients.map(p => (
                                    <Grid item key={p.patient_id}>
                                        <Card 
                                            onClick={() => { setSelectedPatient(p); setView('patient-details'); }} 
                                            sx={{ 
                                                cursor: 'pointer', 
                                                width: 252.55,
                                                height: 222.81,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                transition: '0.2s',
                                                '&:hover': { borderColor: 'primary.main', boxShadow: 4, transform: 'translateY(-4px)' }
                                            }}
                                            variant="outlined"
                                        >
                                            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, pb: '16px !important' }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                    <Box>
                                                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{p.patient_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">ID: {p.patient_id}</Typography>
                                                    </Box>
                                                    <Chip 
                                                        label={p.room_number ? `Room ${p.room_number}` : 'No Room'} 
                                                        size="small" 
                                                        color={p.room_number ? 'primary' : 'error'} 
                                                        variant="soft" 
                                                        sx={{ fontWeight: 600 }}
                                                    />
                                                </Box>

                                                <Box sx={{ mt: 2 }}>
                                                    <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 900, fontSize: '0.65rem' }}>Latest Vitals</Typography>
                                                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                                                        <Grid item xs={4}>
                                                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: 'action.hover' }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>HR</Typography>
                                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: getVitalColor('heart_rate', p.latest_vitals?.heart_rate) }}>
                                                                    {renderVitalValue(p.latest_vitals?.heart_rate)}
                                                                </Typography>
                                                            </Paper>
                                                        </Grid>
                                                        <Grid item xs={4}>
                                                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: 'action.hover' }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>BP</Typography>
                                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: getVitalColor('blood_pressure', p.latest_vitals?.blood_pressure) }}>
                                                                    {renderVitalValue(p.latest_vitals?.blood_pressure)}
                                                                </Typography>
                                                            </Paper>
                                                        </Grid>
                                                        <Grid item xs={4}>
                                                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: 'action.hover' }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>TEMP</Typography>
                                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: getVitalColor('temperature', p.latest_vitals?.temperature) }}>
                                                                    {renderVitalValue(p.latest_vitals?.temperature)}
                                                                </Typography>
                                                            </Paper>
                                                        </Grid>
                                                    </Grid>
                                                </Box>
                                                <Box sx={{ mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
                                                    <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>CLICK FOR DETAILED REPORT </Typography>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Stack>
                    )}

                    {view === 'care-plans' && (
                        <Grid container spacing={3} sx={{ height: 'calc(100vh - 160px)' }}>
                            {/* Left: Patient List */}
                            <Grid item xs={12} md={4} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                        height: '100%', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        borderRadius: 3,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <Box sx={{ p: 2.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Select Patient</Typography>
                                    </Box>
                                    <List sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                                        {patients.map(p => (
                                            <ListItemButton 
                                                key={p.patient_id} 
                                                selected={selectedPatient?.patient_id === p.patient_id}
                                                onClick={() => { setSelectedPatient(p); fetchCarePlan(p.patient_id); }}
                                                sx={{ borderRadius: 2, mb: 0.5 }}
                                            >
                                                <ListItemText 
                                                    primary={p.patient_name} 
                                                    secondary={p.patient_id}
                                                    primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                                                    secondaryTypographyProps={{ variant: 'caption' }}
                                                />
                                                {selectedPatient?.patient_id === p.patient_id && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />}
                                            </ListItemButton>
                                        ))}
                                    </List>
                                </Paper>
                            </Grid>

                            {/* Right: Care Plan Details */}
                            <Grid item xs={12} md={8} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                        height: '100%', 
                                        p: 4, 
                                        borderRadius: 3, 
                                        overflow: 'auto',
                                        bgcolor: 'background.paper'
                                    }}
                                >
                                    {selectedPatient ? (
                                        activeCarePlan ? (
                                            <Stack spacing={4}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider', pb: 3 }}>
                                                    <Box>
                                                        <Typography variant="h4" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                            <LocalHospitalOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} /> Care Plan: {selectedPatient.patient_name}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Plan ID: {activeCarePlan.plan_id} • Updated: {formatDate(activeCarePlan.updated_at)}</Typography>
                                                    </Box>
                                                    <Chip label="Active" color="primary" variant="soft" sx={{ fontWeight: 700, px: 2 }} />
                                                </Box>

                                                <Box>
                                                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                        <MedicationOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} /> Medications
                                                    </Typography>
                                                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                                        <Table size="small">
                                                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 700 }}>Medication</TableCell>
                                                                    <TableCell sx={{ fontWeight: 700 }}>Dose</TableCell>
                                                                    <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                                                                    <TableCell sx={{ fontWeight: 700 }}>Frequency</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {activeCarePlan.medications?.map((m, i) => (
                                                                    <TableRow key={i}>
                                                                        <TableCell sx={{ fontWeight: 600 }}>{m.name}</TableCell>
                                                                        <TableCell sx={{ color: 'text.secondary' }}>{m.dose || '-'}</TableCell>
                                                                        <TableCell sx={{ color: 'primary.main', fontWeight: 700, fontFamily: 'monospace' }}>{m.time || '-'}</TableCell>
                                                                        <TableCell sx={{ color: 'text.secondary' }}>{m.frequency}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                </Box>

                                                <Box>
                                                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                        <RestaurantOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} /> Meal Plan
                                                    </Typography>
                                                    <Grid container spacing={2}>
                                                        {[
                                                            { label: 'Breakfast', time: activeCarePlan.meals?.morning_time, val: activeCarePlan.meals?.morning },
                                                            { label: 'Lunch', time: activeCarePlan.meals?.afternoon_time, val: activeCarePlan.meals?.afternoon },
                                                            { label: 'Dinner', time: activeCarePlan.meals?.night_time, val: activeCarePlan.meals?.night }
                                                        ].map((meal, i) => (
                                                            <Grid item xs={12} md={4} key={i}>
                                                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase' }}>{meal.label} • {meal.time}</Typography>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{meal.val || 'No selection'}</Typography>
                                                                </Paper>
                                                            </Grid>
                                                        ))}
                                                    </Grid>
                                                </Box>

                                                {activeCarePlan.special_instructions && (
                                                    <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: 'warning.soft', border: 1, borderColor: 'warning.border' }}>
                                                        <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 900, display: 'block', mb: 1, textTransform: 'uppercase' }}>Special Instructions</Typography>
                                                        <Typography variant="body2">{activeCarePlan.special_instructions}</Typography>
                                                    </Box>
                                                )}

                                                <Box sx={{ pt: 3, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <Button
                                                        variant="contained"
                                                        onClick={() => { setShowCreatePlan(true); setPlanForm(prev => ({ ...prev, patient_id: selectedPatient.patient_id })); }}
                                                        startIcon={<AddOutlinedIcon fontSize="small" />}
                                                        sx={{ borderRadius: 2, px: 3, py: 1.2, fontWeight: 700, boxShadow: 4 }}
                                                    >
                                                        Create New Care Plan
                                                    </Button>
                                                </Box>
                                            </Stack>
                                        ) : (
                                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                                <AssignmentOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                                                <Typography variant="h5" sx={{ fontWeight: 700 }}>No Active Care Plan</Typography>
                                                <Typography variant="body2" sx={{ mb: 3 }}>Create a care plan for this patient to see details here.</Typography>
                                                <Button 
                                                    variant="contained" 
                                                    onClick={() => { setShowCreatePlan(true); setPlanForm(prev => ({ ...prev, patient_id: selectedPatient.patient_id })); }}
                                                    sx={{ borderRadius: 2 }}
                                                >
                                                    Create Care Plan
                                                </Button>
                                            </Box>
                                        )
                                    ) : (
                                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                            <ArrowBackOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                                            <Typography variant="h5" sx={{ fontWeight: 700 }}>Select a Patient</Typography>
                                            <Typography variant="body2">Choose a patient from the list to view their care plan.</Typography>
                                        </Box>
                                    )}
                                </Paper>
                            </Grid>
                        </Grid>
                    )}

                    {view === 'patient-details' && selectedPatient && (
                        <Stack spacing={3} sx={{ maxWidth: 1000, mx: 'auto' }}>
                            <Button 
                                startIcon={<ArrowBackIcon />} 
                                onClick={() => setView('patients')} 
                                sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
                            >
                                Back to Patients
                            </Button>

                            <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: 3 }}>
                                <Box>
                                    <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary' }}>{selectedPatient.patient_name}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>ID: {selectedPatient.patient_id} • Age: {selectedPatient.age || 'N/A'}</Typography>
                                    <Typography variant="body1" sx={{ mt: 2 }}>Diagnosis: <Box component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>{selectedPatient.diagnosis}</Box></Typography>
                                </Box>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main', bgcolor: 'primary.soft', px: 3, py: 1.5, borderRadius: 3, border: 1, borderColor: 'primary.border' }}>
                                        Room {selectedPatient.room_number || 'N/A'}
                                    </Typography>
                                    <Button 
                                        variant="outlined" 
                                        onClick={() => setShowEditPatient(true)}
                                        startIcon={<EditOutlinedIcon fontSize="small" />}
                                        sx={{ height: 'fit-content', borderRadius: 2 }}
                                    >
                                        Edit
                                    </Button>
                                </Stack>
                            </Paper>
                            
                            <PatientEditModal 
                                isOpen={showEditPatient} 
                                onClose={() => setShowEditPatient(false)} 
                                patient={selectedPatient} 
                                onUpdate={() => {
                                    loadGeneralData();
                                    setView('patients');
                                }} 
                            />

                            <Grid container spacing={2}>
                                {buildSortedVitals(selectedPatient.latest_vitals).map(vital => {
                                    const isAbnormal = isVitalAbnormal(vital.type, vital.value);
                                    return (
                                        <Grid item xs={6} md={2.4} key={vital.key}>
                                            <Paper 
                                                variant="outlined" 
                                                sx={{ 
                                                    p: 2, 
                                                    textAlign: 'center', 
                                                    position: 'relative',
                                                    ...(isAbnormal && {
                                                        bgcolor: 'error.soft',
                                                        borderColor: 'error.main',
                                                        boxShadow: '0 0 10px rgba(239,68,68,0.1)'
                                                    })
                                                }}
                                            >
                                                {isAbnormal && (
                                                    <Typography variant="caption" sx={{ position: 'absolute', top: 6, right: 8, color: 'error.main', fontWeight: 900, fontSize: '0.6rem' }}> ALERT</Typography>
                                                )}
                                                <Typography sx={{ fontSize: '1.5rem', mb: 0.5 }}>{vital.icon}</Typography>
                                                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1, mb: 1 }}>{vital.label}</Typography>
                                                <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 700, color: getVitalColor(vital.type, vital.value) }}>
                                                    {renderVitalValue(vital.value)}
                                                    <Box component="span" sx={{ fontSize: '0.75rem', ml: 0.5, color: 'text.secondary' }}>{vital.unit}</Box>
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                            
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}>
                                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Nurse Observations</Typography>
                                        {selectedPatient.latest_observations?.length > 0 ? (
                                            <List dense>
                                                {selectedPatient.latest_observations.map((obs, i) => (
                                                    <ListItem key={i} sx={{ px: 0 }}>
                                                        <ListItemIcon sx={{ minWidth: 28 }}>•</ListItemIcon>
                                                        <ListItemText primary={obs} primaryTypographyProps={{ variant: 'body2' }} />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        ) : <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No observations recorded.</Typography>}
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}>
                                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Recommendations</Typography>
                                        {selectedPatient.action_items?.length > 0 ? (
                                            <List dense>
                                                {selectedPatient.action_items.map((item, i) => (
                                                    <ListItem key={i} sx={{ px: 0 }}>
                                                        <ListItemIcon sx={{ minWidth: 28, color: 'warning.main' }}></ListItemIcon>
                                                        <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        ) : <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No specific recommendations.</Typography>}
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 4 }}>
                                <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, textAlign: 'center' }}>Recent Handoff History</Typography>
                                {renderTimeline(handoffs.filter(h => h.patient_id === selectedPatient.patient_id))}
                            </Box>
                        </Stack>
                    )}

                    {view === 'tasks' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Pending Tasks & AI Assignment" 
                                actionLabel="Schedule Medication"
                                actionIcon={<MedicationOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} />}
                                onAction={() => { setShowScheduledMed(true); loadUnassignedTasks(); }}
                            />

                            {/* Unassigned Tasks Warning */}
                            {unassignedTasks.length > 0 && (
                                <Alert 
                                    severity="warning" 
                                    variant="outlined"
                                    sx={{ borderRadius: 3, bgcolor: 'warning.lighter' }}
                                    action={
                                        <Button color="warning" size="small" variant="contained" onClick={() => setView('all-nurses')}>
                                            View Nurses
                                        </Button>
                                    }
                                >
                                    <AlertTitle sx={{ fontWeight: 700 }}>{unassignedTasks.length} Task{unassignedTasks.length > 1 ? 's' : ''} Unassigned</AlertTitle>
                                    These tasks have no nurse assigned. Consider adding more nurses for the relevant shifts.
                                    <Box sx={{ mt: 1.5, maxHeight: 150, overflowY: 'auto', p: 1, borderRadius: 1, border: 1, borderColor: 'warning.light' }}>
                                        {unassignedTasks.slice(0, 5).map((t, idx) => (
                                            <Box key={t.task_id || idx} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, px: 1 }}>
                                                <Typography variant="caption" sx={{ fontWeight: 500 }}>{t.description}</Typography>
                                                <Typography variant="caption" color="text.secondary">{t.patient_name || t.patient_id} • {t.shift || 'Any'}</Typography>
                                            </Box>
                                        ))}
                                        {unassignedTasks.length > 5 && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
                                                + {unassignedTasks.length - 5} more
                                            </Typography>
                                        )}
                                    </Box>
                                </Alert>
                            )}

                            <TableContainer component={Paper} variant="outlined">
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Task Description</TableCell>
                                            <TableCell>Patient</TableCell>
                                            <TableCell>Scheduled</TableCell>
                                            <TableCell>Assigned Nurse (AI)</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {tasks.filter(t => t.status !== 'completed').map(t => {
                                            const taskPatient = patients.find(p => p.patient_id === t.patient_id);
                                            return (
                                                <TableRow key={t.task_id || t._id || `${t.patient_id}-${t.scheduled_time}-${t.task_type}`} hover>
                                                    <TableCell sx={{ fontWeight: 500 }}>
                                                        {t.description || <Typography variant="body2" color="text.secondary" fontStyle="italic">No Description</Typography>}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={600}>{taskPatient?.patient_name || t.patient_name || '—'}</Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{t.patient_id}</Typography>
                                                    </TableCell>
                                                    <TableCell sx={{ color: 'text.secondary' }}>
                                                        {formatDate(t.scheduled_time)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box>
                                                            <Typography variant="body2" color="primary" sx={{ fontWeight: 700 }}>
                                                                {t.assigned_nurse_name || 'Unassigned'}
                                                            </Typography>
                                                            {t.ai_score && (
                                                                <Tooltip title={t.assignment_reason || ''}>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', display: 'block' }}>
                                                                        AI Score: {t.ai_score}
                                                                    </Typography>
                                                                </Tooltip>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusChip status={t.status} />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {tasks.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                                    <Typography color="text.secondary">No tasks found. Create a care plan to generate tasks.</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Stack>
                    )}

                    {view === 'handoffs' && (
                        <Stack spacing={4} sx={{ maxWidth: 1000, mx: 'auto' }}>
                            <PageHeader title="Nurse Observations Timeline" />
                            {renderTimeline(handoffs)}
                        </Stack>
                    )}

                    {view === 'nurses' && (
                        <Stack spacing={3} sx={{ maxWidth: 1000, mx: 'auto' }}>
                            <PageHeader 
                                title="Manage Nursing Staff" 
                                actionLabel="Add New Nurse"
                                onAction={() => setShowAddNurse(true)}
                                actionIcon={<span>+</span>}
                            />
                            <TableContainer component={Paper} variant="outlined">
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Name</TableCell>
                                            <TableCell>Employee ID</TableCell>
                                            <TableCell>Department</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {nurses.map(n => (
                                            <TableRow key={n.user_id} hover>
                                                <TableCell sx={{ fontWeight: 600 }}>{n.full_name}</TableCell>
                                                <TableCell sx={{ color: 'text.secondary' }}>{n.employee_id}</TableCell>
                                                <TableCell sx={{ color: 'text.secondary' }}>{n.department || '-'}</TableCell>
                                                <TableCell>
                                                    <Button variant="soft" color="error" size="small" onClick={() => handleDeleteNurse(n.user_id)}>
                                                        Remove
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Stack>
                    )}

                    {/* Nurse Assignments View */}
                    {view === 'nurse-assignments' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Nurse Assignments & Completed Tasks" 
                                subtitle="Overview of nurse activity and shift performance"
                            />
                            {nurseAssignments.length === 0 ? (
                                <Box sx={{ py: 10, textAlign: 'center', opacity: 0.5 }}>
                                    <InboxOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                                    <Typography variant="h6">No nurse assignment data available</Typography>
                                </Box>
                            ) : (
                                <Grid container spacing={3}>
                                    {nurseAssignments.map(nurse => (
                                        <Grid item xs={12} md={6} key={nurse.nurse_id}>
                                            <Card 
                                                onClick={() => loadNurseDetails(nurse.nurse_id)} 
                                                sx={{ 
                                                    cursor: 'pointer', 
                                                    height: '100%',
                                                    transition: '0.2s',
                                                    '&:hover': { borderColor: 'primary.main', boxShadow: 4 }
                                                }}
                                                variant="outlined"
                                            >
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                        <Box>
                                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{nurse.nurse_name}</Typography>
                                                            <Typography variant="caption" color="text.secondary">Current Shift: <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{nurse.current_shift}</Box></Typography>
                                                        </Box>
                                                        <StatusChip status={nurse.status === 'emergency' ? 'emergency' : nurse.status || 'offline'} />
                                                    </Box>
                                                    
                                                    {nurse.shifts?.length > 0 ? (
                                                        <Stack spacing={2}>
                                                            {nurse.shifts.map((shift, idx) => (
                                                                <Box key={idx} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, border: 1, borderColor: 'divider' }}>
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{shift.shift} Shift</Typography>
                                                                        <Typography variant="caption" color="text.secondary">{shift.completed_tasks}/{shift.total_tasks} completed</Typography>
                                                                    </Box>
                                                                    <Stack spacing={0.5}>
                                                                        {shift.patients?.map((patient, pidx) => (
                                                                            <Box key={pidx} sx={{ ml: 1 }}>
                                                                                <Typography variant="body2" sx={{ fontWeight: 500 }}><PersonOutlineOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} /> {patient.patient_name}</Typography>
                                                                                <Box sx={{ ml: 2 }}>
                                                                                    {patient.tasks?.slice(0, 3).map((task, tidx) => (
                                                                                        <Typography key={tidx} variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                            <Box component="span" sx={{ color: task.status === 'completed' ? 'success.main' : 'warning.main', fontWeight: 900 }}>
                                                                                                {task.status === 'completed' ? <CheckCircleOutlinedIcon fontSize="small" color="success" /> : <RadioButtonUncheckedOutlinedIcon fontSize="small" color="disabled" />}
                                                                                            </Box>
                                                                                            {task.description || task.task_type}
                                                                                        </Typography>
                                                                                    ))}
                                                                                    {patient.tasks?.length > 3 && (
                                                                                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', ml: 1 }}>
                                                                                            ...+{patient.tasks.length - 3} more
                                                                                        </Typography>
                                                                                    )}
                                                                                </Box>
                                                                            </Box>
                                                                        ))}
                                                                    </Stack>
                                                                </Box>
                                                            ))}
                                                        </Stack>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No tasks assigned yet</Typography>
                                                    )}
                                                    
                                                    <Box sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Typography variant="caption" color="text.secondary">Total Handoffs: {nurse.total_handoffs}</Typography>
                                                        <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>View details </Typography>
                                                    </Box>
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Stack>
                    )}

                    {/* Medication History View */}
                    {view === 'medication-history' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Patient Medication History" 
                                subtitle="Review and track patient treatments"
                            />
                            
                            <Grid container spacing={3}>
                                {/* Patient Selector */}
                                <Grid item xs={12} md={3}>
                                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, mb: 1.5, display: 'block' }}>Select Patient</Typography>
                                        <List sx={{ maxHeight: 500, overflow: 'auto' }}>
                                            {patients.map(p => (
                                                <ListItemButton 
                                                    key={p.patient_id} 
                                                    selected={selectedMedicationPatient === p.patient_id}
                                                    onClick={() => loadMedicationHistory(p.patient_id)}
                                                    sx={{ borderRadius: 2, mb: 0.5 }}
                                                >
                                                    <ListItemText primary={p.patient_name} primaryTypographyProps={{ variant: 'body2', fontWeight: selectedMedicationPatient === p.patient_id ? 700 : 500 }} />
                                                </ListItemButton>
                                            ))}
                                        </List>
                                    </Paper>
                                </Grid>

                                {/* Medication List */}
                                <Grid item xs={12} md={9}>
                                    {selectedMedicationPatient ? (
                                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, minHeight: 400 }}>
                                            {medicationHistory.length > 0 ? (
                                                <Stack spacing={2}>
                                                    {medicationHistory.map((med, idx) => (
                                                        <Box key={idx} sx={{ p: 2.5, bgcolor: 'action.hover', borderRadius: 2, border: 1, borderColor: 'divider' }}>
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <Box>
                                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{med.medication_name || 'Unnamed Medication'}</Typography>
                                                                    <Typography variant="body2" color="text.secondary">Dose: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{med.dose || 'N/A'}</Box> • Frequency: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{med.frequency || 'N/A'}</Box></Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Time: {med.time || 'N/A'}</Typography>
                                                                </Box>
                                                                <Box sx={{ textAlign: 'right' }}>
                                                                    <Chip label={med.is_active ? 'Active' : 'Past'} size="small" color={med.is_active ? 'success' : 'default'} variant={med.is_active ? 'filled' : 'outlined'} />
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{formatDate(med.prescribed_date)}</Typography>
                                                                </Box>
                                                            </Box>
                                                            {med.doctor_name && (
                                                                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'block' }}>Prescribed by: <Box component="span" sx={{ fontWeight: 600 }}>{med.doctor_name}</Box></Typography>
                                                            )}
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            ) : (
                                                <Box sx={{ py: 10, textAlign: 'center', opacity: 0.5 }}>
                                                    <MedicationOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                                                    <Typography variant="h6">No medication history found</Typography>
                                                </Box>
                                            )}
                                        </Paper>
                                    ) : (
                                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5, py: 10 }}>
                                            <ArrowBackOutlinedIcon sx={{ fontSize: 48, mb: 2, color: "text.secondary" }} />
                                            <Typography variant="h6">Select a patient to view medication history</Typography>
                                        </Box>
                                    )}
                                </Grid>
                            </Grid>
                        </Stack>
                    )}

                    {/* All Nurses View */}
                    {view === 'all-nurses' && (
                        <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
                            <PageHeader 
                                title="Nursing Staff Directory" 
                                subtitle="Overview of all registered nursing personnel"
                            />
                            <Grid container spacing={3}>
                                {nurseAssignments.map(nurse => (
                                    <Grid item xs={12} sm={6} lg={4} key={nurse.nurse_id}>
                                        <Card 
                                            onClick={() => loadNurseDetails(nurse.nurse_id)}
                                            sx={{ 
                                                cursor: 'pointer', 
                                                height: '100%',
                                                transition: '0.2s',
                                                '&:hover': { borderColor: 'primary.main', boxShadow: 4, transform: 'translateY(-4px)' }
                                            }}
                                            variant="outlined"
                                        >
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{nurse.nurse_name}</Typography>
                                                    <StatusChip status={nurse.status === 'emergency' ? 'emergency' : nurse.status || 'offline'} />
                                                </Box>
                                                <Stack spacing={1}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2" color="text.secondary">Current Shift</Typography>
                                                        <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>{nurse.current_shift}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2" color="text.secondary">Tasks Completed</Typography>
                                                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{nurse.shifts?.reduce((sum, s) => sum + (s.completed_tasks || 0), 0) || 0}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2" color="text.secondary">Handoffs Filed</Typography>
                                                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{nurse.total_handoffs || 0}</Typography>
                                                    </Box>
                                                </Stack>
                                                <Box sx={{ mt: 3, pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>VIEW DETAILS </Typography>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Stack>
                    )}

                    {/* Nurse Details View */}
                    {view === 'nurse-details' && selectedNurseDetails && (
                        <Stack spacing={3} sx={{ maxWidth: 1000, mx: 'auto' }}>
                            <Button 
                                startIcon={<ArrowBackIcon />} 
                                onClick={() => setView('all-nurses')} 
                                sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
                            >
                                Back to All Nurses
                            </Button>
                            
                            <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: 3 }}>
                                <Box>
                                    <Typography variant="h3" sx={{ fontWeight: 800 }}>{selectedNurseDetails.nurse_name}</Typography>
                                    <Typography variant="body1" color="text.secondary">{selectedNurseDetails.email}</Typography>
                                    <Typography variant="body2" sx={{ mt: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1, display: 'inline-block' }}>Department: <Box component="span" sx={{ fontWeight: 700 }}>{selectedNurseDetails.department || 'N/A'}</Box></Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <StatusChip status={selectedNurseDetails.current_status === 'emergency' ? 'emergency' : selectedNurseDetails.current_status || 'offline'} />
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontWeight: 600 }}>Current: {selectedNurseDetails.current_shift} Shift</Typography>
                                </Box>
                            </Paper>

                            <Grid container spacing={2}>
                                {[{ label: 'COMPLETED', val: selectedNurseDetails.total_tasks_completed, color: 'success.main' },
                                  { label: 'PENDING', val: selectedNurseDetails.pending_tasks, color: 'warning.main' },
                                  { label: 'REASSIGNED', val: selectedNurseDetails.reassigned_tasks, color: 'primary.main' },
                                  { label: 'HANDOFFS', val: selectedNurseDetails.total_handoffs, color: 'text.primary' }
                                ].map((stat, i) => (
                                    <Grid item xs={6} md={3} key={i}>
                                        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'action.hover' }}>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>{stat.label}</Typography>
                                            <Typography variant="h3" sx={{ fontWeight: 800, color: stat.color }}>{stat.val || 0}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>

                            <Paper variant="outlined" sx={{ p: 0, borderRadius: 3, overflow: 'hidden' }}>
                                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
                                    {[
                                        { key: 'completed', label: 'Completed', icon: <CheckCircleOutlinedIcon />, count: selectedNurseDetails.total_tasks_completed || 0 },
                                        { key: 'pending', label: ' Pending', count: selectedNurseDetails.pending_tasks || 0 },
                                        { key: 'reassigned', label: 'Reassigned', icon: <AutorenewOutlinedIcon />, count: selectedNurseDetails.reassigned_tasks || 0 }
                                    ].map(tab => (
                                        <Button 
                                            key={tab.key}
                                            variant={(nurseTaskTab || 'completed') === tab.key ? 'contained' : 'text'}
                                            onClick={() => setNurseTaskTab?.(tab.key)}
                                            size="small"
                                            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                                        >
                                            {tab.label} ({tab.count})
                                        </Button>
                                    ))}
                                </Box>

                                <Box sx={{ p: 2, minHeight: 100 }}>
                                    {(nurseTaskTab || 'completed') === 'completed' && (
                                        selectedNurseDetails.recent_completed_tasks?.length > 0 ? (
                                            <Stack spacing={1}>
                                                {selectedNurseDetails.recent_completed_tasks.map((task, idx) => (
                                                    <Box key={idx} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                            <CheckCircleOutlinedIcon color="success" />
                                                            <Box>
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{task.description || task.task_type}</Typography>
                                                                {task.patient_name && <Typography variant="caption" color="text.secondary">Patient: {task.patient_name}</Typography>}
                                                            </Box>
                                                        </Box>
                                                        <Typography variant="caption" color="text.secondary">{formatDate(task.completed_at)}</Typography>
                                                    </Box>
                                                ))}
                                            </Stack>
                                        ) : <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>No completed tasks</Typography>
                                    )}

                                    {(nurseTaskTab || 'completed') === 'pending' && (
                                        selectedNurseDetails.recent_pending_tasks?.length > 0 ? (
                                            <Stack spacing={1}>
                                                {selectedNurseDetails.recent_pending_tasks.map((task, idx) => (
                                                    <Box key={idx} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                            <Typography sx={{ color: 'warning.main', fontWeight: 900 }}>○</Typography>
                                                            <Box>
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{task.description || task.task_type}</Typography>
                                                                {task.patient_name && <Typography variant="caption" color="text.secondary">Patient: {task.patient_name}</Typography>}
                                                            </Box>
                                                        </Box>
                                                        <Chip label={task.priority || 'normal'} size="small" color={task.priority === 'high' ? 'error' : 'warning'} variant="soft" />
                                                    </Box>
                                                ))}
                                            </Stack>
                                        ) : <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>No pending tasks</Typography>
                                    )}

                                    {(nurseTaskTab || 'completed') === 'reassigned' && (
                                        selectedNurseDetails.recent_reassigned_tasks?.length > 0 ? (
                                            <Stack spacing={1}>
                                                {selectedNurseDetails.recent_reassigned_tasks.map((task, idx) => (
                                                    <Box key={idx} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                            <AutorenewOutlinedIcon color="primary" />
                                                            <Box>
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{task.description || task.task_type}</Typography>
                                                                {task.patient_name && <Typography variant="caption" color="text.secondary">Patient: {task.patient_name}</Typography>}
                                                            </Box>
                                                        </Box>
                                                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>{task.status}</Typography>
                                                    </Box>
                                                ))}
                                            </Stack>
                                        ) : <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>No reassigned tasks</Typography>
                                    )}
                                </Box>
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Recent Shifts Worked</Typography>
                                {selectedNurseDetails.shifts_worked?.length > 0 ? (
                                    <Stack spacing={1.5}>
                                        {selectedNurseDetails.shifts_worked.slice(0, 10).map((shift, idx) => (
                                            <Box key={idx} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{shift.date}</Typography>
                                                    <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>{shift.shift} Shift</Typography>
                                                </Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    {shift.tasks_completed} tasks • {shift.patients?.length || 0} patients
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No shift history available</Typography>
                                )}
                            </Paper>
                        </Stack>
                    )}

                    {view === 'inventory' && (
                        <InventoryPanel showNotify={showNotify} refreshTrigger={inventoryRefreshKey} />
                    )}




                {/* Persistent Chatbot */}
                <Box 
                    sx={{ 
                        position: 'fixed', 
                        bottom: 0, 
                        left: 0, 
                        right: 0, 
                        bgcolor: 'background.paper', 
                        borderTop: 1, 
                        borderColor: 'divider', 
                        p: 2, 
                        zIndex: 1100,
                        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)'
                    }}
                >
                    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
                        {chatMessages.length > 0 && (
                            <Paper 
                                variant="outlined" 
                                sx={{ 
                                    mb: 2, 
                                    p: 2, 
                                    height: 200, 
                                    overflowY: 'auto', 
                                    position: 'relative',
                                    borderRadius: 3,
                                    bgcolor: 'action.hover'
                                }}
                            >
                                <IconButton 
                                    size="small" 
                                    onClick={() => setChatMessages([])} 
                                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                                <Stack spacing={1.5}>
                                    {chatMessages.map((msg, i) => (
                                        <Box key={i} sx={{ display: 'flex', justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}>
                                            <Paper 
                                                sx={{ 
                                                    p: 1.5, 
                                                    px: 2, 
                                                    maxWidth: '80%', 
                                                    borderRadius: msg.type === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                                                    bgcolor: msg.type === 'user' ? 'primary.main' : 'background.paper',
                                                    color: msg.type === 'user' ? 'white' : 'text.primary',
                                                    boxShadow: 1
                                                }}
                                            >
                                                <Typography variant="body2">{msg.text}</Typography>
                                            </Paper>
                                        </Box>
                                    ))}
                                    <div ref={chatEndRef} />
                                </Stack>
                            </Paper>
                        )}
                        <form onSubmit={handleChatSubmit}>
                            <TextField
                                fullWidth
                                variant="outlined"
                                placeholder="Ask AI anything about the hospital..."
                                value={chatQuestion}
                                onChange={(e) => setChatQuestion(e.target.value)}
                                disabled={chatLoading}
                                InputProps={{
                                    sx: { borderRadius: 4, bgcolor: 'background.paper' },
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton type="submit" color="primary" disabled={chatLoading}>
                                                {chatLoading ? <CircularProgress size={24} /> : <SendIcon />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                        </form>
                    </Box>
                </Box>

            {/* Notification Toast */}
            <Snackbar 
                open={!!notification} 
                autoHideDuration={6000} 
                onClose={() => setNotification(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                sx={{ zIndex: 9999 }}
            >
                {notification && (
                    <Alert 
                        onClose={() => setNotification(null)} 
                        severity={notification.type === 'error' ? 'error' : 'success'} 
                        variant="filled" 
                        sx={{ width: '100%', borderRadius: 2, fontWeight: 600 }}
                    >
                        {notification.message}
                    </Alert>
                )}
            </Snackbar>

            {/* Add Nurse Dialog */}
            <Dialog open={showAddNurse} onClose={() => setShowAddNurse(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ textAlign: 'center', pt: 4 }}>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main' }}>Add New Nurse</Typography>
                    <Typography variant="body2" color="text.secondary">Register a new nurse to the hospital system</Typography>
                </DialogTitle>
                <DialogContent>
                    <Box component="form" sx={{ pt: 2 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Full Name" value={nurseForm.full_name} onChange={e => setNurseForm({ ...nurseForm, full_name: e.target.value })} required margin="normal" />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Employee ID" value={nurseForm.employee_id} onChange={e => setNurseForm({ ...nurseForm, employee_id: e.target.value })} required margin="normal" />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Email Address" type="email" value={nurseForm.email} onChange={e => setNurseForm({ ...nurseForm, email: e.target.value })} required margin="normal" />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Password" type="password" value={nurseForm.password} onChange={e => setNurseForm({ ...nurseForm, password: e.target.value })} required margin="normal" />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Confirm Password" type="password" value={nurseForm.confirm_password} onChange={e => setNurseForm({ ...nurseForm, confirm_password: e.target.value })} required margin="normal" />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Department" value={nurseForm.department} onChange={e => setNurseForm({ ...nurseForm, department: e.target.value })} margin="normal" />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Phone Number" value={nurseForm.phone} onChange={e => setNurseForm({ ...nurseForm, phone: e.target.value })} margin="normal" />
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3, justifyContent: 'center', gap: 2 }}>
                    <Button onClick={() => setShowAddNurse(false)} variant="outlined" color="inherit" sx={{ px: 4 }}>Cancel</Button>
                    <Button onClick={handleAddNurse} variant="contained" color="primary" sx={{ px: 4, fontWeight: 700 }}>Add Nurse</Button>
                </DialogActions>
            </Dialog>

            {/* Create Care Plan Dialog */}
            <Dialog open={showCreatePlan} onClose={() => setShowCreatePlan(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', px: 4, py: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>Create Care Plan</Typography>
                        <IconButton onClick={() => setShowCreatePlan(false)}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 4 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>Select Patient</InputLabel>
                            <Select
                                value={planForm.patient_id}
                                label="Select Patient"
                                onChange={e => setPlanForm({ ...planForm, patient_id: e.target.value })}
                                required
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {patients.map(p => (
                                    <MenuItem key={p.patient_id} value={p.patient_id}>
                                        {p.patient_name} ({p.patient_id})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Medications */}
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MedicationOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} /> Medications
                            </Typography>
                            {planForm.medications.map((m, i) => (
                                <Stack key={i} direction="row" spacing={2} sx={{ mb: 2 }}>
                                    <TextField fullWidth placeholder="Name" size="small" value={m.name} onChange={e => {
                                        const newMeds = [...planForm.medications];
                                        newMeds[i].name = e.target.value;
                                        setPlanForm({ ...planForm, medications: newMeds });
                                    }} />
                                    <TextField placeholder="Time (13:00)" size="small" sx={{ width: 140 }} value={m.time} onChange={e => {
                                        const newMeds = [...planForm.medications];
                                        newMeds[i].time = e.target.value;
                                        setPlanForm({ ...planForm, medications: newMeds });
                                    }} />
                                    <TextField placeholder="Freq" size="small" sx={{ width: 120 }} value={m.frequency} onChange={e => {
                                        const newMeds = [...planForm.medications];
                                        newMeds[i].frequency = e.target.value;
                                        setPlanForm({ ...planForm, medications: newMeds });
                                    }} />
                                    <IconButton size="small" color="error" onClick={() => {
                                        const newMeds = planForm.medications.filter((_, idx) => idx !== i);
                                        setPlanForm({ ...planForm, medications: newMeds });
                                    }} disabled={planForm.medications.length <= 1}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button size="small" startIcon={<AddIcon />} onClick={() => setPlanForm({ ...planForm, medications: [...planForm.medications, { name: '', dose: '', time: '', frequency: '' }] })}>
                                Add Another Medication
                            </Button>
                        </Paper>

                        {/* Meals */}
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <RestaurantOutlinedIcon fontSize="small" sx={{ mr: 1, verticalAlign: "middle" }} /> Meal Plan
                            </Typography>
                            <Stack spacing={2}>
                                {[
                                    { label: 'Breakfast', key: 'morning', timeKey: 'morning_time' },
                                    { label: 'Lunch', key: 'afternoon', timeKey: 'afternoon_time' },
                                    { label: 'Dinner', key: 'night', timeKey: 'night_time' }
                                ].map((meal) => (
                                    <Stack key={meal.key} direction="row" spacing={2} alignItems="center">
                                        <Typography variant="body2" sx={{ width: 80, fontWeight: 600 }}>{meal.label}</Typography>
                                        <TextField fullWidth placeholder="Meal info" size="small" onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, [meal.key]: e.target.value } })} />
                                        <TextField type="time" size="small" sx={{ width: 150 }} value={planForm.meals[meal.timeKey]} onChange={e => setPlanForm({ ...planForm, meals: { ...planForm.meals, [meal.timeKey]: e.target.value } })} />
                                    </Stack>
                                ))}
                            </Stack>
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: 1, borderColor: 'divider' }}>
                    <Button onClick={() => setShowCreatePlan(false)} color="inherit">Cancel</Button>
                    <Button onClick={submitCarePlan} variant="contained" sx={{ fontWeight: 700 }}>Create Care Plan</Button>
                </DialogActions>
            </Dialog>

            {/* View Handoff Modal */}
            {selectedHandoff && (
                <ViewHandoffModal 
                    handoff={selectedHandoff} 
                    onClose={() => setSelectedHandoff(null)} 
                />
            )}

            {/* Scheduled Medication Dialog */}
            <Dialog open={showScheduledMed} onClose={() => setShowScheduledMed(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', px: 4, py: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>Schedule Medication Tasks</Typography>
                        <IconButton onClick={() => setShowScheduledMed(false)}><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 4 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>Select Patient</InputLabel>
                            <Select
                                value={scheduledMedForm.patient_id}
                                label="Select Patient"
                                onChange={e => setScheduledMedForm({ ...scheduledMedForm, patient_id: e.target.value })}
                                required
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {patients.map(p => (
                                    <MenuItem key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_id})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField fullWidth label="Medication Name" placeholder="e.g. Paracetamol 500mg" value={scheduledMedForm.medication_name} onChange={e => setScheduledMedForm({ ...scheduledMedForm, medication_name: e.target.value })} required />

                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Shifts (when to administer)</Typography>
                            <Stack direction="row" spacing={2.5}>
                                {[
                                    { key: 'day', label: 'Day', icon: <WbSunnyOutlinedIcon />, desc: '9am' },
                                    { key: 'afternoon', label: 'Afternoon', icon: <WbTwilightOutlinedIcon />, desc: '2pm' },
                                    { key: 'night', label: 'Night', icon: <NightlightOutlinedIcon />, desc: '9pm' }
                                ].map(s => (
                                    <FormControlLabel
                                        key={s.key}
                                        control={<Checkbox checked={scheduledMedForm.shifts.includes(s.key)} onChange={e => {
                                            const newShifts = e.target.checked ? [...scheduledMedForm.shifts, s.key] : scheduledMedForm.shifts.filter(sh => sh !== s.key);
                                            setScheduledMedForm({ ...scheduledMedForm, shifts: newShifts });
                                        }} />}
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.label}</Typography>
                                                <Typography variant="caption" color="text.secondary">{s.desc}</Typography>
                                            </Box>
                                        }
                                    />
                                ))}
                            </Stack>
                        </Box>

                        <Stack direction="row" spacing={2}>
                            <TextField fullWidth label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={scheduledMedForm.start_date} onChange={e => setScheduledMedForm({ ...scheduledMedForm, start_date: e.target.value })} required />
                            <TextField fullWidth label="End Date" type="date" InputLabelProps={{ shrink: true }} value={scheduledMedForm.end_date} onChange={e => setScheduledMedForm({ ...scheduledMedForm, end_date: e.target.value })} required />
                        </Stack>

                        {scheduledMedForm.start_date && scheduledMedForm.end_date && scheduledMedForm.shifts.length > 0 && (
                            <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                {(() => {
                                    const days = Math.ceil((new Date(scheduledMedForm.end_date) - new Date(scheduledMedForm.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                                    const totalTasks = days * scheduledMedForm.shifts.length;
                                    return `${totalTasks} tasks will be created (${days} days × ${scheduledMedForm.shifts.length} shifts)`;
                                })()}
                            </Alert>
                        )}

                        <TextField fullWidth label="Notes (optional)" multiline rows={2} value={scheduledMedForm.notes} onChange={e => setScheduledMedForm({ ...scheduledMedForm, notes: e.target.value })} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: 1, borderColor: 'divider' }}>
                    <Button onClick={() => setShowScheduledMed(false)} color="inherit">Cancel</Button>
                    <Button onClick={submitScheduledMedication} variant="contained" disabled={loading} sx={{ fontWeight: 700 }}>
                        {loading ? 'Creating...' : 'Create Medication Tasks'}
                    </Button>
                </DialogActions>
            </Dialog>
            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfile} 
                onClose={() => setShowProfile(false)} 
                user={{...user, role: 'doctor'}} 
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />

            {/* Schedule Manager Modal */}
            {showScheduleManager && (
                <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, p: 2 }}>
                    <DoctorScheduleManager
                        onClose={() => setShowScheduleManager(false)}
                        onSuccess={() => {
                            showNotify('Schedule updated successfully', 'success');
                        }}
                    />
                </Box>
            )}

                </Box>
            </Box>
        </Box>
    );
};

export default DoctorDashboard;

