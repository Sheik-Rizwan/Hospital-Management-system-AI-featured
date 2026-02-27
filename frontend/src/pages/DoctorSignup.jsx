import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE } from '../utils/api';

const DoctorSignup = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        specialty: '',
        license_number: '',
        phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/doctor/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    full_name: formData.full_name,
                    specialization: formData.specialty,
                    license_number: formData.license_number,
                    phone: formData.phone
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('Registration successful! Redirecting to login...');
                setTimeout(() => navigate('/'), 2000);
            } else {
                setError(data.error || 'Registration failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }

        setLoading(false);
    };

    return (
        <div className="signup-page">
            <div className="signup-container">
                <div className="signup-card">
                    <div className="signup-header">
                        <span className="signup-icon">👨‍⚕️</span>
                        <h1>Doctor Registration</h1>
                        <p>Create your doctor account</p>
                    </div>

                    {error && <div className="alert error">{error}</div>}
                    {success && <div className="alert success">{success}</div>}

                    <form onSubmit={handleSubmit} className="signup-form">
                        <div className="form-row">
                            <input
                                type="text"
                                name="full_name"
                                placeholder="Full Name *"
                                value={formData.full_name}
                                onChange={handleChange}
                                required
                            />
                            <input
                                type="email"
                                name="email"
                                placeholder="Email Address *"
                                value={formData.email}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="form-row">
                            <input
                                type="text"
                                name="specialty"
                                placeholder="Specialty (e.g., Cardiology) *"
                                value={formData.specialty}
                                onChange={handleChange}
                                required
                            />
                            <input
                                type="text"
                                name="license_number"
                                placeholder="Medical License Number *"
                                value={formData.license_number}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <input
                            type="tel"
                            name="phone"
                            placeholder="Phone Number"
                            value={formData.phone}
                            onChange={handleChange}
                        />

                        <div className="form-row">
                            <input
                                type="password"
                                name="password"
                                placeholder="Password *"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                autoComplete="new-password"
                            />
                            <input
                                type="password"
                                name="confirmPassword"
                                placeholder="Confirm Password *"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        <button type="submit" disabled={loading} className="submit-btn purple">
                            {loading ? 'Creating Account...' : 'Create Doctor Account'}
                        </button>
                    </form>

                    <div className="signup-footer">
                        <p>Already have an account? <Link to="/">Login here</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DoctorSignup;
