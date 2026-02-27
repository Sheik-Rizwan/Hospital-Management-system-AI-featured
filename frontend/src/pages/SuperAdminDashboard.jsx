import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate, connectSocket, getRoleAuth, clearRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ProfileModal from '../components/ProfileModal';
import ProcurementPanel from '../components/procurement/ProcurementPanel';
import ThemeToggle from '../components/ThemeToggle';
import '../App.css';

const SuperAdminDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('dashboard');
    const [stats, setStats] = useState({ total_patients: 0, total_nurses: 0, total_doctors: 0, total_handoffs: 0, pending_vendors: 0, total_vendors: 0 });

    const [nurses, setNurses] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [patients, setPatients] = useState([]);
    const [handoffs, setHandoffs] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [logs, setLogs] = useState([]);

    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showCreateDoctor, setShowCreateDoctor] = useState(false);
    const [showProfile, setShowProfile] = useState(false);

    // Real-time refresh keys
    const [procurementRefreshKey, setProcurementRefreshKey] = useState(0);

    const [doctorForm, setDoctorForm] = useState({
        email: '', password: '', full_name: '', specialization: '', license_number: '', department: '', phone: ''
    });

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('super_admin');
        if (u) setUser(u);
        connectSocket('super_admin');
        loadData();
    }, []);

    useRealtimeEvents({
        'quotation_submitted': (data) => { showNotify(`📄 ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'order_status_update': (data) => { showNotify(`📦 ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'procurement_updated': (data) => { showNotify(`📋 ${data.message}`, 'info'); setProcurementRefreshKey(k => k + 1); },
        'low_stock_alert': (data) => { showNotify(`⚠️ ${data.message}`, 'error'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'restock_request': (data) => { showNotify(`📋 ${data.message}`, 'info'); loadData(); setProcurementRefreshKey(k => k + 1); },
        'inventory_updated': (data) => { showNotify(`📦 Inventory ${data.action || 'updated'}: ${data.name || 'item'}`, 'info'); setProcurementRefreshKey(k => k + 1); }
    }, null, null, 'super_admin');

    const loadData = async () => {
        setLoading(true);
        const headers = getAuthHeaders('super_admin');

        try {
            const fetchData = async (url, setter, field = null) => {
                try {
                    const res = await fetch(`${API_BASE}${url}`, { headers });
                    if (!res.ok) throw new Error(`Status: ${res.status}`);
                    const data = await res.json();
                    if (data.success || res.ok) {
                        setter(field ? data[field] : data);
                        return true;
                    }
                } catch (err) {
                }
                return false;
            };

            await Promise.allSettled([
                fetchData('/admin/stats', (data) => setStats(data.stats)),
                fetchData('/admin/doctors', (data) => setDoctors(data.doctors)),
                fetchData('/admin/nurses', (data) => setNurses(data.nurses)),
                fetchData('/admin/patients', (data) => setPatients(data.patients)),
                fetchData('/admin/handoffs', (data) => setHandoffs(data.handoffs || [])),
                fetchData('/admin/appointment-logs', (data) => setLogs(data.logs || [])),
                fetchData('/admin/vendors', (data) => setVendors(data.vendors || [])),
            ]);
        } catch (error) {
            showNotify('Some data failed to load', 'error');
        }
        setLoading(false);
    };

    const handleCreateDoctor = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/doctor/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(doctorForm)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Doctor created successfully!', 'success');
                setShowCreateDoctor(false);
                setDoctorForm({ email: '', password: '', full_name: '', specialization: '', license_number: '', department: '', phone: '' });
                loadData();
            } else {
                showNotify(data.error || 'Failed to create doctor', 'error');
            }
        } catch (error) {
            showNotify('Error creating doctor', 'error');
        }
        setLoading(false);
    };

    const handleApproveVendor = async (id) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/vendors/${id}/approve`, {
                method: 'PUT',
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Vendor approved successfully', 'success');
                loadData();
            } else {
                showNotify(data.error || 'Approval failed', 'error');
            }
        } catch (error) {
            showNotify('Error approving vendor', 'error');
        }
        setLoading(false);
    };

    const handleRejectVendor = async (id) => {
        const reason = window.prompt('Enter rejection reason (optional):');
        if (reason === null) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/vendors/${id}/reject`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Vendor rejected', 'success');
                loadData();
            } else {
                showNotify(data.error || 'Rejection failed', 'error');
            }
        } catch (error) {
            showNotify('Error rejecting vendor', 'error');
        }
        setLoading(false);
    };

    const handleDelete = async (type, id) => {
        if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/${type}s/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`, 'success');
                loadData();
            } else {
                showNotify(data.error || 'Delete failed', 'error');
            }
        } catch (error) {
            showNotify('Error deleting item', 'error');
        }
        setLoading(false);
    };

    const handleLogout = () => {
        clearRoleAuth('super_admin');
        window.location.href = '/';
    };

    // Reusable table wrapper
    const DataTable = ({ headers, children }) => (
        <div className="bg-card rounded-lg overflow-hidden border border-border shadow-sm">
            <table className="w-full text-left">
                <thead className="bg-surface border-b border-border">
                    <tr>
                        {headers.map(h => (
                            <th key={h} className="p-4 text-xs uppercase text-muted-foreground font-semibold">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {children}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Sidebar */}
            <aside className="w-[260px] bg-sidebar flex flex-col border-r border-border">
                <div className="p-4 border-b border-border">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span></span> Super Admin
                    </h1>
                </div>

                {/* Data Connections */}
                <div className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Data Connections</p>
                    {[
                        { id: 'doctors', icon: '🩺', label: 'Doctors' },
                        { id: 'nurses', icon: '👩‍⚕️', label: 'Nurses' },
                        { id: 'patients', icon: '👥', label: 'Patients' },
                        { id: 'handoffs', icon: '📋', label: 'Handoffs' },
                        { id: 'logs', icon: '🔒', label: 'Audit Logs' },
                        { id: 'procurement', icon: '📦', label: 'Procurement' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id)}
                            className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition ${
                                view === item.id
                                    ? 'bg-primary-soft text-primary font-medium'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <span>{item.icon}</span> {item.label}
                        </button>
                    ))}
                    <button
                        onClick={() => setView('vendors')}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition ${
                            view === 'vendors'
                                ? 'bg-primary-soft text-primary font-medium'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                    >
                        <span>🏭</span> Vendors
                        {stats.pending_vendors > 0 && (
                            <span className="ml-auto bg-warning text-warning-foreground text-xs font-bold px-2 py-0.5 rounded-full">{stats.pending_vendors}</span>
                        )}
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 py-4 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-2">System</p>
                    {[
                        { id: 'dashboard', icon: '📊', label: 'Overview' },
                        { id: 'reports', icon: '📉', label: 'Reports' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id)}
                            className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition ${
                                view === item.id
                                    ? 'bg-primary-soft text-primary font-medium'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <span>{item.icon}</span> {item.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-border flex items-center justify-between">
                    <button onClick={() => setShowProfile(true)} className="p-2 text-muted-foreground hover:text-primary rounded-md transition" title="Profile">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </button>
                    <button onClick={handleLogout} className="flex-1 ml-2 px-3 py-2 text-left text-error hover:bg-error-soft rounded-md transition flex items-center gap-2">
                        <span>🚪</span> Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col bg-background overflow-hidden">
                <div className="absolute top-4 right-4 z-50">
                    <ThemeToggle />
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {view === 'dashboard' && (
                        <div className="space-y-8">
                            <h2 className="text-3xl font-bold">System Overview</h2>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="Total Patients" value={patients.length} icon="👥" />
                                <StatCard title="Total Doctors" value={stats.total_doctors} icon="🩺" />
                                <StatCard title="Active Nurses" value={stats.total_nurses} icon="👩‍⚕️" />
                                <div onClick={() => setView('vendors')} className="cursor-pointer">
                                    <StatCard title="Pending Vendors" value={stats.pending_vendors} icon="🏭" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                                    <h3 className="text-xl font-bold mb-4">System Health</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center p-3 bg-muted rounded-md border border-border">
                                            <span>Database Connection</span>
                                            <span className="text-success font-bold">● Active</span>
                                        </div>
                                        <div className="flex justify-between items-center p-3 bg-muted rounded-md border border-border">
                                            <span>AI Services</span>
                                            <span className="text-success font-bold">● Operational</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                                    <h3 className="text-xl font-bold mb-4">Quick Actions</h3>
                                    <div className="flex flex-wrap gap-4">
                                        <button onClick={() => { setView('doctors'); setShowCreateDoctor(true); }} className="px-5 py-3 bg-primary rounded-md text-primary-foreground hover:bg-primary-hover transition font-medium">
                                            + Add New Doctor
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'doctors' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-3xl font-bold">Medical Staff (Doctors)</h2>
                                <button onClick={() => setShowCreateDoctor(true)} className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md transition shadow-md font-medium">
                                    + Add Doctor
                                </button>
                            </div>
                            <DataTable headers={['Name', 'Specialization', 'Status', 'Actions']}>
                                {doctors.map((d, i) => (
                                    <tr key={i} className="hover:bg-muted transition">
                                        <td className="p-4 font-medium">{d.full_name}</td>
                                        <td className="p-4 text-text-secondary">{d.specialization}</td>
                                        <td className="p-4"><span className="text-success">Active</span></td>
                                        <td className="p-4">
                                            <button onClick={() => handleDelete('doctor', d.user_id)} className="text-error hover:text-destructive text-sm font-medium">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </DataTable>
                        </div>
                    )}

                    {view === 'nurses' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">Nursing Staff</h2>
                            <DataTable headers={['Name', 'Employee ID', 'Department', 'Actions']}>
                                {nurses.map((n, i) => (
                                    <tr key={i} className="hover:bg-muted transition">
                                        <td className="p-4 font-medium">{n.full_name}</td>
                                        <td className="p-4 text-text-secondary">{n.employee_id}</td>
                                        <td className="p-4 text-text-secondary">{n.department || '-'}</td>
                                        <td className="p-4">
                                            <button onClick={() => handleDelete('nurse', n.user_id)} className="text-error hover:text-destructive text-sm font-medium">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </DataTable>
                        </div>
                    )}

                    {view === 'patients' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">Patient Database</h2>
                            <DataTable headers={['ID', 'Name', 'Room', 'Diagnosis', 'Actions']}>
                                {patients.map(p => (
                                    <tr key={p.patient_id} className="hover:bg-muted transition">
                                        <td className="p-4 text-muted-foreground">{p.patient_id}</td>
                                        <td className="p-4 font-medium">{p.patient_name}</td>
                                        <td className="p-4">{p.room_number || '-'}</td>
                                        <td className="p-4 text-text-secondary">{p.diagnosis}</td>
                                        <td className="p-4">
                                            <button onClick={() => handleDelete('patient', p.patient_id)} className="text-error hover:text-destructive text-sm font-medium">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </DataTable>
                        </div>
                    )}

                    {view === 'handoffs' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">Handoff Reports</h2>
                            <DataTable headers={['Date', 'Patient', 'Nurse', 'Shift', 'Actions']}>
                                {handoffs.map(h => (
                                    <tr key={h.handoff_id} className="hover:bg-muted transition">
                                        <td className="p-4 text-muted-foreground">{formatDate(new Date(h.timestamp))}</td>
                                        <td className="p-4 font-medium">{h.patient_name || h.patient_id}</td>
                                        <td className="p-4 text-text-secondary">{h.nurse_name}</td>
                                        <td className="p-4 text-text-secondary uppercase text-xs font-bold">{h.shift}</td>
                                        <td className="p-4">
                                            <button onClick={() => handleDelete('handoff', h.handoff_id)} className="text-error hover:text-destructive text-sm font-medium bg-error-soft px-3 py-1 rounded">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </DataTable>
                        </div>
                    )}

                    {view === 'logs' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">Appointment Audit Logs</h2>
                            <DataTable headers={['Timestamp', 'Action', 'Performed By', 'Details', 'Appt ID']}>
                                {logs.map(log => (
                                    <tr key={log.log_id} className="hover:bg-muted transition">
                                        <td className="p-4 text-muted-foreground text-sm">{formatDate(new Date(log.timestamp))}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                log.action === 'approved' ? 'bg-success-soft text-success' :
                                                log.action === 'rejected' ? 'bg-error-soft text-error' :
                                                log.action === 'booked' ? 'bg-primary-soft text-primary' :
                                                log.action === 'completed' ? 'bg-secondary-soft text-secondary' :
                                                'bg-muted text-muted-foreground'
                                            }`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{log.performer_name || 'Unknown'}</span>
                                                <span className="text-xs text-muted-foreground capitalize">{log.performed_by_role}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-text-secondary text-sm">{log.details}</td>
                                        <td className="p-4 text-muted-foreground text-xs font-mono">{log.appointment_id}</td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-muted-foreground">No audit logs found.</td>
                                    </tr>
                                )}
                            </DataTable>
                        </div>
                    )}

                    {view === 'reports' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">System Reports & Logs</h2>
                            <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
                                <p className="text-text-secondary mb-4">Recent system handoffs and access logs.</p>
                                <div className="space-y-3">
                                    {handoffs.slice(0, 5).map(h => (
                                        <div key={h.handoff_id} className="p-4 bg-muted rounded-md border border-border flex justify-between">
                                            <span>Handoff for <strong>{h.patient_name || h.patient_id}</strong></span>
                                            <span className="text-muted-foreground text-sm">{formatDate(h.timestamp)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'procurement' && (
                        <ProcurementPanel showNotify={showNotify} refreshTrigger={procurementRefreshKey} />
                    )}

                    {view === 'vendors' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold">Vendor Management</h2>

                            {/* Pending Approval Requests */}
                            {vendors.filter(v => !v.is_approved && !v.is_rejected).length > 0 && (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-warning flex items-center gap-2">
                                        <span>⏳</span> Approval Requests
                                        <span className="bg-warning text-warning-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                                            {vendors.filter(v => !v.is_approved && !v.is_rejected).length}
                                        </span>
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {vendors.filter(v => !v.is_approved && !v.is_rejected).map((v, i) => (
                                            <div key={i} className="bg-card p-5 rounded-xl border-2 border-warning/40 hover:border-warning transition shadow-sm">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h4 className="text-lg font-bold">{v.company_name}</h4>
                                                        <p className="text-sm text-muted-foreground">{v.email}</p>
                                                    </div>
                                                    <span className="text-warning bg-warning-soft px-2 py-0.5 rounded text-xs font-bold uppercase">Pending</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-sm text-text-secondary mb-4">
                                                    <div><span className="text-muted-foreground">Contact:</span> {v.contact_person || '-'}</div>
                                                    <div><span className="text-muted-foreground">Phone:</span> {v.phone || '-'}</div>
                                                    <div><span className="text-muted-foreground">Category:</span> {v.category || 'general'}</div>
                                                    <div><span className="text-muted-foreground">GST:</span> {v.gst_number || '-'}</div>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => handleApproveVendor(v.user_id)}
                                                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary-hover transition"
                                                    >
                                                        ✓ Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectVendor(v.user_id)}
                                                        className="flex-1 px-4 py-2 bg-error-soft text-error border border-error/30 rounded-lg text-sm font-bold hover:bg-error/20 transition"
                                                    >
                                                        ✗ Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* All Vendors Table */}
                            <h3 className="text-xl font-bold">All Vendors</h3>
                            <DataTable headers={['Company', 'Contact', 'Category', 'Status', 'Actions']}>
                                {vendors.map((v, i) => (
                                    <tr key={i} className="hover:bg-muted transition">
                                        <td className="p-4 font-medium">{v.company_name}</td>
                                        <td className="p-4 text-text-secondary">
                                            {v.contact_person}<br/>
                                            <span className="text-xs text-muted-foreground">{v.email}</span>
                                        </td>
                                        <td className="p-4 text-text-secondary capitalize">{v.category || 'general'}</td>
                                        <td className="p-4">
                                            {v.is_approved ? (
                                                <span className="text-success bg-success-soft px-2 py-0.5 rounded text-xs font-bold uppercase">Approved</span>
                                            ) : v.is_rejected ? (
                                                <span className="text-error bg-error-soft px-2 py-0.5 rounded text-xs font-bold uppercase">Rejected</span>
                                            ) : (
                                                <span className="text-warning bg-warning-soft px-2 py-0.5 rounded text-xs font-bold uppercase">Pending</span>
                                            )}
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            {!v.is_approved && !v.is_rejected && (
                                                <button 
                                                    onClick={() => handleApproveVendor(v.user_id)}
                                                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary-hover transition"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleDelete('vendor', v.user_id)}
                                                className="text-error hover:text-destructive text-sm font-medium"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {vendors.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-muted-foreground">No vendors registered.</td>
                                    </tr>
                                )}
                            </DataTable>
                        </div>
                    )}

                </div>
            </main>

            {/* Notification */}
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium ${notification.type === 'error' ? 'bg-error' : 'bg-primary'}`}>
                    {notification.message}
                </div>
            )}

            {/* Create Doctor Modal */}
            {showCreateDoctor && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-popover text-popover-foreground p-8 rounded-xl w-full max-w-lg border border-border shadow-xl">
                        <h2 className="text-xl font-bold mb-6">Register New Doctor</h2>
                        <form onSubmit={handleCreateDoctor} className="space-y-4">
                            <input placeholder="Full Name" required className="w-full bg-input text-foreground border border-border p-3 rounded-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition" onChange={e => setDoctorForm({ ...doctorForm, full_name: e.target.value })} />
                            <input placeholder="Email" required className="w-full bg-input text-foreground border border-border p-3 rounded-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition" onChange={e => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                            <input placeholder="Password" type="password" required autoComplete="new-password" className="w-full bg-input text-foreground border border-border p-3 rounded-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition" onChange={e => setDoctorForm({ ...doctorForm, password: e.target.value })} />
                            <input placeholder="Specialization" className="w-full bg-input text-foreground border border-border p-3 rounded-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition" onChange={e => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
                            <input placeholder="License Number" className="w-full bg-input text-foreground border border-border p-3 rounded-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition" onChange={e => setDoctorForm({ ...doctorForm, license_number: e.target.value })} />

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowCreateDoctor(false)} className="px-4 py-2 bg-muted text-foreground rounded-md hover:bg-border transition">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary rounded-md text-primary-foreground hover:bg-primary-hover transition">Create Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfile} 
                onClose={() => setShowProfile(false)} 
                user={{...user, role: 'superadmin'}} 
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </div>
    );
};

const StatCard = ({ title, value, icon }) => (
    <div className="bg-card p-5 rounded-xl border border-border flex items-center justify-between hover:bg-muted transition shadow-sm cursor-pointer">
        <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
        </div>
        <span className="text-3xl opacity-50 grayscale hover:grayscale-0 transition">{icon}</span>
    </div>
);

export default SuperAdminDashboard;
