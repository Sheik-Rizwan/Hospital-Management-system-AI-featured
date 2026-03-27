import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate, connectSocket, getRoleAuth, clearRoleAuth } from '../utils/api';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import ProfileModal from '../components/ProfileModal';
import ChatInterface from '../components/ChatInterface';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';
import { jsPDF } from 'jspdf';


import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';

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
            const res = await fetch(`${API_BASE}/vendor/profile`, { headers: getAuthHeaders('vendor') });
            const data = await res.json();
            if (data.success && data.vendor) setUser(prev => ({ ...prev, ...data.vendor }));
        } catch (e) { }
    };

    const showNotify = (msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    useRealtimeEvents({
        'new_rfq': (data) => { showNotify(`New RFQ: ${data.item_name}`, 'info'); loadData(); },
        'new_rfq_broadcast': (data) => { showNotify('A new purchase request has been posted', 'info'); loadData(); },
        'new_purchase_order': (data) => { showNotify(`New PO: ${data.po_number}`, 'success'); loadData(); },
        'vendor_approved': (data) => { showNotify('Your vendor account has been approved!', 'success'); }
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
        } catch (error) { }
        setLoading(false);
    };

    const handleStatusUpdate = async (poId, status) => {
        try {
            const res = await fetch(`${API_BASE}/vendor/orders/${poId}/status`, {
                method: 'PUT', headers: getAuthHeaders('vendor'), body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) { showNotify(`Order updated to ${status}`, 'success'); loadData(); }
            else showNotify(data.error || 'Update failed', 'error');
        } catch (error) { showNotify('Error updating status', 'error'); }
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
                method: 'POST', headers: getAuthHeaders('vendor'), body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Quotation submitted successfully!', 'success');
                setShowQuoteModal(false);
                setQuoteForm({ request_id: '', unit_price: '', total_price: '', delivery_days: 7, validity_days: 30, notes: '' });
                setQuoteQuantity(0);
                loadData();
            } else showNotify(data.error || 'Submission failed', 'error');
        } catch (error) { showNotify('Error submitting quotation', 'error'); }
    };

    const handleLogout = () => { clearRoleAuth('vendor'); window.location.href = '/vendor-login'; };

    const generateVendorPO = async (poId) => {
        try {
            const res = await fetch(`${API_BASE}/vendor/orders/${poId}/pdf-data`, { headers: getAuthHeaders('vendor') });
            const data = await res.json();
            if (!data.success) { showNotify(data.error || 'Failed to load PO data', 'error'); return; }
            const { order, vendor } = data;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 20;
            doc.setFontSize(18); doc.setFont('helvetica', 'bold');
            doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' }); y += 10;
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            doc.text(`PO Number: ${order.po_id}`, pageWidth / 2, y, { align: 'center' }); y += 6;
            doc.text(`Date: ${formatDate(order.created_at)}`, pageWidth / 2, y, { align: 'center' }); y += 6;
            doc.text(`Status: ${order.status.toUpperCase()}`, pageWidth / 2, y, { align: 'center' }); y += 12;
            doc.setDrawColor(100); doc.line(14, y, pageWidth - 14, y); y += 8;
            doc.setFontSize(13); doc.setFont('helvetica', 'bold');
            doc.text('Vendor Details', 14, y); y += 8;
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            doc.text(`Company: ${vendor.company_name}`, 14, y); y += 6;
            doc.text(`Contact Person: ${vendor.contact_person}`, 14, y); y += 6;
            doc.text(`Phone: ${vendor.phone}`, 14, y); y += 6;
            doc.text(`Email: ${vendor.email}`, 14, y); y += 6;
            if (vendor.address) { doc.text(`Address: ${vendor.address}`, 14, y); y += 6; }
            if (vendor.gst_number) { doc.text(`GST: ${vendor.gst_number}`, 14, y); y += 6; }
            y += 6;
            doc.line(14, y, pageWidth - 14, y); y += 8;
            doc.setFontSize(13); doc.setFont('helvetica', 'bold');
            doc.text('Order Items', 14, y); y += 8;
            doc.setFontSize(10); doc.setFont('helvetica', 'bold');
            doc.text('Item', 14, y); doc.text('Qty', 90, y); doc.text('Unit Price', 115, y); doc.text('Total', 155, y);
            y += 2; doc.line(14, y, pageWidth - 14, y); y += 6;
            doc.setFont('helvetica', 'normal');
            (order.items || []).forEach(item => {
                doc.text(item.item_name || '', 14, y);
                doc.text(String(item.quantity || ''), 90, y);
                doc.text(`Rs.${(item.unit_price || 0).toLocaleString()}`, 115, y);
                doc.text(`Rs.${(item.total || 0).toLocaleString()}`, 155, y);
                y += 7;
            });
            y += 2; doc.line(14, y, pageWidth - 14, y); y += 6;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            doc.text(`Total Amount: Rs.${(order.total_amount || 0).toLocaleString()}`, 14, y); y += 6;
            if (order.department) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Department: ${order.department}`, 14, y); y += 6; }
            if (order.expected_delivery) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Expected Delivery: ${formatDate(order.expected_delivery)}`, 14, y); y += 6; }
            doc.save(`PO_${order.po_id}.pdf`);
            showNotify('PO PDF downloaded', 'success');
        } catch (e) { showNotify('Error generating PDF', 'error'); }
    };

    const sidebarItems = [
        { id: 'orders', icon: <Inventory2OutlinedIcon fontSize="small" />, label: 'My Orders' },
        { id: 'quotations', icon: <DescriptionOutlinedIcon fontSize="small" />, label: 'My Quotations' },
        { id: 'requests', icon: <InboxOutlinedIcon fontSize="small" />, label: 'Open Requests' },
        { id: 'chat', icon: <ChatBubbleOutlineIcon fontSize="small" />, label: 'Doctor Chat' },
    ];

    return (
        <DashboardLayout
            title="Vendor Portal"
            subtitle={user?.company_name || ''}
            sidebarItems={sidebarItems}
            activeView={activeTab}
            onViewChange={setActiveTab}
            user={{ ...user, role: 'vendor' }}
            onLogout={handleLogout}
            onProfileClick={() => setShowProfile(true)}
        >
            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} />
                </Box>
            )}

            {/* Orders */}
            {activeTab === 'orders' && (
                <Stack spacing={3}>
                    <PageHeader title="Purchase Orders" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>PO #</TableCell><TableCell>Item</TableCell><TableCell>Qty</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {orders.map(order => (
                                    <TableRow key={order.po_id} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{order.po_id}</TableCell>
                                        <TableCell>{order.items[0]?.item_name}</TableCell>
                                        <TableCell>{order.items[0]?.quantity}</TableCell>
                                        <TableCell><StatusChip status={order.status} /></TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                {(order.status === 'created' || order.status === 'sent') && (
                                                    <Button size="small" variant="contained" onClick={() => handleStatusUpdate(order.po_id, 'acknowledged')}>Acknowledge</Button>
                                                )}
                                                {order.status === 'acknowledged' && (
                                                    <Button size="small" variant="contained" color="secondary" onClick={() => handleStatusUpdate(order.po_id, 'shipped')}>Ship</Button>
                                                )}
                                                {order.status === 'shipped' && (
                                                    <Button size="small" variant="contained" color="success" onClick={() => handleStatusUpdate(order.po_id, 'delivered')}>Mark Delivered</Button>
                                                )}
                                                <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon fontSize="small" />} onClick={() => generateVendorPO(order.po_id)}>PO</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {orders.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No orders found.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Open Requests */}
            {activeTab === 'requests' && (
                <Stack spacing={3}>
                    <PageHeader title="Open Requests for Quotation" />
                    <Stack spacing={2}>
                        {openRequests.map(req => (
                            <Card key={req.request_id} sx={{ transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 4 } }}>
                                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight={700}>{req.item_name}</Typography>
                                        <Typography variant="body2" color="text.secondary">Qty Needed: {req.quantity} | Required by: {formatDate(req.created_at)}</Typography>
                                    </Box>
                                    <Button variant="contained" onClick={() => {
                                        setQuoteForm({ ...quoteForm, request_id: req.request_id });
                                        setQuoteQuantity(req.quantity || 0);
                                        setShowQuoteModal(true);
                                    }}>Submit Quote</Button>
                                </CardContent>
                            </Card>
                        ))}
                        {openRequests.length === 0 && <Typography color="text.secondary">No open requests available for your category.</Typography>}
                    </Stack>
                </Stack>
            )}

            {/* Quotations */}
            {activeTab === 'quotations' && (
                <Stack spacing={3}>
                    <PageHeader title="My Submitted Quotations" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Ref #</TableCell><TableCell>Request ID</TableCell><TableCell>Price</TableCell><TableCell>Status</TableCell><TableCell>Submitted On</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {quotations.map(q => (
                                    <TableRow key={q.quotation_id} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{q.quotation_id}</TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{q.request_id}</TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>{q.total_price}</TableCell>
                                        <TableCell><StatusChip status={q.status === 'accepted' ? 'approved' : q.status} /></TableCell>
                                        <TableCell sx={{ color: 'text.secondary' }}>{formatDate(q.created_at)}</TableCell>
                                    </TableRow>
                                ))}
                                {quotations.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No quotations submitted.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {/* Chat */}
            {activeTab === 'chat' && (
                <ChatInterface showNotify={showNotify} userRole="vendor" />
            )}

            {/* Quote Modal */}
            <Dialog open={showQuoteModal} onClose={() => setShowQuoteModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Submit Quotation</DialogTitle>
                <DialogContent>
                    <Box component="form" id="quote-form" onSubmit={handleSubmitQuotation} sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="Unit Price (₹)"
                            type="number"
                            inputProps={{ step: '0.01' }}
                            required
                            value={quoteForm.unit_price}
                            onChange={e => {
                                const unitPrice = e.target.value;
                                const total = quoteQuantity > 0 ? (parseFloat(unitPrice) * quoteQuantity).toFixed(2) : '';
                                setQuoteForm({ ...quoteForm, unit_price: unitPrice, total_price: total });
                            }}
                        />
                        <TextField
                            label={`Total Price (₹) — Qty: ${quoteQuantity}`}
                            type="number"
                            inputProps={{ step: '0.01' }}
                            required
                            value={quoteForm.total_price}
                            onChange={e => setQuoteForm({ ...quoteForm, total_price: e.target.value })}
                        />
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <TextField label="Delivery Days" type="number" required fullWidth value={quoteForm.delivery_days} onChange={e => setQuoteForm({ ...quoteForm, delivery_days: e.target.value })} />
                            </Grid>
                            <Grid size={6}>
                                <TextField label="Validity Days" type="number" required fullWidth value={quoteForm.validity_days} onChange={e => setQuoteForm({ ...quoteForm, validity_days: e.target.value })} />
                            </Grid>
                        </Grid>
                        <TextField label="Notes (optional)" value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} placeholder="e.g. Premium quality, bulk discount" />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowQuoteModal(false)}>Cancel</Button>
                    <Button type="submit" form="quote-form" variant="contained">Submit</Button>
                </DialogActions>
            </Dialog>

            {/* Notification */}
            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />

            {/* Profile Modal */}
            <ProfileModal
                isOpen={showProfile}
                onClose={() => setShowProfile(false)}
                user={{ ...user, role: 'vendor' }}
                onUpdate={(updatedUser) => setUser(updatedUser)}
            />
        </DashboardLayout>
    );
};

export default VendorDashboard;
