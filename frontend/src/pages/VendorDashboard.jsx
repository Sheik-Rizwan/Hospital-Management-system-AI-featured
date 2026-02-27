import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate, connectSocket, getRoleAuth, clearRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ProfileModal from '../components/ProfileModal';
import ChatInterface from '../components/ChatInterface';
import ThemeToggle from '../components/ThemeToggle';
import { jsPDF } from 'jspdf';

const VendorDashboard = () => {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showProfile, setShowProfile] = useState(false);

    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [quoteForm, setQuoteForm] = useState({ request_id: '', unit_price: '', total_price: '', delivery_days: 7, validity_days: 30, notes: '' });
    const [quoteQuantity, setQuoteQuantity] = useState(0);
    const [openRequests, setOpenRequests] = useState([]);

    useEffect(() => {
        const { user: u } = getRoleAuth('vendor');
        if (u) setUser(u);
        connectSocket('vendor');
        loadData();
        fetchVendorProfile();
    }, []);

    const fetchVendorProfile = async () => {
        try {
            const res = await fetch(`${API_BASE}/vendor/profile`, {
                headers: getAuthHeaders('vendor')
            });
            const data = await res.json();
            if (data.success && data.vendor) {
                setUser(prev => ({ ...prev, ...data.vendor }));
            }
        } catch (e) {
        }
    };

    const showNotify = (msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    useRealtimeEvents({
        'new_rfq': (data) => { showNotify(`📢 New RFQ: ${data.item_name}`, 'info'); loadData(); },
        'new_rfq_broadcast': (data) => { showNotify('📢 A new purchase request has been posted', 'info'); loadData(); },
        'new_purchase_order': (data) => { showNotify(`🎉 New PO: ${data.po_number}`, 'success'); loadData(); },
        'vendor_approved': (data) => { showNotify('✅ Your vendor account has been approved!', 'success'); }
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders('vendor');
            const oRes = await fetch(`${API_BASE}/vendor/orders`, { headers });
            const oData = await oRes.json();
            if (oData.success) setOrders(oData.orders || []);

            const qRes = await fetch(`${API_BASE}/vendor/quotations`, { headers });
            const qData = await qRes.json();
            if (qData.success) setQuotations(qData.quotations || []);

            const dRes = await fetch(`${API_BASE}/vendor/dashboard`, { headers });
            const dData = await dRes.json();
            if (dData.success) setOpenRequests(dData.open_requests || []);
        } catch (error) {
        }
        setLoading(false);
    };

    const handleStatusUpdate = async (poId, status) => {
        try {
            const res = await fetch(`${API_BASE}/vendor/orders/${poId}/status`, {
                method: 'PUT',
                headers: getAuthHeaders('vendor'),
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`Order updated to ${status}`, 'success');
                loadData();
            } else {
                showNotify(data.error || 'Update failed', 'error');
            }
        } catch (error) {
            showNotify('Error updating status', 'error');
        }
    };

    const handleSubmitQuotation = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                request_id: quoteForm.request_id,
                unit_price: parseFloat(quoteForm.unit_price),
                total_price: parseFloat(quoteForm.total_price),
                delivery_days: parseInt(quoteForm.delivery_days) || 7,
                validity_days: parseInt(quoteForm.validity_days) || 30,
                notes: quoteForm.notes || ''
            };
            const res = await fetch(`${API_BASE}/vendor/quotations`, {
                method: 'POST',
                headers: getAuthHeaders('vendor'),
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Quotation submitted successfully!', 'success');
                setShowQuoteModal(false);
                setQuoteForm({ request_id: '', unit_price: '', total_price: '', delivery_days: 7, validity_days: 30, notes: '' });
                setQuoteQuantity(0);
                loadData();
            } else {
                showNotify(data.error || 'Submission failed', 'error');
            }
        } catch (error) {
            showNotify('Error submitting quotation', 'error');
        }
    };

    const handleLogout = () => {
        clearRoleAuth('vendor');
        window.location.href = '/vendor-login';
    };

    const generateVendorPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/vendor/orders/${poId}/pdf-data`, {
                headers: getAuthHeaders('vendor')
            });
            const data = await res.json();
            if (!data.success) { showNotify(data.error || 'Failed to load PO data', 'error'); return; }

            const { order, vendor } = data;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' });
            y += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`PO Number: ${order.po_id}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Date: ${formatDate(order.created_at)}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Status: ${order.status.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 12;

            doc.setDrawColor(100);
            doc.line(14, y, pageWidth - 14, y);
            y += 8;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('Vendor Details', 14, y);
            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Company: ${vendor.company_name}`, 14, y); y += 6;
            doc.text(`Contact Person: ${vendor.contact_person}`, 14, y); y += 6;
            doc.text(`Phone: ${vendor.phone}`, 14, y); y += 6;
            doc.text(`Email: ${vendor.email}`, 14, y); y += 6;
            if (vendor.address) { doc.text(`Address: ${vendor.address}`, 14, y); y += 6; }
            if (vendor.gst_number) { doc.text(`GST: ${vendor.gst_number}`, 14, y); y += 6; }
            y += 6;

            doc.line(14, y, pageWidth - 14, y);
            y += 8;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('Order Items', 14, y);
            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Item', 14, y);
            doc.text('Qty', 90, y);
            doc.text('Unit Price', 115, y);
            doc.text('Total', 155, y);
            y += 2;
            doc.line(14, y, pageWidth - 14, y);
            y += 6;

            doc.setFont('helvetica', 'normal');
            (order.items || []).forEach(item => {
                doc.text(item.item_name || '', 14, y);
                doc.text(String(item.quantity || ''), 90, y);
                doc.text(`Rs.${(item.unit_price || 0).toLocaleString()}`, 115, y);
                doc.text(`Rs.${(item.total || 0).toLocaleString()}`, 155, y);
                y += 7;
            });
            y += 2;
            doc.line(14, y, pageWidth - 14, y);
            y += 6;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(`Total Amount: Rs.${(order.total_amount || 0).toLocaleString()}`, 14, y);
            y += 6;
            if (order.department) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Department: ${order.department}`, 14, y); y += 6; }
            if (order.expected_delivery) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Expected Delivery: ${formatDate(order.expected_delivery)}`, 14, y); y += 6; }

            doc.save(`PO_${order.po_id}.pdf`);
            showNotify('PO PDF downloaded', 'success');
        } catch (e) { showNotify('Error generating PDF', 'error'); }
    };

    return (
        <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Sidebar */}
            <aside className="w-[260px] bg-sidebar flex flex-col border-r border-border">
                <div className="p-4 border-b border-border">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span>🚚</span> Vendor Portal
                    </h1>
                    <p className="text-sm font-semibold text-text-secondary mt-2 truncate">{user?.contact_person || user?.full_name || 'Vendor'}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">🏢 {user?.company_name || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">✉️ {user?.email || 'N/A'}</p>
                </div>

                <nav className="flex-1 p-2 space-y-1">
                    {[
                        { id: 'orders', icon: '📦', label: 'My Orders' },
                        { id: 'quotations', icon: '📄', label: 'My Quotations' },
                        { id: 'requests', icon: '📢', label: 'Open Requests' },
                        { id: 'chat', icon: '💬', label: 'Doctor Chat' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition ${
                                activeTab === item.id
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
            <main className="flex-1 overflow-y-auto p-8 bg-background relative">
                <div className="absolute top-4 right-4 z-50">
                    <ThemeToggle />
                </div>
                {loading && <div className="text-center text-muted-foreground">Loading data...</div>}

                {/* Orders View */}
                {activeTab === 'orders' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Purchase Orders</h2>
                        <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-surface border-b border-border">
                                    <tr>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">PO #</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Item</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Qty</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Status</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {orders.map(order => (
                                        <tr key={order.po_id} className="hover:bg-muted transition">
                                            <td className="p-4 font-mono text-sm">{order.po_id}</td>
                                            <td className="p-4">{order.items[0]?.item_name}</td>
                                            <td className="p-4">{order.items[0]?.quantity}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                                                    order.status === 'delivered' ? 'bg-success-soft text-success' :
                                                    order.status === 'shipped' ? 'bg-primary-soft text-primary' :
                                                    'bg-warning-soft text-warning'
                                                }`}>
                                                    {order.status}
                                                </span>
                                            </td>
                                            <td className="p-4 flex gap-2">
                                                {(order.status === 'created' || order.status === 'sent') && (
                                                    <button onClick={() => handleStatusUpdate(order.po_id, 'acknowledged')} className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary-hover transition">Acknowledge</button>
                                                )}
                                                {order.status === 'acknowledged' && (
                                                    <button onClick={() => handleStatusUpdate(order.po_id, 'shipped')} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary-hover transition">Ship</button>
                                                )}
                                                {order.status === 'shipped' && (
                                                    <button onClick={() => handleStatusUpdate(order.po_id, 'delivered')} className="text-xs bg-success text-success-foreground px-2 py-1 rounded hover:opacity-90 transition">Mark Delivered</button>
                                                )}
                                                <button
                                                    onClick={() => generateVendorPO(order.po_id)}
                                                    className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary-hover transition"
                                                    title="Download PO PDF"
                                                >
                                                    📄 PO
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {orders.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No orders found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Requests View */}
                {activeTab === 'requests' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Open Requests for Quotation</h2>
                        <div className="grid gap-4">
                            {openRequests.map(req => (
                                <div key={req.request_id} className="bg-card p-4 rounded-lg border border-border flex justify-between items-center shadow-sm hover:shadow-md transition">
                                    <div>
                                        <h3 className="font-bold text-lg">{req.item_name}</h3>
                                        <p className="text-muted-foreground text-sm">Qty Needed: {req.quantity} | Required by: {formatDate(req.created_at)}</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setQuoteForm({ ...quoteForm, request_id: req.request_id });
                                            setQuoteQuantity(req.quantity || 0);
                                            setShowQuoteModal(true);
                                        }}
                                        className="bg-primary hover:bg-primary-hover px-4 py-2 rounded text-primary-foreground font-medium transition"
                                    >
                                        Submit Quote
                                    </button>
                                </div>
                            ))}
                            {openRequests.length === 0 && <p className="text-muted-foreground">No open requests available for your category.</p>}
                        </div>
                    </div>
                )}

                {/* Quotations View */}
                {activeTab === 'quotations' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">My Submitted Quotations</h2>
                        <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-surface border-b border-border">
                                    <tr>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Ref #</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Request ID</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Price</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Status</th>
                                        <th className="p-4 text-xs uppercase text-muted-foreground font-semibold">Submitted On</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {quotations.map(q => (
                                        <tr key={q.quotation_id} className="hover:bg-muted transition">
                                            <td className="p-4 font-mono text-sm">{q.quotation_id}</td>
                                            <td className="p-4 font-mono text-sm">{q.request_id}</td>
                                            <td className="p-4 font-bold text-primary">{q.total_price}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                                                    q.status === 'accepted' ? 'bg-success-soft text-success' :
                                                    q.status === 'rejected' ? 'bg-error-soft text-error' :
                                                    'bg-muted text-muted-foreground'
                                                }`}>
                                                    {q.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-muted-foreground">{formatDate(q.created_at)}</td>
                                        </tr>
                                    ))}
                                    {quotations.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No quotations submitted.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Doctor Chat View */}
                {activeTab === 'chat' && (
                    <ChatInterface showNotify={showNotify} userRole="vendor" />
                )}
            </main>

            {/* Notification */}
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium ${notification.type === 'error' ? 'bg-error' : 'bg-primary'}`}>
                    {notification.message}
                </div>
            )}

            {/* Quote Modal */}
            {showQuoteModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-popover text-popover-foreground p-6 rounded-xl w-full max-w-md border border-border shadow-xl">
                        <h2 className="text-xl font-bold mb-4">Submit Quotation</h2>
                        <form onSubmit={handleSubmitQuotation} className="space-y-4">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Unit Price (₹)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    required 
                                    className="w-full bg-input border border-border rounded-md p-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition"
                                    value={quoteForm.unit_price}
                                    onChange={e => {
                                        const unitPrice = e.target.value;
                                        const total = quoteQuantity > 0 ? (parseFloat(unitPrice) * quoteQuantity).toFixed(2) : '';
                                        setQuoteForm({...quoteForm, unit_price: unitPrice, total_price: total});
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Total Price (₹) — Qty: {quoteQuantity}</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    required 
                                    className="w-full bg-input border border-border rounded-md p-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition"
                                    value={quoteForm.total_price}
                                    onChange={e => setQuoteForm({...quoteForm, total_price: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1">Delivery Days</label>
                                    <input 
                                        type="number" 
                                        required 
                                        className="w-full bg-input border border-border rounded-md p-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition"
                                        value={quoteForm.delivery_days}
                                        onChange={e => setQuoteForm({...quoteForm, delivery_days: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-muted-foreground mb-1">Validity Days</label>
                                    <input 
                                        type="number" 
                                        required 
                                        className="w-full bg-input border border-border rounded-md p-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition"
                                        value={quoteForm.validity_days}
                                        onChange={e => setQuoteForm({...quoteForm, validity_days: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Notes (optional)</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-input border border-border rounded-md p-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition"
                                    value={quoteForm.notes}
                                    onChange={e => setQuoteForm({...quoteForm, notes: e.target.value})}
                                    placeholder="e.g. Premium quality, bulk discount"
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => setShowQuoteModal(false)} className="px-4 py-2 bg-muted text-foreground rounded-md hover:bg-border transition">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition">Submit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfile} 
                onClose={() => setShowProfile(false)} 
                user={{...user, role: 'vendor'}} 
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </div>
    );
};

export default VendorDashboard;
