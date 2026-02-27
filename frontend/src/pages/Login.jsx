import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE, setRoleAuth } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

const Login = () => {
    const [showNurseModal, setShowNurseModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [showWhatsAppLogin, setShowWhatsAppLogin] = useState(false);
    const [whatsappPhone, setWhatsappPhone] = useState('');
    const [formData, setFormData] = useState({ email: '', password: '', patient_id: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e, type) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        let endpoint = '';
        let payload = {};

        switch (type) {
            case 'nurse':
                endpoint = '/auth/nurse/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'patient':
                endpoint = '/auth/patient/login';
                payload = { patient_id: formData.patient_id, password: formData.password };
                break;
            case 'doctor':
                endpoint = '/auth/doctor/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'super_admin':
                endpoint = '/auth/superadmin/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'vendor':
                endpoint = '/vendor/login';
                payload = { email: formData.email, password: formData.password };
                break;
            default:
                return;
        }

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setRoleAuth(data.user.role, data.access_token, data.user);

                // Navigate based on role
                switch (data.user.role) {
                    case 'nurse':
                        navigate('/nurse-dashboard');
                        break;
                    case 'patient':
                        navigate('/patient-dashboard');
                        break;
                    case 'doctor':
                        navigate('/doctor-dashboard');
                        break;
                    case 'super_admin':
                        navigate('/admin-dashboard');
                        break;
                    case 'vendor':
                        navigate('/vendor-dashboard');
                        break;
                    default:
                        navigate('/');
                }
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
        setLoading(false);
    };

    const closeAllModals = () => {
        setShowNurseModal(false);
        setShowPatientModal(false);
        setShowDoctorModal(false);
        setShowAdminModal(false);
        setShowVendorModal(false);
        setShowWhatsAppLogin(false);
        setWhatsappPhone('');
        setError('');
        setFormData({ email: '', password: '', patient_id: '' });
    };

    const handleWhatsAppLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/auth/patient/whatsapp-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: whatsappPhone })
            });
            const data = await res.json();

            if (data.success) {
                setRoleAuth(data.user.role, data.access_token, data.user);
                navigate('/patient-dashboard');
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
        setLoading(false);
    };

    return (
        <div className="login-page">
            {/* Theme Toggle */}
            <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
                <ThemeToggle />
            </div>

            <div className="login-container">
                {/* Logo and Title */}
                <div className="login-header">
                    <div className="login-logo">
                        <svg className="logo-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                        </svg>
                    </div>
                    <h1 className="login-title">MedCore AI</h1>
                    <p className="login-subtitle">AI-Powered Clinical Intelligence Platform</p>
                </div>

                {/* Role Selection Cards */}
                <div className="login-card">
                    <p className="login-prompt">Select your role to continue</p>

                    <div className="role-grid">
                        {/* Nurse */}
                        <button onClick={() => setShowNurseModal(true)} className="role-btn nurse">
                            <span className="role-icon">👩‍⚕️</span>
                            <p className="role-title">Nurse</p>
                            <p className="role-desc">Full System Access</p>
                        </button>

                        {/* Doctor */}
                        <button onClick={() => setShowDoctorModal(true)} className="role-btn doctor">
                            <span className="role-icon">👨‍⚕️</span>
                            <p className="role-title">Doctor</p>
                            <p className="role-desc">Clinical Overview</p>
                        </button>

                        {/* Patient */}
                        <button onClick={() => setShowPatientModal(true)} className="role-btn patient">
                            <span className="role-icon">💚</span>
                            <p className="role-title">Patient</p>
                            <p className="role-desc">View Your Info</p>
                        </button>

                        {/* Super Admin */}
                        <button onClick={() => setShowAdminModal(true)} className="role-btn admin">
                            <span className="role-icon">🛡️</span>
                            <p className="role-title">Admin</p>
                            <p className="role-desc">System Management</p>
                        </button>

                        {/* Vendor */}
                        <button onClick={() => setShowVendorModal(true)} className="role-btn vendor">
                            <span className="role-icon">🚚</span>
                            <p className="role-title">Vendor</p>
                            <p className="role-desc">Supply Chain</p>
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <p className="login-footer">
                    🔒 Secure • HIPAA Compliant • AI-Powered
                </p>
            </div>

            {/* Nurse Login Modal */}
            {showNurseModal && (
                <LoginModal
                    title="Nurse Login"
                    type="nurse"
                    color="blue"
                    icon="👩‍⚕️"
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleLogin}
                    onClose={closeAllModals}
                    loading={loading}
                    error={error}
                    emailPlaceholder="Nurse Email"
                    showSignup
                    signupLink="/nurse-signup"
                />
            )}

            {/* Doctor Login Modal */}
            {showDoctorModal && (
                <LoginModal
                    title="Doctor Login"
                    type="doctor"
                    color="purple"
                    icon="👨‍⚕️"
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleLogin}
                    onClose={closeAllModals}
                    loading={loading}
                    error={error}
                    emailPlaceholder="Doctor Email"
                    showSignup
                    signupLink="/doctor-signup"
                />
            )}

            {/* Super Admin Login Modal */}
            {showAdminModal && (
                <LoginModal
                    title="Admin Login"
                    type="super_admin"
                    color="red"
                    icon="🛡️"
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleLogin}
                    onClose={closeAllModals}
                    loading={loading}
                    error={error}
                    emailPlaceholder="Admin Email"
                    showSignup
                    signupLink="/admin-signup"
                />
            )}

            {/* Vendor Login Modal */}
            {showVendorModal && (
                <LoginModal
                    title="Vendor Login"
                    type="vendor"
                    color="green"
                    icon="🚚"
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleLogin}
                    onClose={closeAllModals}
                    loading={loading}
                    error={error}
                    emailPlaceholder="Vendor Email"
                    showSignup
                    signupLink="/vendor-signup"
                />
            )}

            {/* Patient Login Modal */}
            {showPatientModal && (
                <div className="modal-overlay">
                    <div className="modal-box">
                        <div className="modal-accent green"></div>
                        <button onClick={closeAllModals} className="modal-close">✕</button>

                        <div className="modal-header">
                            <span className="modal-icon">💚</span>
                            <h2>Patient Login</h2>
                        </div>

                        {error && <div className="modal-error">{error}</div>}

                        <form onSubmit={(e) => handleLogin(e, 'patient')} className="modal-form" autoComplete="off">
                            <input
                                type="text"
                                placeholder="Patient ID or Email"
                                className="modal-input"
                                value={formData.patient_id}
                                onChange={e => setFormData({ ...formData, patient_id: e.target.value })}
                                required
                                autoComplete="off"
                                name={`patient_id_${Math.random().toString(36).slice(2)}`}
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                className="modal-input"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                required
                                autoComplete="current-password"
                                name={`password_${Math.random().toString(36).slice(2)}`}
                            />
                            <button type="submit" disabled={loading} className="modal-submit green">
                                {loading ? 'Logging in...' : 'Login'}
                            </button>
                        </form>
                        <div className="modal-link">
                            <Link to="/patient-signup">Sign up as Patient</Link>
                        </div>
                        <div className="modal-link" style={{ marginTop: '8px' }}>
                            <button 
                                type="button"
                                onClick={() => { setShowPatientModal(false); setShowWhatsAppLogin(true); setError(''); }}
                                style={{ background: 'none', border: 'none', color: '#25D366', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}
                            >
                                <span style={{ fontSize: '18px' }}>📱</span> Login with WhatsApp Number
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Patient Login Modal */}
            {showWhatsAppLogin && (
                <div className="modal-overlay">
                    <div className="modal-box">
                        <div className="modal-accent green"></div>
                        <button onClick={closeAllModals} className="modal-close">✕</button>

                        <div className="modal-header">
                            <span className="modal-icon">📱</span>
                            <h2>WhatsApp Login</h2>
                        </div>

                        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--color-muted-foreground)', marginBottom: '16px' }}>
                            Enter the phone number you used to book an appointment via WhatsApp
                        </p>

                        {error && <div className="modal-error">{error}</div>}

                        <form onSubmit={handleWhatsAppLogin} className="modal-form" autoComplete="off">
                            <input
                                type="tel"
                                placeholder="Phone number (e.g. 918885851826)"
                                className="modal-input"
                                value={whatsappPhone}
                                onChange={e => setWhatsappPhone(e.target.value)}
                                required
                                autoComplete="off"
                            />
                            <button type="submit" disabled={loading} className="modal-submit green">
                                {loading ? 'Logging in...' : 'Login with WhatsApp'}
                            </button>
                        </form>
                        <div className="modal-link" style={{ marginTop: '8px' }}>
                            <button 
                                type="button"
                                onClick={() => { setShowWhatsAppLogin(false); setShowPatientModal(true); setError(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}
                            >
                                Back to Patient Login
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Reusable login modal component
const LoginModal = ({ title, type, color, icon, formData, setFormData, onSubmit, onClose, loading, error, emailPlaceholder, showSignup, signupLink }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-box">
                <div className={`modal-accent ${color}`}></div>
                <button onClick={onClose} className="modal-close">✕</button>

                <div className="modal-header">
                    <span className="modal-icon">{icon}</span>
                    <h2>{title}</h2>
                </div>

                {error && <div className="modal-error">{error}</div>}

                <form onSubmit={(e) => onSubmit(e, type)} className="modal-form" autoComplete="off">
                    <input
                        type="email"
                        placeholder={emailPlaceholder || "Email"}
                        className="modal-input"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        required
                        autoComplete="off"
                        name={`email_${Math.random().toString(36).slice(2)}`}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="modal-input"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        required
                        autoComplete="current-password"
                        name={`password_${Math.random().toString(36).slice(2)}`}
                    />
                    <button type="submit" disabled={loading} className={`modal-submit ${color}`}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                {showSignup && (
                    <div className="modal-link">
                        <Link to={signupLink}>Sign up as {title.replace(' Login', '')}</Link>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Login;