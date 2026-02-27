import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api'; // Ensure this path matches your file structure

const PatientSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        patient_id: '',
        patient_name: '',
        date_of_birth: '',
        gender: '',
        password: '',
        confirm_password: '',
        email: '',
        phone: '',
        admission_date: '',
        room_number: '',
        diagnosis: '',
        terms: false
    });

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirm_password) {
            alert("Passwords do not match!");
            return;
        }

        if (!formData.terms) {
            alert("You must agree to the Terms of Service.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/patient/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (data.success) {
                alert(data.message || 'Patient account created successfully!');
                navigate('/'); // Redirect to login
            } else {
                alert(data.error || 'Signup failed. Please try again.');
            }
        } catch (error) {
            alert('Network error. Please try again.');
        }
    };

    return (
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 min-h-screen flex items-center justify-center p-4">
            <div className="max-w-2xl w-full">
                {/* Logo and Header */}
                <div className="text-center mb-8">
                    <div className="inline-block p-4 bg-green-600 rounded-full mb-4">
                        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-foreground">Patient Registration</h1>
                    <p className="text-text-secondary mt-2">Create your patient account</p>
                </div>

                {/* Signup Form */}
                <div className="bg-surface rounded-lg shadow-xl p-8 text-foreground">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Patient ID *</label>
                                <input 
                                    type="text" 
                                    name="patient_id" 
                                    required 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="e.g., P001" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Full Name *</label>
                                <input 
                                    type="text" 
                                    name="patient_name" 
                                    required 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="Enter your full name" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Date of Birth *</label>
                                <input 
                                    type="date" 
                                    name="date_of_birth" 
                                    required 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Gender *</label>
                                <select 
                                    name="gender" 
                                    required 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                >
                                    <option value="">Select Gender...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Password *</label>
                                <input 
                                    type="password" 
                                    name="password" 
                                    required 
                                    minLength="6"
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="••••••••" 
                                    autoComplete="new-password"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Confirm Password *</label>
                                <input 
                                    type="password" 
                                    name="confirm_password" 
                                    required 
                                    minLength="6"
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="••••••••" 
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Email (Optional)</label>
                                <input 
                                    type="email" 
                                    name="email" 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="patient@email.com" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Phone (Optional)</label>
                                <input 
                                    type="tel" 
                                    name="phone" 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="+1 (555) 000-0000" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Admission Date *</label>
                                <input 
                                    type="date" 
                                    name="admission_date" 
                                    required 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Room Number</label>
                                <input 
                                    type="text" 
                                    name="room_number" 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                    placeholder="e.g. 101-A" 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Primary Diagnosis</label>
                            <textarea 
                                name="diagnosis" 
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-foreground"
                                placeholder="Brief description of diagnosis..." 
                                rows="3"
                            ></textarea>
                        </div>

                        <div className="flex items-center mt-4">
                            <input 
                                type="checkbox" 
                                id="terms" 
                                name="terms" 
                                required 
                                onChange={handleChange}
                                className="w-4 h-4 text-success border-border rounded focus:ring-green-500" 
                            />
                            <label htmlFor="terms" className="ml-2 text-sm text-text-secondary">
                                I agree to the <a href="#" className="text-success hover:underline">Terms of Service</a> and <a href="#" className="text-success hover:underline">Privacy Policy</a>
                            </label>
                        </div>

                        <button 
                            type="submit" 
                            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold mt-6 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                            </svg>
                            Create Patient Account
                        </button>
                    </form>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-surface text-muted-foreground">or</span>
                        </div>
                    </div>

                    <p className="text-center text-sm text-text-secondary">
                        Already have an account? 
                        <Link to="/" className="text-success hover:underline font-medium ml-1">Login here</Link>
                    </p>
                </div>

                {/* Back to Home */}
                <div className="text-center mt-6">
                    <Link to="/" className="text-text-secondary hover:text-foreground flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                        </svg>
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PatientSignup;