import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';

const NurseSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({});

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(formData.password !== formData.confirm_password) return alert("Passwords don't match");

        try {
            const res = await fetch(`${API_BASE}/auth/nurse/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                alert('Signup successful!');
                navigate('/');
            } else {
                alert(data.error);
            }
        } catch (error) {
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-card relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="bg-surface/80 backdrop-blur-xl p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-2xl border border-white/10 relative z-10 animate-fade-in-up">
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent mb-2">Nurse Registration</h2>
                    <p className="text-muted-foreground">Join the advanced care orchestration platform</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Full Name</label>
                            <input 
                                name="full_name" 
                                placeholder="e.g. Sarah Smith" 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Employee ID</label>
                            <input 
                                name="employee_id" 
                                placeholder="e.g. NS-2024-001" 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary ml-1">Email Address</label>
                        <input 
                            name="email" 
                            type="email" 
                            placeholder="nurse@hospital.com" 
                            onChange={handleChange} 
                            required 
                            className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Password</label>
                            <input 
                                name="password" 
                                type="password" 
                                placeholder="••••••••" 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Confirm Password</label>
                            <input 
                                name="confirm_password" 
                                type="password" 
                                placeholder="••••••••" 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Department</label>
                            <input 
                                name="department" 
                                placeholder="e.g. ICU / Emergency" 
                                onChange={handleChange} 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Phone Number</label>
                            <input 
                                name="phone" 
                                placeholder="+1 (555) 000-0000" 
                                onChange={handleChange} 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-teal-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        className="w-full py-4 mt-6 bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-teal-900/20 transform hover:-translate-y-0.5 transition-all active:scale-95 text-lg"
                    >
                        Create Account
                    </button>
                </form>
                
                <p className="mt-8 text-center text-muted-foreground">
                    Already have an account? <Link to="/" className="text-primary hover:text-primary font-medium hover:underline transition-colors">Login here</Link>
                </p>
            </div>
        </div>
    );
};

export default NurseSignup;