import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import NurseDashboard from './pages/NurseDashboard';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import NurseSignup from './pages/NurseSignup';
import PatientSignup from './pages/PatientSignup';
import DoctorSignup from './pages/DoctorSignup';
import SuperAdminSignup from './pages/SuperAdminSignup';
import VendorSignup from './pages/VendorSignup';
import VendorLogin from './pages/VendorLogin';
import VendorDashboard from './pages/VendorDashboard';
import './App.css';

// Protected Route Component — checks role-specific token first, then generic
const PrivateRoute = ({ children, allowedRoles }) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Try role-specific token first
    for (const role of roles) {
        const roleToken = sessionStorage.getItem(`${role}_token`);
        const roleUser = sessionStorage.getItem(`${role}_user`);
        if (roleToken && roleUser) {
            const user = JSON.parse(roleUser);
            if (roles.includes(user.role)) return children;
        }
    }

    // Fallback to generic token
    const token = sessionStorage.getItem('token');
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');

    if (!token) return <Navigate to="/" />;
    if (allowedRoles && !roles.includes(user.role)) return <Navigate to="/" />;

    return children;
};

const App = () => {
    return (
        <Router>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Login />} />
                <Route path="/nurse-signup" element={<NurseSignup />} />
                <Route path="/patient-signup" element={<PatientSignup />} />
                <Route path="/doctor-signup" element={<DoctorSignup />} />
                <Route path="/admin-signup" element={<SuperAdminSignup />} />
                <Route path="/vendor-signup" element={<VendorSignup />} />

                {/* Super Admin Dashboard */}
                <Route path="/admin-dashboard" element={
                    <PrivateRoute allowedRoles="super_admin">
                        <SuperAdminDashboard />
                    </PrivateRoute>
                } />

                {/* Doctor Dashboard */}
                <Route path="/doctor-dashboard" element={
                    <PrivateRoute allowedRoles="doctor">
                        <DoctorDashboard />
                    </PrivateRoute>
                } />

                {/* Nurse Dashboard */}
                <Route path="/nurse-dashboard" element={
                    <PrivateRoute allowedRoles="nurse">
                        <NurseDashboard />
                    </PrivateRoute>
                } />

                {/* Patient Dashboard */}
                <Route path="/patient-dashboard" element={
                    <PrivateRoute allowedRoles="patient">
                        <PatientDashboard />
                    </PrivateRoute>
                } />

                {/* Vendor Portal */}
                <Route path="/vendor-login" element={<VendorLogin />} />
                <Route path="/vendor-dashboard" element={
                    <PrivateRoute allowedRoles="vendor">
                        <VendorDashboard />
                    </PrivateRoute>
                } />
            </Routes>
        </Router>
    );
};

export default App;