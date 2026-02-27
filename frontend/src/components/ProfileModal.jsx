import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

const ProfileModal = ({ isOpen, onClose, user, onUpdate }) => {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',

        department: '',
        specialization: ''
    });
    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'password'

    useEffect(() => {
        if (isOpen && user) {
            setFormData({
                full_name: user.full_name || user.patient_name || '',
                email: user.email || '',
                phone: user.phone || '',
                department: user.department || '',
                specialization: user.specialization || ''
            });
        }
    }, [isOpen, user?.user_id]);

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const res = await fetch(`${API_BASE}/user/profile`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ text: 'Profile updated successfully!', type: 'success' });
                // Update sessionStorage
                const updatedUser = { ...user, ...formData };
                sessionStorage.setItem('user', JSON.stringify(updatedUser));
                if (onUpdate) onUpdate(updatedUser);
            } else {
                setMessage({ text: data.error || 'Update failed', type: 'error' });
            }
        } catch (e) {
            setMessage({ text: 'Network error', type: 'error' });
        }
        setLoading(false);
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwordData.new_password !== passwordData.confirm_password) {
            setMessage({ text: 'Passwords do not match', type: 'error' });
            return;
        }
        if (passwordData.new_password.length < 6) {
            setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const res = await fetch(`${API_BASE}/user/password`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password
                })
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ text: 'Password changed successfully!', type: 'success' });
                setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
            } else {
                setMessage({ text: data.error || 'Password change failed', type: 'error' });
            }
        } catch (e) {
            setMessage({ text: 'Network error', type: 'error' });
        }
        setLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-card rounded-2xl w-full max-w-md mx-4 border border-border shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-teal-600 to-blue-600 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-surface/20 flex items-center justify-center text-3xl font-bold text-white">
                                {(formData.full_name || 'U')[0].toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    {(user?.role === 'doctor' ? 'Dr. ' : '') + 
                                     (formData.full_name || 'User').replace(/\b\w/g, l => l.toUpperCase())}
                                </h2>
                                <p className="text-white/70 text-sm">
                                    {user?.role === 'doctor' 
                                        ? `Specialist of ${formData.specialization || formData.department || user.specialization || user.department || 'General'}`.replace(/\b\w/g, l => l.toUpperCase())
                                        : (user?.role || 'User')}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-white/70 hover:text-white p-2">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 py-3 text-sm font-medium transition ${
                            activeTab === 'profile' ? 'text-primary border-b-2 border-teal-400' : 'text-muted-foreground hover:text-white'
                        }`}
                    >
                        Profile Details
                    </button>
                    <button
                        onClick={() => setActiveTab('password')}
                        className={`flex-1 py-3 text-sm font-medium transition ${
                            activeTab === 'password' ? 'text-primary border-b-2 border-teal-400' : 'text-muted-foreground hover:text-white'
                        }`}
                    >
                        Change Password
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {message.text && (
                        <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
                            message.type === 'success' ? 'bg-success-soft text-success' : 'bg-error-soft text-error'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {activeTab === 'profile' ? (
                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                />
                            </div>
                            {/* Department or Specialization */}
                            <div className="mb-4">
                                <label className="block text-sm text-muted-foreground mb-1">
                                    {user?.role === 'doctor' ? 'Specialization' : 'Department'}
                                </label>
                                <input
                                    type="text"
                                    value={user?.role === 'doctor' ? formData.specialization : formData.department}
                                    onChange={(e) => setFormData({ 
                                        ...formData, 
                                        [user?.role === 'doctor' ? 'specialization' : 'department']: e.target.value 
                                    })}
                                    className="w-full bg-border/50 border border-border rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-primary transition-colors"
                                    placeholder={user?.role === 'doctor' ? "e.g. Cardiology" : "Department Name"}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition"
                            >
                                {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handlePasswordChange} className="space-y-4" autoComplete="off">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Current Password</label>
                                <input
                                    type="password"
                                    value={passwordData.current_password}
                                    onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                    required
                                    autoComplete="current-password"
                                    name={`current_password_${Math.random().toString(36).slice(2)}`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">New Password</label>
                                <input
                                    type="password"
                                    value={passwordData.new_password}
                                    onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                    name={`new_password_${Math.random().toString(36).slice(2)}`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={passwordData.confirm_password}
                                    onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                                    className="w-full bg-border border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                                    required
                                    autoComplete="new-password"
                                    name={`confirm_password_${Math.random().toString(36).slice(2)}`}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition"
                            >
                                {loading ? 'Changing...' : 'Change Password'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
