import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, logout, formatDate, handleAuthError } from '../utils/api';
import Notification from '../components/Notification';
import ProfileModal from '../components/ProfileModal';
import BookAppointment from '../components/BookAppointment';
import ThemeToggle from '../components/ThemeToggle';

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

            if (infoData.success) setInfo(infoData.data);
            if (handoffData.success) setHandoffs(handoffData.handoffs);
            if (apptData.success) {
                const newAppointments = apptData.appointments || [];
                
                // Check for status changes if we already have appointments
                if (background && appointments.length > 0) {
                    newAppointments.forEach(newApt => {
                        const oldApt = appointments.find(a => a.appointment_id === newApt.appointment_id);
                        if (oldApt && oldApt.status !== newApt.status) {
                            // Status changed! Show notification
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

    // Poll for updates every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadData(true);
        }, 30000);
        return () => clearInterval(interval);
    }, [appointments]); // Depend on appointments so we can compare state

    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatQuestion.trim()) return;

        setChatResponse('Thinking...');
        try {
            const res = await fetch(`${API_BASE}/patient/chatbot`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: chatQuestion })
            });
            const data = await res.json();
            setChatResponse(data.success ? data.answer : data.error);
        } catch (e) { setChatResponse('Error getting response'); }
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
        
        try {
            const res = await fetch(`${API_BASE}/patient/appointments/${appointmentId}/cancel`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Appointment cancelled successfully', 'success');
                loadData();
            } else {
                showNotify(data.error || 'Failed to cancel', 'error');
            }
        } catch (e) {
            showNotify('Failed to cancel appointment', 'error');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: 'bg-warning-soft text-yellow-700 border-yellow-300',
            pending_doctor_approval: 'bg-warning-soft text-yellow-700 border-yellow-300',
            approved: 'bg-success-soft text-green-700 border-green-300',
            confirmed: 'bg-success-soft text-green-700 border-green-300',
            rejected: 'bg-error-soft text-red-700 border-red-300',
            completed: 'bg-primary-soft text-blue-700 border-blue-300',
            cancelled: 'bg-muted text-muted-foreground border-border'
        };
        return badges[status] || badges.pending;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background ">
            {/* Navigation */}
            <nav className="bg-green-600 text-white shadow-lg">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <h1 className="text-xl font-bold">🏥 Patient Portal</h1>
                    <div className="flex items-center space-x-4">
                        <span className="text-sm">Welcome, {user.patient_name || 'Patient'}</span>
                        <ThemeToggle />
                        <button onClick={() => setShowProfile(true)} className="p-2 hover:bg-green-700 rounded transition" title="Profile">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </button>
                        <button onClick={logout} className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition">
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Tab Navigation */}
            <div className="bg-card shadow-sm border-b border-border ">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex space-x-4">
                        {['overview', 'appointments', 'history'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`py-4 px-6 font-medium capitalize border-b-2 transition ${
                                    activeTab === tab
                                        ? 'border-green-600 text-success'
                                        : 'border-transparent text-muted-foreground hover:text-text-secondary hover:text-foreground'
                                }`}
                            >
                                {tab === 'overview' && '📋 '}
                                {tab === 'appointments' && '📅 '}
                                {tab === 'history' && '📜 '}
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        {/* Info Card */}
                        <div className="bg-card rounded-lg shadow-lg p-6 animate-fade-in">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                                <span>📋</span> My Information
                            </h2>
                            {info ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <InfoTile label="Patient ID" value={info.patient_id} />
                                    <InfoTile label="Room" value={info.room_number || 'Not Assigned'} />
                                    <InfoTile label="Status" value={info.status || 'Active'} />
                                    <InfoTile label="Diagnosis" value={info.diagnosis || 'N/A'} />
                                    <InfoTile label="Admission Date" value={formatDate(info.admission_date)} />
                                    <InfoTile label="Total Records" value={handoffs.length.toString()} />
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No patient data available.</p>
                            )}
                        </div>

                        {/* Upcoming Appointment Widget */}
                        {appointments.filter(a => (a.status === 'approved' || a.status === 'confirmed') && new Date(a.date) >= new Date().setHours(0,0,0,0)).sort((a,b) => new Date(a.date) - new Date(b.date))[0] && (
                            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg shadow-lg p-6 text-white animate-fade-in relative overflow-hidden">
                                <div className="absolute right-0 top-0 p-16 bg-surface/10 rounded-full -mr-8 -mt-8"></div>
                                <h3 className="text-xl font-bold mb-2 flex items-center gap-2 relative z-10">
                                    <span>📅</span> Upcoming Appointment
                                </h3>
                                {/* Get nearest approved future appointment */}
                                {(() => {
                                    const nextApt = appointments
                                        .filter(a => (a.status === 'approved' || a.status === 'confirmed') && new Date(a.date) >= new Date().setHours(0,0,0,0))
                                        .sort((a,b) => new Date(a.date) - new Date(b.date))[0];
                                    
                                    return (
                                        <div className="relative z-10">
                                            <p className="text-2xl font-bold mb-1">{new Date(nextApt.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                                            <p className="text-lg opacity-90 mb-4">{nextApt.start_time} - {nextApt.end_time}</p>
                                            <div className="flex items-center gap-3">
                                                <div className="bg-surface/20 p-2 rounded-lg">
                                                    👨‍⚕️ Dr. {nextApt.doctor_name}
                                                </div>
                                                <div className="bg-surface/20 p-2 rounded-lg">
                                                    🩺 {nextApt.doctor_specialization || 'General'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Vitals Card */}
                        <div className="bg-surface rounded-lg shadow-lg p-6 animate-fade-in">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                                <span>💓</span> Latest Vitals
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <VitalTile label="Heart Rate" value={info?.latest_vitals?.heart_rate} unit="bpm" colorClass="blue" />
                                <VitalTile label="Blood Pressure" value={info?.latest_vitals?.blood_pressure} unit="mmHg" colorClass="red" />
                                <VitalTile label="Temperature" value={info?.latest_vitals?.temperature} unit="°F" colorClass="yellow" />
                                <VitalTile label="SpO2" value={info?.latest_vitals?.oxygen_saturation} unit="%" colorClass="green" />
                                <VitalTile label="Resp. Rate" value={info?.latest_vitals?.respiratory_rate} unit="/min" colorClass="purple" />
                            </div>
                            {!info?.latest_vitals && (
                                <p className="text-muted-foreground text-center mt-4">No vitals recorded yet.</p>
                            )}
                        </div>

                        {/* Chatbot */}
                        <div className="bg-surface rounded-lg shadow-lg p-6 animate-fade-in">
                            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-foreground">
                                <span>🤖</span> Ask About My Health
                            </h2>
                            <form onSubmit={handleChat} className="space-y-4">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-border bg-input rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-foreground placeholder:text-muted-foreground"
                                    placeholder="e.g., What are my latest vitals? What medications am I on?"
                                    value={chatQuestion}
                                    onChange={(e) => setChatQuestion(e.target.value)}
                                />
                                <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold">
                                    Ask Question
                                </button>
                            </form>
                            {chatResponse && (
                                <div className="mt-4 p-4 bg-background rounded-lg">
                                    <p className="text-sm font-medium text-text-secondary mb-2">Response:</p>
                                    <p className="whitespace-pre-wrap text-foreground">{chatResponse}</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Appointments Tab */}
                {activeTab === 'appointments' && (
                    <>
                        {/* Book Appointment CTA */}
                        <div className="bg-gradient-to-r from-green-500 to-teal-500 rounded-lg shadow-lg p-8 text-white">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold mb-2">📅 Book an Appointment</h2>
                                    <p className="opacity-90">Schedule a visit with one of our doctors</p>
                                </div>
                                <button
                                    onClick={() => setShowBookAppointment(true)}
                                    className="px-8 py-3 bg-surface text-success rounded-lg font-semibold hover:bg-muted transition shadow-lg"
                                >
                                    Find a Doctor →
                                </button>
                            </div>
                        </div>

                        {/* My Appointments List */}
                        <div className="bg-surface rounded-lg shadow-lg p-6">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                                <span>📋</span> My Appointments
                            </h2>
                            
                            {appointments.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p className="text-4xl mb-4">📅</p>
                                    <p>No appointments yet. Book your first appointment above!</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {appointments.map(apt => (
                                        <div key={apt.appointment_id} className="border rounded-lg p-4 hover:shadow-md transition">
                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusBadge(apt.status)}`}>
                                                            {apt.status?.toUpperCase()}
                                                        </span>
                                                        <span className="text-sm text-muted-foreground">{apt.appointment_id}</span>
                                                    </div>
                                                    <p className="font-semibold text-foreground">Dr. {apt.doctor_name || 'Doctor'}</p>
                                                    <p className="text-sm text-text-secondary">
                                                        📅 {apt.date} | ⏰ {apt.start_time} - {apt.end_time}
                                                    </p>
                                                    {apt.notes && (
                                                        <p className="text-sm text-muted-foreground mt-1">📝 {apt.notes}</p>
                                                    )}
                                                    {apt.rejection_reason && (
                                                        <p className="text-sm text-error mt-1">❌ {apt.rejection_reason}</p>
                                                    )}
                                                </div>
                                                {['pending', 'pending_doctor_approval', 'approved', 'confirmed'].includes(apt.status) && (
                                                    <button
                                                        onClick={() => handleCancelAppointment(apt.appointment_id)}
                                                        className="px-4 py-2 text-error border border-red-300 rounded-lg hover:bg-red-50 transition text-sm"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="bg-surface rounded-lg shadow-lg p-6 animate-fade-in">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                            <span>📜</span> My Care History
                        </h2>
                        <div className="space-y-4">
                            {handoffs.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">No care records found.</p>
                            ) : (
                                handoffs.map((h, idx) => (
                                    <div key={idx} className="border-l-4 border-green-500 p-4 rounded-lg bg-background hover:bg-muted transition">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-bold text-green-700">{h.shift} Shift</span>
                                                <p className="text-sm text-text-secondary mt-1">Nurse: {h.nurse_name}</p>
                                            </div>
                                            <span className="text-sm text-muted-foreground">{formatDate(h.timestamp)}</span>
                                        </div>
                                        {h.structured_report?.vitals && (
                                            <div className="mt-2 text-xs text-text-secondary bg-success-soft p-2 rounded">
                                                <span className="font-medium">Vitals: </span>
                                                HR: {typeof h.structured_report.vitals.heart_rate === 'object' ? h.structured_report.vitals.heart_rate?.value : h.structured_report.vitals.heart_rate || '--'},
                                                BP: {typeof h.structured_report.vitals.blood_pressure === 'object' ? h.structured_report.vitals.blood_pressure?.value : h.structured_report.vitals.blood_pressure || '--'}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Book Appointment Modal */}
            {showBookAppointment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <BookAppointment
                        onClose={() => setShowBookAppointment(false)}
                        onSuccess={() => {
                            loadData();
                            setActiveTab('appointments');
                        }}
                    />
                </div>
            )}

            {/* Notification */}
            <Notification message={notification?.message} type={notification?.type} onClose={() => setNotification(null)} />

            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfile} 
                onClose={() => setShowProfile(false)} 
                user={{...user, role: 'patient', full_name: user.patient_name}} 
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </div>
    );
};

// Info tile with neutral styling
const InfoTile = ({ label, value }) => (
    <div className="p-4 bg-background rounded-lg border border-border">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
);

// Vital tile with explicit color classes (not dynamic)
const VitalTile = ({ label, value, unit, colorClass }) => {
    const colorMap = {
        blue: { bg: 'bg-blue-500/10', text: 'text-primary' },
        red: { bg: 'bg-red-500/10', text: 'text-error' },
        yellow: { bg: 'bg-yellow-500/10', text: 'text-warning' },
        green: { bg: 'bg-green-500/10', text: 'text-success' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
    };
    const colors = colorMap[colorClass] || colorMap.blue;

    // Handle object values like {value: "72", unit: "bpm", status: "normal"}
    let displayValue = value;
    if (value && typeof value === 'object') {
        displayValue = value.value || value.reading || JSON.stringify(value);
    }

    return (
        <div className={`p-4 ${colors.bg} rounded-lg text-center border border-border`}>
            <p className="text-sm text-text-secondary">{label}</p>
            <p className={`text-2xl font-bold ${colors.text}`}>{displayValue || '--'}</p>
            <p className="text-xs text-muted-foreground">{unit}</p>
        </div>
    );
};

export default PatientDashboard;