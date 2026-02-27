import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';

const VendorSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        company_name: '',
        email: '',
        password: '',
        confirm_password: '',
        category: 'general',
        contact_person: '',
        phone: '',
        address: '',
        gst_number: ''
    });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(formData.password !== formData.confirm_password) return alert("Passwords don't match");

        try {
            const res = await fetch(`${API_BASE}/auth/vendor/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                alert('Signup successful! Please wait for admin approval before logging in.');
                navigate('/vendor-login');
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert('An error occurred during signup.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-card relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-success-soft rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="bg-surface/80 backdrop-blur-xl p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-2xl border border-white/10 relative z-10 animate-fade-in-up">
                <div className="text-center mb-10">
                    <span className="text-4xl mb-4 block">🚚</span>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-2">Vendor Registration</h2>
                    <p className="text-muted-foreground">Join our supply chain network</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Company Name</label>
                            <input 
                                name="company_name" 
                                placeholder="e.g. MedSupply Co." 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Category</label>
                            <select 
                                name="category" 
                                onChange={handleChange} 
                                required 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground outline-none transition-all"
                            >
                                <option value="general">General Supplies</option>
                                <option value="medicines">Medicines</option>
                                <option value="equipment">Medical Equipment</option>
                                <option value="lab">Lab Supplies</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary ml-1">Email Address</label>
                        <input 
                            name="email" 
                            type="email" 
                            placeholder="contact@company.com" 
                            onChange={handleChange} 
                            required 
                            className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
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
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
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
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Contact Person</label>
                            <input 
                                name="contact_person" 
                                placeholder="Representative Name" 
                                onChange={handleChange} 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-secondary ml-1">Phone Number</label>
                            <input 
                                name="phone" 
                                placeholder="+1 (555) 000-0000" 
                                onChange={handleChange} 
                                className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary ml-1">GST/Tax ID</label>
                        <input 
                            name="gst_number" 
                            placeholder="Tax Identification Number" 
                            onChange={handleChange} 
                            className="w-full px-4 py-3 bg-input border border-border rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 text-foreground placeholder:text-muted-foreground outline-none transition-all" 
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="w-full py-4 mt-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transform hover:-translate-y-0.5 transition-all active:scale-95 text-lg"
                    >
                        Register Vendor
                    </button>
                </form>
                
                <p className="mt-8 text-center text-muted-foreground">
                    Already have an account? <Link to="/vendor-login" className="text-success hover:text-green-300 font-medium hover:underline transition-colors">Login here</Link>
                </p>
                <p className="mt-2 text-center text-muted-foreground text-sm">
                    Back to <Link to="/" className="text-muted-foreground hover:text-white transition-colors">Main Login</Link>
                </p>
            </div>
        </div>
    );
};

export default VendorSignup;
