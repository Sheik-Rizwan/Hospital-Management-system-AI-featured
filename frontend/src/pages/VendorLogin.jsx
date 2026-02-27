import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, setRoleAuth } from '../utils/api';

const VendorLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/vendor/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                setRoleAuth('vendor', data.access_token, data.user);
                navigate('/vendor-dashboard');
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
        setLoading(false);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-card text-foreground">
            <div className="w-full max-w-md p-8 bg-sidebar rounded-xl border border-border shadow-2xl">
                <div className="text-center mb-8">
                    <span className="text-4xl mb-2 block">🚚</span>
                    <h1 className="text-2xl font-bold">Vendor Portal</h1>
                    <p className="text-muted-foreground text-sm mt-1">Hospital Procurement System</p>
                </div>

                {error && (
                    <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm text-muted-foreground mb-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-card border border-border rounded p-3 text-white focus:border-primary focus:outline-none transition"
                            placeholder="vendor@company.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-muted-foreground mb-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-card border border-border rounded p-3 text-white focus:border-primary focus:outline-none transition"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary-hover text-white font-medium py-3 rounded transition disabled:opacity-50 mt-2"
                    >
                        {loading ? 'Authenticating...' : 'Login to Dashboard'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-muted-foreground">
                    <p>Contact hospital administration for access.</p>
                </div>
            </div>
        </div>
    );
};

export default VendorLogin;
