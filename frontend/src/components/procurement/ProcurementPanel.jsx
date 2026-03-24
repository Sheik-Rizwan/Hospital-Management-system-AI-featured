import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../../utils/api';
import { jsPDF } from 'jspdf';

// MUI Components
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';

// Icons
import Inventory2Icon from '@mui/icons-material/Inventory2';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import StoreIcon from '@mui/icons-material/Store';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

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
    const [creatingPO, setCreatingPO] = useState(false);

    useEffect(() => {
        loadData();
    }, [activeTab]);

    // Re-load data when refreshTrigger changes
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
            console.error('Procurement error:', error);
            if (showNotify) showNotify(`Failed to load ${activeTab}`, 'error');
        }
        setLoading(false);
    };

    const handleApproveRequest = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${id}/approve`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendor_id: selectedVendorId || undefined })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Request approved', 'success');
                setAssigningRequestId(null);
                setSelectedVendorId('');
                loadData();
            } else {
                showNotify?.(data.error || 'Approval failed', 'error');
            }
        } catch (e) { showNotify?.('Error approving request', 'error'); }
    };

    const handleRejectRequest = async (id) => {
        const reason = window.prompt('Enter rejection reason:');
        if (reason === null) return;
        try {
            const res = await fetch(`${API_BASE}/procurement/requests/${id}/reject`, {
                method: 'PUT',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'No reason provided' })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Request rejected', 'success');
                loadData();
            } else {
                showNotify?.(data.error || 'Rejection failed', 'error');
            }
        } catch (e) { showNotify?.('Error rejecting request', 'error'); }
    };

    const handleCompleteOrder = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${id}/complete`, {
                method: 'PUT',
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Order completed', 'success');
                loadData();
            } else {
                showNotify?.(data.error || 'Completion failed', 'error');
            }
        } catch (e) { showNotify?.('Error completing order', 'error'); }
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
                showNotify?.('Budget created successfully', 'success');
                setBudgetForm({ department: '', total_budget: '' });
                setShowBudgetForm(false);
                loadData();
            } else {
                showNotify?.(data.error || 'Failed to create budget', 'error');
            }
        } catch (e) { showNotify?.('Error creating budget', 'error'); }
    };

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
                showNotify?.(data.error || 'Failed to load quotations', 'error');
            }
        } catch (e) { showNotify?.('Error loading quotations', 'error'); }
        setLoadingQuotations(false);
    };

    const handleSelectQuotation = async (requestId, quotationId, deliveryDays) => {
        if (!selectedBudgetId) {
            showNotify?.('Please select a budget to deduct from', 'error');
            return;
        }
        if (creatingPO) return;
        setCreatingPO(true);
        try {
            const expectedDeliveryDate = new Date();
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + (deliveryDays || 0));
            const expectedDateString = expectedDeliveryDate.toISOString().split('T')[0];

            const res = await fetch(`${API_BASE}/procurement/requests/${requestId}/select-quotation`, {
                method: 'POST',
                headers: { ...getAuthHeaders('super_admin'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    quotation_id: quotationId, 
                    budget_id: selectedBudgetId,
                    expected_delivery: expectedDateString
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Purchase Order created successfully!', 'success');
                setViewingRequestId(null);
                setQuotations([]);
                setSelectedBudgetId('');
                loadData();
            } else {
                showNotify?.(data.error || 'Failed to create PO', 'error');
            }
        } catch (e) { showNotify?.('Error creating purchase order', 'error'); }
        setCreatingPO(false);
    };

    const generateAdminPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${poId}/pdf-data`, {
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (!data.success) { showNotify?.(data.error || 'Failed to load PO data', 'error'); return; }

            const { order, vendor, budget } = data;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;

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
            y += 8;

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
            showNotify?.('Admin PO PDF downloaded', 'success');
        } catch (e) { showNotify?.('Error generating PDF', 'error'); }
    };

    const generateVendorPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/procurement/orders/${poId}/pdf-data`, {
                headers: getAuthHeaders('super_admin')
            });
            const data = await res.json();
            if (!data.success) { showNotify?.(data.error || 'Failed to load PO data', 'error'); return; }

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

            doc.save(`PO_Vendor_${order.po_id}.pdf`);
            showNotify?.('Vendor PO PDF downloaded', 'success');
        } catch (e) { showNotify?.('Error generating PDF', 'error'); }
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <Stack spacing={3}>
            {/* Header / Tab Navigation */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" fontWeight={800}>Procurement & Supply Chain</Typography>
                <Tabs value={activeTab} onChange={handleTabChange} sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 0.5 }}>
                    <Tab value="inventory" icon={<Inventory2Icon />} label="Inventory" iconPosition="start" />
                    <Tab value="requests" icon={<RequestQuoteIcon />} label="Requests" iconPosition="start" />
                    <Tab value="vendors" icon={<StoreIcon />} label="Vendors" iconPosition="start" />
                    <Tab value="budgets" icon={<AccountBalanceWalletIcon />} label="Budgets" iconPosition="start" />
                    <Tab value="orders" icon={<ShoppingBagIcon />} label="Orders" iconPosition="start" />
                </Tabs>
            </Box>

            {loading && <LinearProgress sx={{ borderRadius: 2 }} />}

            {/* Main Content Area */}
            {!loading && (
                <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    {/* Inventory Tab */}
                    {activeTab === 'inventory' && (
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'action.hover' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Item Name</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Stock</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {inventory.map(item => (
                                        <TableRow key={item.item_id} hover>
                                            <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'text.secondary' }}>{item.sku}</TableCell>
                                            <TableCell sx={{ textTransform: 'capitalize' }}>{item.category?.replace('_', ' ')}</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>{item.quantity} {item.unit}</TableCell>
                                            <TableCell>
                                                {item.quantity <= (item.reorder_level || 10) ? (
                                                    <Chip label="Low Stock" color="error" size="small" variant="soft" />
                                                ) : (
                                                    <Chip label="In Stock" color="success" size="small" variant="soft" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {inventory.length === 0 && (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>No inventory items found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Requests Tab */}
                    {activeTab === 'requests' && (
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'action.hover' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Requester</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {requests.map(req => (
                                        <TableRow key={req.request_id} hover>
                                            <TableCell sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{formatDate(req.created_at)}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{req.item_name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{req.quantity} needed</Typography>
                                            </TableCell>
                                            <TableCell>{req.requested_by_name || req.requested_by}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={req.status} 
                                                    size="small" 
                                                    variant="soft"
                                                    color={
                                                        req.status === 'approved' ? 'success' : 
                                                        req.status === 'rejected' ? 'error' : 
                                                        req.status === 'ordered' ? 'info' : 'warning'
                                                    }
                                                    sx={{ textTransform: 'capitalize', fontWeight: 600 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {req.status === 'requested' && (
                                                    <Stack spacing={1}>
                                                        {assigningRequestId === req.request_id ? (
                                                            <Stack spacing={1}>
                                                                <FormControl size="small" fullWidth>
                                                                    <InputLabel>Select Vendor</InputLabel>
                                                                    <Select
                                                                        value={selectedVendorId}
                                                                        onChange={(e) => setSelectedVendorId(e.target.value)}
                                                                        label="Select Vendor"
                                                                    >
                                                                        <MenuItem value="">-- No vendor (RFQ) --</MenuItem>
                                                                        {approvedVendors.map(v => (
                                                                            <MenuItem key={v.user_id} value={v.user_id}>{v.company_name}</MenuItem>
                                                                        ))}
                                                                    </Select>
                                                                </FormControl>
                                                                <Stack direction="row" spacing={1}>
                                                                    <Button size="small" variant="contained" onClick={() => handleApproveRequest(req.request_id)}>Confirm</Button>
                                                                    <Button size="small" variant="outlined" onClick={() => { setAssigningRequestId(null); setSelectedVendorId(''); }}>Cancel</Button>
                                                                </Stack>
                                                            </Stack>
                                                        ) : (
                                                            <Stack direction="row" spacing={1}>
                                                                <Button size="small" variant="contained" onClick={() => setAssigningRequestId(req.request_id)}>Approve</Button>
                                                                <Button size="small" variant="outlined" color="error" onClick={() => handleRejectRequest(req.request_id)}>Reject</Button>
                                                            </Stack>
                                                        )}
                                                    </Stack>
                                                )}
                                                {req.status === 'approved' && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained" 
                                                        color="secondary"
                                                        startIcon={<DescriptionIcon />}
                                                        onClick={() => handleViewQuotations(req.request_id)}
                                                    >
                                                        View Quotations
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {requests.length === 0 && (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>No purchase requests found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Vendors Tab */}
                    {activeTab === 'vendors' && (
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'action.hover' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Contact Person</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {vendors.map(v => (
                                        <TableRow key={v.user_id} hover>
                                            <TableCell sx={{ fontWeight: 600 }}>{v.company_name}</TableCell>
                                            <TableCell>{v.contact_person}</TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>{v.email}</TableCell>
                                            <TableCell sx={{ textTransform: 'capitalize' }}>{v.category}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={v.is_approved ? 'Approved' : 'Pending'} 
                                                    color={v.is_approved ? 'success' : 'warning'}
                                                    size="small"
                                                    variant="soft"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={1}>
                                                    {!v.is_approved ? (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained" 
                                                            color="success"
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await fetch(`${API_BASE}/procurement/vendors/${v.user_id}/approve`, { method: 'PUT', headers: getAuthHeaders('super_admin') });
                                                                    const data = await res.json();
                                                                    if (data.success) { showNotify?.('Vendor approved', 'success'); loadData(); }
                                                                    else showNotify?.(data.error || 'Failed', 'error');
                                                                } catch (e) { showNotify?.('Error', 'error'); }
                                                            }}
                                                        >
                                                            Approve
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            size="small" 
                                                            variant="outlined" 
                                                            color="error"
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await fetch(`${API_BASE}/procurement/vendors/${v.user_id}/reject`, { method: 'PUT', headers: getAuthHeaders('super_admin') });
                                                                    const data = await res.json();
                                                                    if (data.success) { showNotify?.('Vendor revoked', 'success'); loadData(); }
                                                                    else showNotify?.(data.error || 'Failed', 'error');
                                                                } catch (e) { showNotify?.('Error', 'error'); }
                                                            }}
                                                        >
                                                            Revoke
                                                        </Button>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {vendors.length === 0 && (
                                        <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No vendors found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Budgets Tab */}
                    {activeTab === 'budgets' && (
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ mb: 4 }}>
                                {!showBudgetForm ? (
                                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowBudgetForm(true)}>New Budget</Button>
                                ) : (
                                    <Paper sx={{ p: 3, maxWidth: 400, border: 1, borderColor: 'divider' }}>
                                        <Typography variant="h6" sx={{ mb: 2 }}>Create Department Budget</Typography>
                                        <Stack spacing={2} component="form" onSubmit={handleCreateBudget}>
                                            <TextField label="Department" required value={budgetForm.department} onChange={e => setBudgetForm({...budgetForm, department: e.target.value})} />
                                            <TextField label="Total Budget (₹)" type="number" required value={budgetForm.total_budget} onChange={e => setBudgetForm({...budgetForm, total_budget: e.target.value})} />
                                            <Stack direction="row" spacing={1}>
                                                <Button type="submit" variant="contained">Create</Button>
                                                <Button variant="outlined" onClick={() => setShowBudgetForm(false)}>Cancel</Button>
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                )}
                            </Box>
                            <Grid container spacing={3}>
                                {budgets.map(b => (
                                    <Grid item xs={12} sm={6} lg={4} key={b.budget_id}>
                                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                            <CardContent>
                                                <Typography variant="h6" fontWeight={700}>{b.department}</Typography>
                                                <Typography variant="caption" color="text.secondary">Fiscal Year: {b.fiscal_year}</Typography>
                                                <Divider sx={{ my: 1.5 }} />
                                                <Stack spacing={1}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2">Total:</Typography>
                                                        <Typography variant="body2" fontWeight={700}>₹{b.total_budget.toLocaleString()}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2" color="error">Used:</Typography>
                                                        <Typography variant="body2" color="error">₹{b.used_budget.toLocaleString()}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="body2">Available:</Typography>
                                                        <Typography variant="body2" fontWeight={700} color="primary">₹{b.available_budget.toLocaleString()}</Typography>
                                                    </Box>
                                                    <Box sx={{ mt: 1 }}>
                                                        <LinearProgress 
                                                            variant="determinate" 
                                                            value={Math.min(b.utilization_percent, 100)} 
                                                            sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover' }} 
                                                        />
                                                        <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}>{b.utilization_percent.toFixed(1)}% Used</Typography>
                                                    </Box>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                                {budgets.length === 0 && (
                                    <Grid item xs={12}>
                                        <Typography color="text.secondary" align="center">No department budgets set.</Typography>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>
                    )}

                    {/* Orders Tab */}
                    {activeTab === 'orders' && (
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'action.hover' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>PO #</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {orders.map(o => (
                                        <TableRow key={o.po_id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{o.po_id}</TableCell>
                                            <TableCell sx={{ fontWeight: 600 }}>{o.items[0]?.item_name}</TableCell>
                                            <TableCell>{o.vendor_name || '—'}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>₹{o.total_amount?.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={o.status} 
                                                    color={o.status === 'completed' ? 'success' : o.status === 'delivered' ? 'info' : 'warning'}
                                                    variant="soft" size="small" sx={{ textTransform: 'capitalize' }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={1}>
                                                    {o.status === 'delivered' && (
                                                        <Button size="small" variant="contained" onClick={() => handleCompleteOrder(o.po_id)}>Complete</Button>
                                                    )}
                                                    <Tooltip title="Admin PO (with budget)">
                                                        <IconButton size="small" onClick={() => generateAdminPO(o.po_id)}><FileDownloadIcon color="primary" /></IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Vendor PO">
                                                        <IconButton size="small" onClick={() => generateVendorPO(o.po_id)}><DescriptionIcon color="warning" /></IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {orders.length === 0 && (
                                        <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No purchase orders found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            )}

            {/* Quotations Dialog */}
            <Dialog open={Boolean(viewingRequestId)} onClose={() => setViewingRequestId(null)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>Vendor Quotations</DialogTitle>
                <DialogContent dividers>
                    {loadingQuotations ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                    ) : quotations.length === 0 ? (
                        <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No quotations submitted by vendors yet.</Typography>
                    ) : (
                        <Stack spacing={3}>
                            <FormControl fullWidth>
                                <InputLabel>Assign Budget Cabinet</InputLabel>
                                <Select value={selectedBudgetId} onChange={(e) => setSelectedBudgetId(e.target.value)} label="Assign Budget Cabinet">
                                    <MenuItem value="">-- Select Budget --</MenuItem>
                                    {budgets.map(b => (
                                        <MenuItem key={b.budget_id} value={b.budget_id}>
                                            {b.department} (Avail: ₹{b.available_budget.toLocaleString()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Grid container spacing={2}>
                                {quotations.map(q => (
                                    <Grid item xs={12} key={q.quotation_id}>
                                        <Card variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main' } }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight={700}>{q.vendor_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">Quote ID: {q.quotation_id}</Typography>
                                                    </Box>
                                                    <Typography variant="h5" fontWeight={800} color="primary">₹{q.total_price.toLocaleString()}</Typography>
                                                </Box>
                                                <Divider sx={{ my: 1.5 }} />
                                                <Grid container spacing={2}>
                                                    <Grid item xs={6}><Typography variant="body2">Unit Price: ₹{q.unit_price}</Typography></Grid>
                                                    <Grid item xs={6}><Typography variant="body2">Delivery: {q.delivery_days} days</Typography></Grid>
                                                </Grid>
                                                {q.notes && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Notes: {q.notes}</Typography>}
                                                <Button 
                                                    fullWidth 
                                                    variant="contained" 
                                                    sx={{ mt: 2 }} 
                                                    disabled={creatingPO}
                                                    onClick={() => handleSelectQuotation(viewingRequestId, q.quotation_id, q.delivery_days)}
                                                >
                                                    Accept & Create PO
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setViewingRequestId(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default ProcurementPanel;
