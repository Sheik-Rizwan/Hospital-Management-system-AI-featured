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
import ManagerDashboard from './pages/ManagerDashboard';
import LabDashboard from './pages/LabDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import FrontDeskDashboard from './pages/FrontDeskDashboard';
import ManagerSignup from './pages/ManagerSignup';
import LabTechSignup from './pages/LabTechSignup';
import PharmacistSignup from './pages/PharmacistSignup';
import FrontDeskSignup from './pages/FrontDeskSignup';
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
                <Route path="/manager-signup" element={<ManagerSignup />} />
                <Route path="/hospital_manager_signup" element={<ManagerSignup />} />
                <Route path="/hospital_manager-signup" element={<ManagerSignup />} />
                <Route path="/labtech-signup" element={<LabTechSignup />} />
                <Route path="/lab_technician_signup" element={<LabTechSignup />} />
                <Route path="/lab_technician-signup" element={<LabTechSignup />} />
                <Route path="/pharmacist-signup" element={<PharmacistSignup />} />
                <Route path="/frontdesk-signup" element={<FrontDeskSignup />} />
                <Route path="/front_desk_signup" element={<FrontDeskSignup />} />
                <Route path="/front_desk-signup" element={<FrontDeskSignup />} />

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

                {/* Hospital Manager Dashboard */}
                <Route path="/manager-dashboard" element={
                    <PrivateRoute allowedRoles="hospital_manager">
                        <ManagerDashboard />
                    </PrivateRoute>
                } />

                {/* Lab Technician Dashboard */}
                <Route path="/lab-dashboard" element={
                    <PrivateRoute allowedRoles="lab_technician">
                        <LabDashboard />
                    </PrivateRoute>
                } />

                {/* Pharmacist Dashboard */}
                <Route path="/pharmacist-dashboard" element={
                    <PrivateRoute allowedRoles="pharmacist">
                        <PharmacistDashboard />
                    </PrivateRoute>
                } />

                {/* Front Desk Dashboard */}
                <Route path="/frontdesk-dashboard" element={
                    <PrivateRoute allowedRoles="front_desk">
                        <FrontDeskDashboard />
                    </PrivateRoute>
                } />

                {/* Catch-all route to prevent blank screens */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
};

export default App;