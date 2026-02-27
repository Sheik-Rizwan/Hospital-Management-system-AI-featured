import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../../utils/api';
import { jsPDF } from 'jspdf';

const ProcurementPanel = ({ showNotify, refreshTrigger }) => {
    const [activeTab, setActiveTab] = useState('inventory');
    const [loading, setLoading] = useState(false);
    
    // Data States
    const [inventory, setInventory] = useState([]);
    const [requests, setRequests] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [orders, setOrders] = useState([]);

    // Approved vendors list for assignment dropdown
    const [approvedVendors, setApprovedVendors] = useState([]);

    // Track which request has the vendor dropdown open
    const [assigningRequestId, setAssigningRequestId] = useState(null);
    const [selectedVendorId, setSelectedVendorId] = useState('');

    // Budget form state
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [budgetForm, setBudgetForm] = useState({ department: '', total_budget: '' });

    // Quotation viewing state
    const [viewingRequestId, setViewingRequestId] = useState(null);
    const [quotations, setQuotations] = useState([]);
    const [loadingQuotations, setLoadingQuotations] = useState(false);
    const [selectedBudgetId, setSelectedBudgetId] = useState('');

    useEffect(() => {
        loadData();
    }, [activeTab]);

    // Re-load data when refreshTrigger changes (real-time update from socket)
    useEffect(() => {
        if (refreshTrigger > 0) loadData();
    }, [refreshTrigger]);

    const loadData = async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders('super_admin');
            let endpoint = '';
            
            switch (activeTab) {
                case 'inventory': endpoint = '/procurement/inventory'; break;
                case 'requests': endpoint = '/procurement/requests'; break;
                case 'vendors': endpoint = '/procurement/vendors'; break;
                case 'budgets': endpoint = '/procurement/budgets'; break;
                case 'orders': endpoint = '/procurement/orders'; break;
                default: return;
            }

            const res = await fetch(`${API_BASE}${endpoint}`, { headers });
            const data = await res.json();
            
            if (data.success) {
                if (activeTab === 'inventory') setInventory(data.items || []);
                if (activeTab === 'requests') setRequests(data.requests || []);
                if (activeTab === 'vendors') setVendors(data.vendors || []);
                if (activeTab === 'budgets') setBudgets(data.budgets || []);
                if (activeTab === 'orders') setOrders(data.orders || []);
            }

            // Also load approved vendors and budgets when viewing requests
            if (activeTab === 'requests') {
                const vendorRes = await fetch(`${API_BASE}/procurement/vendors?approved=true`, { headers });
                const vendorData = await vendorRes.json();
                if (vendorData.success) {
                    setApprovedVendors(vendorData.vendors || []);
                }
                const budgetRes = await fetch(`${API_BASE}/procurement/budgets`, { headers });
                const budgetData = await budgetRes.json();
                if (budgetData.success) {
                    setBudgets(budgetData.budgets || []);
                }
            }
        } catch (error) {
            if (showNotify) showNotify(`Failed to load ${activeTab}`, 'error');
        }
        setLoading(false);
    };

    // --- Action Handlers ---

    const handleApproveRequest = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${id}/approve`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendor_id: selectedVendorId || undefined })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Request approved', 'success');
                setAssigningRequestId(null);
                setSelectedVendorId('');
                loadData();
            } else {
                showNotify(data.error || 'Approval failed', 'error');
            }
        } catch (e) { showNotify('Error approving request', 'error'); }
    };

    const handleRejectRequest = async (id) => {
        const reason = prompt('Enter rejection reason:');
        if (reason === null) return; // User cancelled
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${id}/reject`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'No reason provided' })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Request rejected', 'success');
                loadData();
            } else {
                showNotify(data.error || 'Rejection failed', 'error');
            }
        } catch (e) { showNotify('Error rejecting request', 'error'); }
    };

    const handleCompleteOrder = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${id}/complete`, {
                method: 'PUT',
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Order completed', 'success');
                loadData();
            } else {
                showNotify(data.error || 'Completion failed', 'error');
            }
        } catch (e) { showNotify('Error completing order', 'error'); }
    };

    const handleCreateBudget = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/procurement/budgets`, {
                method: 'POST',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    department: budgetForm.department,
                    total_budget: parseFloat(budgetForm.total_budget)
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Budget created successfully', 'success');
                setBudgetForm({ department: '', total_budget: '' });
                setShowBudgetForm(false);
                loadData();
            } else {
                showNotify(data.error || 'Failed to create budget', 'error');
            }
        } catch (e) { showNotify('Error creating budget', 'error'); }
    };

    // Fetch quotations for a request
    const handleViewQuotations = async (requestId) => {
        setViewingRequestId(requestId);
        setLoadingQuotations(true);
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${requestId}/quotations`, {
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (data.success) {
                setQuotations(data.quotations || []);
            } else {
                showNotify(data.error || 'Failed to load quotations', 'error');
            }
        } catch (e) { showNotify('Error loading quotations', 'error'); }
        setLoadingQuotations(false);
    };

    // Select a quotation to create a Purchase Order
    const handleSelectQuotation = async (requestId, quotationId) => {
        if (!selectedBudgetId) {
            showNotify('Please select a budget to deduct from', 'error');
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${requestId}/select-quotation`, {
                method: 'POST',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotation_id: quotationId, budget_id: selectedBudgetId })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Purchase Order created successfully!', 'success');
                setViewingRequestId(null);
                setQuotations([]);
                setSelectedBudgetId('');
                loadData();
            } else {
                showNotify(data.error || 'Failed to create PO', 'error');
            }
        } catch (e) { showNotify('Error creating purchase order', 'error'); }
    };

    // Generate Admin PO PDF (with budget details)
    const generateAdminPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${poId}/pdf-data`, {
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (!data.success) { showNotify(data.error || 'Failed to load PO data', 'error'); return; }

            const { order, vendor, budget } = data;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('PURCHASE ORDER (Admin Copy)', pageWidth / 2, y, { align: 'center' });
            y += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`PO Number: ${order.po_id}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Date: ${formatDate(order.created_at)}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            doc.text(`Status: ${order.status.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 12;

            // Vendor Info
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

            // Items Table
            doc.line(14, y, pageWidth - 14, y);
            y += 8;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('Order Items', 14, y);
            y += 8;

            // Table header
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Item', 14, y);
            doc.text('Qty', 90, y);
            doc.text('Unit Price', 115, y);
            doc.text('Total', 155, y);
            y += 2;
            doc.line(14, y, pageWidth - 14, y);
            y += 6;

            // Table rows
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

            // Total
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(`Total Amount: Rs.${(order.total_amount || 0).toLocaleString()}`, 14, y);
            y += 6;
            if (order.department) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Department: ${order.department}`, 14, y); y += 6; }
            y += 8;

            // Budget Summary (Admin only)
            if (budget) {
                doc.line(14, y, pageWidth - 14, y);
                y += 8;
                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.text('Budget Summary', 14, y);
                y += 8;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(`Department: ${budget.department}`, 14, y); y += 6;
                doc.text(`Fiscal Year: ${budget.fiscal_year}`, 14, y); y += 6;
                doc.text(`Total Budget: Rs.${(budget.total_budget || 0).toLocaleString()}`, 14, y); y += 6;
                doc.text(`Consumed Amount: Rs.${(budget.consumed_amount || 0).toLocaleString()}`, 14, y); y += 6;
                doc.text(`Remaining Amount: Rs.${(budget.remaining_amount || 0).toLocaleString()}`, 14, y); y += 6;
            }

            doc.save(`PO_Admin_${order.po_id}.pdf`);
            showNotify('Admin PO PDF downloaded', 'success');
        } catch (e) { showNotify('Error generating PDF', 'error'); }
    };

    // Generate Vendor PO PDF (no budget details)
    const generateVendorPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${poId}/pdf-data`, {
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (!data.success) { showNotify(data.error || 'Failed to load PO data', 'error'); return; }

            const { order, vendor } = data;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

            // Title
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

            // Vendor Info
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

            // Items Table
            doc.line(14, y, pageWidth - 14, y);
            y += 8;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('Order Items', 14, y);
            y += 8;

            // Table header
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Item', 14, y);
            doc.text('Qty', 90, y);
            doc.text('Unit Price', 115, y);
            doc.text('Total', 155, y);
            y += 2;
            doc.line(14, y, pageWidth - 14, y);
            y += 6;

            // Table rows
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

            // Total
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(`Total Amount: Rs.${(order.total_amount || 0).toLocaleString()}`, 14, y);
            y += 6;
            if (order.department) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Department: ${order.department}`, 14, y); y += 6; }
            if (order.expected_delivery) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Expected Delivery: ${formatDate(order.expected_delivery)}`, 14, y); y += 6; }

            doc.save(`PO_Vendor_${order.po_id}.pdf`);
            showNotify('Vendor PO PDF downloaded', 'success');
        } catch (e) { showNotify('Error generating PDF', 'error'); }
    };

    // --- Render Helpers ---

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-foreground">Procurement Management</h2>
                <div className="flex gap-2 bg-card p-1 rounded-lg">
                    {['inventory', 'requests', 'vendors', 'budgets', 'orders'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-md capitalize transition ${activeTab === tab ? 'bg-card text-white shadow' : 'text-muted-foreground hover:text-white'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="text-center text-muted-foreground py-8">Loading data...</div>}

            {!loading && (
                <div className="bg-card rounded-lg border border-border overflow-hidden min-h-[400px]">
                    {/* Inventory Tab */}
                    {activeTab === 'inventory' && (
                        <table className="w-full text-left">
                            <thead className="bg-sidebar text-muted-foreground text-sm uppercase">
                                <tr>
                                    <th className="p-4">Item Name</th>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Stock</th>
                                    <th className="p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#565869]">
                                {inventory.map(item => (
                                    <tr key={item.item_id} className="hover:bg-muted">
                                        <td className="p-4 font-medium">{item.name}</td>
                                        <td className="p-4 text-sm font-mono text-muted-foreground">{item.sku}</td>
                                        <td className="p-4 text-text-secondary">{item.category}</td>
                                        <td className="p-4 font-bold">{item.quantity} {item.unit}</td>
                                        <td className="p-4">
                                            {item.quantity <= item.reorder_level ? (
                                                <span className="text-error text-xs font-bold uppercase bg-red-900/30 px-2 py-1 rounded">Low Stock</span>
                                            ) : (
                                                <span className="text-success text-xs font-bold uppercase bg-green-900/30 px-2 py-1 rounded">In Stock</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {inventory.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No inventory items found.</td></tr>}
                            </tbody>
                        </table>
                    )}

                    {/* Requests Tab */}
                    {activeTab === 'requests' && (
                        <table className="w-full text-left">
                            <thead className="bg-sidebar text-muted-foreground text-sm uppercase">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Item</th>
                                    <th className="p-4">Requester</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#565869]">
                                {requests.map(req => (
                                    <tr key={req.request_id} className="hover:bg-muted">
                                        <td className="p-4 text-sm text-muted-foreground">{formatDate(req.created_at)}</td>
                                        <td className="p-4 font-medium">
                                            {req.item_name}
                                            <span className="block text-xs text-muted-foreground">{req.quantity} needed</span>
                                        </td>
                                        <td className="p-4 text-text-secondary">{req.requested_by_name || req.requested_by}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                                                req.status === 'approved' ? 'bg-green-900/30 text-success' :
                                                req.status === 'rejected' ? 'bg-red-900/30 text-error' :
                                                req.status === 'ordered' ? 'bg-blue-900/30 text-blue-400' :
                                                'bg-yellow-900/30 text-yellow-400'
                                            }`}>
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {req.status === 'requested' && (
                                                <div className="flex flex-col gap-2">
                                                    {assigningRequestId === req.request_id ? (
                                                        <div className="flex flex-col gap-2">
                                                            <select
                                                                value={selectedVendorId}
                                                                onChange={(e) => setSelectedVendorId(e.target.value)}
                                                                className="bg-card text-white text-xs px-2 py-1 rounded border border-border"
                                                            >
                                                                <option value="">-- No vendor (RFQ to all) --</option>
                                                                {approvedVendors.map(v => (
                                                                    <option key={v.user_id} value={v.user_id}>
                                                                        {v.company_name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => handleApproveRequest(req.request_id)}
                                                                    className="bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded text-xs transition"
                                                                >
                                                                    Confirm
                                                                </button>
                                                                <button
                                                                    onClick={() => { setAssigningRequestId(null); setSelectedVendorId(''); }}
                                                                    className="bg-[#565869] hover:bg-[#6E6E80] text-white px-3 py-1 rounded text-xs transition"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => setAssigningRequestId(req.request_id)}
                                                                className="bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded text-xs transition"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleRejectRequest(req.request_id)}
                                                                className="bg-error hover:bg-[#DC2626] text-white px-3 py-1 rounded text-xs transition"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {req.status === 'approved' && (
                                                <button
                                                    onClick={() => handleViewQuotations(req.request_id)}
                                                    className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-3 py-1 rounded text-xs transition"
                                                >
                                                    📋 View Quotations
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {requests.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-muted-foreground">No purchase requests found.</td></tr>}
                            </tbody>
                        </table>
                    )}

                    {/* Vendors Tab */}
                    {activeTab === 'vendors' && (
                        <table className="w-full text-left">
                            <thead className="bg-sidebar text-muted-foreground text-sm uppercase">
                                <tr>
                                    <th className="p-4">Company</th>
                                    <th className="p-4">Contact Person</th>
                                    <th className="p-4">Email</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#565869]">
                                {vendors.map(v => (
                                    <tr key={v.user_id} className="hover:bg-muted">
                                        <td className="p-4 font-medium">{v.company_name}</td>
                                        <td className="p-4 text-text-secondary">{v.contact_person}</td>
                                        <td className="p-4 text-muted-foreground">{v.email}</td>
                                        <td className="p-4 capitalize">{v.category}</td>
                                        <td className="p-4">
                                            {v.is_approved ? (
                                                <span className="text-success text-xs font-bold uppercase bg-green-900/30 px-2 py-1 rounded">Approved</span>
                                            ) : (
                                                <span className="text-yellow-400 text-xs font-bold uppercase bg-yellow-900/30 px-2 py-1 rounded">Pending</span>
                                            )}
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            {!v.is_approved && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch(`${API_BASE}/procurement/vendors/${v.user_id}/approve`, {
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
                                                        } catch (e) { showNotify('Error approving vendor', 'error'); }
                                                    }}
                                                    className="bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded text-xs transition"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch(`${API_BASE}/procurement/vendors/${v.user_id}/reject`, {
                                                            method: 'PUT',
                                                            headers: getAuthHeaders('super_admin')
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            showNotify('Vendor rejected', 'success');
                                                            loadData();
                                                        } else {
                                                            showNotify(data.error || 'Rejection failed', 'error');
                                                        }
                                                    } catch (e) { showNotify('Error rejecting vendor', 'error'); }
                                                }}
                                                className={`px-3 py-1 rounded text-xs transition text-white ${v.is_approved ? 'bg-error hover:bg-[#DC2626]' : 'bg-error hover:bg-[#DC2626]'}`}
                                            >
                                                {v.is_approved ? 'Revoke' : 'Reject'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {vendors.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-muted-foreground">No vendors registered.</td></tr>}
                            </tbody>
                        </table>
                    )}

                    {/* Budgets Tab */}
                    {activeTab === 'budgets' && (
                        <div className="p-6">
                            {/* Create Budget Button / Form */}
                            <div className="mb-6">
                                {!showBudgetForm ? (
                                    <button
                                        onClick={() => setShowBudgetForm(true)}
                                        className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg transition font-medium"
                                    >
                                        + Create New Budget
                                    </button>
                                ) : (
                                    <form onSubmit={handleCreateBudget} className="bg-card p-5 rounded-lg border border-border max-w-md">
                                        <h3 className="text-lg font-bold mb-4">Create Department Budget</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm text-muted-foreground mb-1">Department Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. Surgery, ICU, Pharmacy"
                                                    className="w-full bg-sidebar border border-border rounded p-2 text-white"
                                                    value={budgetForm.department}
                                                    onChange={e => setBudgetForm({...budgetForm, department: e.target.value})}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-muted-foreground mb-1">Total Budget (₹)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    placeholder="e.g. 500000"
                                                    className="w-full bg-sidebar border border-border rounded p-2 text-white"
                                                    value={budgetForm.total_budget}
                                                    onChange={e => setBudgetForm({...budgetForm, total_budget: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-4">
                                            <button type="submit" className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded transition">
                                                Create Budget
                                            </button>
                                            <button type="button" onClick={() => { setShowBudgetForm(false); setBudgetForm({ department: '', total_budget: '' }); }} className="bg-[#565869] hover:bg-[#6E6E80] text-white px-4 py-2 rounded transition">
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>

                            {/* Budget Cards */}
                            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                {budgets.map(b => (
                                    <div key={b.budget_id} className="bg-card p-5 rounded border border-border">
                                        <h3 className="text-lg font-bold mb-1">{b.department}</h3>
                                        <p className="text-xs text-muted-foreground mb-4">Fiscal Year: {b.fiscal_year}</p>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span>Total Budget:</span>
                                                <span className="font-mono font-bold">₹{b.total_budget.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm text-[#EF4444]">
                                                <span>Used:</span>
                                                <span className="font-mono">₹{b.used_budget.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm text-yellow-400">
                                                <span>Reserved:</span>
                                                <span className="font-mono">₹{b.reserved_budget.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm text-primary">
                                                <span>Available:</span>
                                                <span className="font-mono font-bold">₹{b.available_budget.toLocaleString()}</span>
                                            </div>

                                            <div className="w-full bg-[#565869] h-2 rounded-full overflow-hidden mt-2">
                                                <div 
                                                    className="bg-primary h-full" 
                                                    style={{ width: `${Math.min(b.utilization_percent, 100)}%` }}
                                                />
                                            </div>
                                            <p className="text-xs text-right text-muted-foreground">{b.utilization_percent.toFixed(1)}% Used</p>
                                        </div>
                                    </div>
                                ))}
                                {budgets.length === 0 && <p className="col-span-3 text-center text-muted-foreground">No department budgets set. Create one above.</p>}
                            </div>
                        </div>
                    )}

                    {/* Orders Tab */}
                    {activeTab === 'orders' && (
                        <table className="w-full text-left">
                            <thead className="bg-sidebar text-muted-foreground text-sm uppercase">
                                <tr>
                                    <th className="p-4">PO #</th>
                                    <th className="p-4">Item</th>
                                    <th className="p-4">Vendor</th>
                                    <th className="p-4">Amount</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#565869]">
                                {orders.map(o => (
                                    <tr key={o.po_id} className="hover:bg-muted">
                                        <td className="p-4 font-mono text-sm">{o.po_id}</td>
                                        <td className="p-4 font-medium">{o.items[0]?.item_name}</td>
                                        <td className="p-4 text-text-secondary">{o.vendor_name || 'Unknown Vendor'}</td>
                                        <td className="p-4 font-mono font-bold text-primary">₹{o.total_amount?.toLocaleString() || '0'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                                                o.status === 'completed' ? 'bg-green-900/30 text-success' :
                                                o.status === 'delivered' ? 'bg-blue-900/30 text-blue-400' :
                                                'bg-yellow-900/30 text-yellow-400'
                                            }`}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            {o.status === 'delivered' && (
                                                <button 
                                                    onClick={() => handleCompleteOrder(o.po_id)}
                                                    className="bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded text-xs transition"
                                                >
                                                    Mark Complete
                                                </button>
                                            )}
                                            <button
                                                onClick={() => generateAdminPO(o.po_id)}
                                                className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-3 py-1 rounded text-xs transition"
                                                title="Download Admin PO with budget details"
                                            >
                                                📄 Admin PO
                                            </button>
                                            <button
                                                onClick={() => generateVendorPO(o.po_id)}
                                                className="bg-[#F59E0B] hover:bg-[#D97706] text-white px-3 py-1 rounded text-xs transition"
                                                title="Download Vendor PO (no budget info)"
                                            >
                                                📄 Vendor PO
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {orders.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-muted-foreground">No purchase orders found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Quotation Selection Modal */}
            {viewingRequestId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-sidebar p-6 rounded-xl w-full max-w-2xl border border-border shadow-2xl max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Vendor Quotations</h2>
                            <button
                                onClick={() => { setViewingRequestId(null); setQuotations([]); setSelectedBudgetId(''); }}
                                className="text-muted-foreground hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        {/* Budget Selection */}
                        <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                            <label className="block text-sm text-muted-foreground mb-2 font-medium">💰 Select Budget to Deduct From</label>
                            <select
                                value={selectedBudgetId}
                                onChange={(e) => setSelectedBudgetId(e.target.value)}
                                className="w-full bg-sidebar text-white px-3 py-2 rounded border border-border text-sm"
                            >
                                <option value="">-- Choose a budget --</option>
                                {budgets.map(b => (
                                    <option key={b.budget_id} value={b.budget_id}>
                                        {b.department} — Available: ₹{(b.total_budget - (b.used_budget || 0) - (b.reserved_budget || 0)).toLocaleString()}
                                    </option>
                                ))}
                            </select>
                            {!selectedBudgetId && <p className="text-yellow-400 text-xs mt-1">⚠ You must select a budget before creating a PO</p>}
                        </div>

                        {loadingQuotations && <p className="text-center text-muted-foreground py-8">Loading quotations...</p>}

                        {!loadingQuotations && quotations.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">No quotations submitted yet for this request.</p>
                        )}

                        {!loadingQuotations && quotations.length > 0 && (
                            <div className="space-y-4">
                                {quotations.map((q, index) => (
                                    <div key={q.quotation_id} className={`bg-card p-4 rounded-lg border ${index === 0 ? 'border-primary' : 'border-border'}`}>
                                        {index === 0 && <span className="text-primary text-xs font-bold uppercase mb-2 block">💰 Best Price</span>}
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                {/* Vendor Identity */}
                                                <h3 className="font-bold text-lg">{q.vendor_contact || q.vendor_name || 'Unknown Vendor'}</h3>
                                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                                                    {q.vendor_company && <span>🏢 {q.vendor_company}</span>}
                                                    {q.vendor_email && <span>✉️ {q.vendor_email}</span>}
                                                    {q.vendor_phone && <span>📞 {q.vendor_phone}</span>}
                                                </div>
                                                {/* Pricing */}
                                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-sm">
                                                    <p><span className="text-muted-foreground">Unit Price:</span> <span className="font-mono font-bold">₹{q.unit_price?.toLocaleString()}</span></p>
                                                    <p><span className="text-muted-foreground">Total Price:</span> <span className="font-mono font-bold text-primary">₹{q.total_price?.toLocaleString()}</span></p>
                                                    <p><span className="text-muted-foreground">Delivery:</span> {q.delivery_days} days</p>
                                                    <p><span className="text-muted-foreground">Valid for:</span> {q.validity_days} days</p>
                                                </div>
                                                {q.notes && <p className="text-xs text-muted-foreground mt-2 italic">📝 {q.notes}</p>}
                                            </div>
                                            <button
                                                onClick={() => handleSelectQuotation(viewingRequestId, q.quotation_id)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ml-4 text-white ${selectedBudgetId ? 'bg-primary hover:bg-primary-hover' : 'bg-gray-600 cursor-not-allowed'}`}
                                                disabled={!selectedBudgetId}
                                            >
                                                Select & Create PO
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcurementPanel;
