import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../../utils/api';

// MUI Components

import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DeviceThermostatOutlinedIcon from '@mui/icons-material/DeviceThermostatOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

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
import InputAdornment from '@mui/material/InputAdornment';

// Icons
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import HistoryIcon from '@mui/icons-material/History';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MedicationIcon from '@mui/icons-material/Medication';
import ScienceIcon from '@mui/icons-material/Science';
import ConstructionIcon from '@mui/icons-material/Construction';
import PageHeader from '../ui/PageHeader';

const CATEGORIES = [
    { key: 'general_supplies', label: 'General Supplies', icon: <LocalHospitalIcon /> },
    { key: 'medicines', label: 'Medicines', icon: <MedicationIcon /> },
    { key: 'medical_equipment', label: 'Medical Equipment', icon: <ConstructionIcon /> },
    { key: 'lab_supplies', label: 'Lab Supplies', icon: <ScienceIcon /> }
];

const InventoryPanel = ({ showNotify, refreshTrigger }) => {
    const [inventory, setInventory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('inventory'); // 'inventory', 'history', 'add'
    const [activeCategory, setActiveCategory] = useState('general_supplies');
    const [loading, setLoading] = useState(false);

    // Consume modal
    const [showConsume, setShowConsume] = useState(null);
    const [consumeQty, setConsumeQty] = useState('');
    const [consumeNotes, setConsumeNotes] = useState('');

    // Restock modal
    const [showRestock, setShowRestock] = useState(null);
    const [restockQty, setRestockQty] = useState(10);
    const [restockPriority, setRestockPriority] = useState('medium');
    const [restockNotes, setRestockNotes] = useState('');

    // Add item form
    const [newItem, setNewItem] = useState({ name: '', category: 'general_supplies', quantity: 0, unit: 'pcs', reorder_level: '' });

    useEffect(() => { loadInventory(); }, []);

    useEffect(() => {
        if (refreshTrigger > 0) loadInventory();
    }, [refreshTrigger]);

    const loadInventory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) setInventory(data.items || []);
        } catch (e) { }
        setLoading(false);
    };

    const loadTransactions = async () => {
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory/transactions`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) setTransactions(data.transactions || []);
        } catch (e) { }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        if (!newItem.name.trim()) { showNotify?.('Item name is required', 'error'); return; }
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newItem)
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.(`"${newItem.name}" added to inventory!`, 'success');
                setNewItem({ name: '', category: activeCategory, quantity: 0, unit: 'pcs', reorder_level: '' });
                setView('inventory');
                loadInventory();
            } else {
                showNotify?.(data.error || 'Failed to add item', 'error');
            }
        } catch (e) { showNotify?.('Error adding item', 'error'); }
    };

    const handleConsume = async (e) => {
        e.preventDefault();
        if (!showConsume) return;
        const qty = parseInt(consumeQty);
        if (!qty || qty <= 0) { showNotify?.('Please enter a valid quantity', 'error'); return; }
        if (qty > showConsume.quantity) { showNotify?.(`Only ${showConsume.quantity} available`, 'error'); return; }
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory/consume`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    item_id: showConsume.item_id,
                    quantity: qty,
                    reason: consumeNotes
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.(`Consumed ${qty}x ${showConsume.name}`, 'success');
                setShowConsume(null);
                setConsumeQty('');
                setConsumeNotes('');
                loadInventory();
            } else {
                showNotify?.(data.error || 'Failed to consume item', 'error');
            }
        } catch (e) { showNotify?.('Error consuming item', 'error'); }
    };

    const handleRestock = async (e) => {
        e.preventDefault();
        if (!showRestock) return;
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory/restock-request`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    items: [{
                        item_id: showRestock.item_id,
                        needed_quantity: restockQty,
                        urgency: restockPriority,
                        reason: restockNotes
                    }]
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Restock request submitted!', 'success');
                setShowRestock(null);
            }
        } catch (e) { showNotify?.('Error submitting restock request', 'error'); }
    };

    const getStockChip = (item) => {
        if (item.quantity <= 0) return <Chip label="OUT OF STOCK" color="error" size="small" variant="soft" />;
        if (item.quantity <= (item.reorder_level || 10)) return <Chip label="LOW STOCK" color="warning" size="small" variant="soft" />;
        return <Chip label="IN STOCK" color="success" size="small" variant="soft" />;
    };

    const filteredItems = inventory.filter(item => item.category === activeCategory);

    return (
        <Stack spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
            <PageHeader 
                title="Clinical Inventory & Supplies" 
                subtitle="Track, consume and coordinate essential medical resources"
                actionLabel="Add Resource"
                onAction={() => setView('add')}
                actionIcon={<AddIcon />}
            />

            {/* Navigation Tabs */}
            <Stack direction="row" spacing={1}>
                <Button
                    variant={view === 'inventory' ? 'contained' : 'outlined'}
                    onClick={() => setView('inventory')}
                    startIcon={<Inventory2Icon />}
                    sx={{ borderRadius: 2 }}
                >
                    Available Resources
                </Button>
                <Button
                    variant={view === 'history' ? 'contained' : 'outlined'}
                    onClick={() => { setView('history'); loadTransactions(); }}
                    startIcon={<HistoryIcon />}
                    sx={{ borderRadius: 2 }}
                >
                    Log History
                </Button>
            </Stack>

            {/* ADD ITEM View */}
            {view === 'add' && (
                <Paper variant="outlined" sx={{ p: 4, borderRadius: 3 }}>
                    <Typography variant="h6" fontWeight={800} gutterBottom>Register New Clinical Unit</Typography>
                    <Grid container spacing={3} component="form" onSubmit={handleAddItem} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Unit Name" placeholder="e.g., Surgical Gloves (Size M)" required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select label="Category" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                                    {CATEGORIES.map(c => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField fullWidth type="number" label="Initial Stock" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth>
                                <InputLabel>Measurement Unit</InputLabel>
                                <Select label="Measurement Unit" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}>
                                    <MenuItem value="pcs">Pieces</MenuItem>
                                    <MenuItem value="box">Boxes</MenuItem>
                                    <MenuItem value="pack">Packs</MenuItem>
                                    <MenuItem value="bottle">Bottles</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField fullWidth type="number" label="Reorder Threshold" value={newItem.reorder_level} onChange={e => setNewItem({ ...newItem, reorder_level: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                            <Button variant="outlined" onClick={() => setView('inventory')}>Cancel</Button>
                            <Button variant="contained" type="submit">Complete Registration</Button>
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {/* INVENTORY View */}
            {view === 'inventory' && (
                <Stack spacing={3}>
                    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
                        {CATEGORIES.map(cat => {
                            const count = inventory.filter(i => i.category === cat.key).length;
                            return (
                                <Button
                                    key={cat.key}
                                    variant={activeCategory === cat.key ? 'contained' : 'outlined'}
                                    onClick={() => setActiveCategory(cat.key)}
                                    startIcon={cat.icon}
                                    sx={{ borderRadius: 3, whiteSpace: 'nowrap', px: 3 }}
                                >
                                    {cat.label} {count > 0 && <Chip label={count} size="small" sx={{ ml: 1, height: 20, bgcolor: activeCategory === cat.key ? 'white' : 'action.selected', color: activeCategory === cat.key ? 'primary.main' : 'text.primary' }} />}
                                </Button>
                            );
                        })}
                    </Box>

                    <Grid container spacing={2.5}>
                        {filteredItems.map(item => (
                            <Grid item xs={12} sm={6} lg={4} key={item.item_id}>
                                <Card variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }, transition: '0.2s' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="subtitle1" fontWeight={700} noWrap>{item.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{item.unit || 'units'}</Typography>
                                            </Box>
                                            <Box sx={{ textAlign: 'right' }}>
                                                <Typography variant="h5" fontWeight={800} color={item.quantity <= 0 ? 'error.main' : item.quantity <= (item.reorder_level || 10) ? 'warning.main' : 'primary.main'}>
                                                    {item.quantity}
                                                </Typography>
                                                {getStockChip(item)}
                                            </Box>
                                        </Box>
                                        <Stack direction="row" spacing={1.5}>
                                            <Button fullWidth size="small" variant="contained" disabled={item.quantity <= 0} onClick={() => setShowConsume(item)}>Take</Button>
                                            <Button fullWidth size="small" variant="outlined" color="warning" onClick={() => setShowRestock(item)}>Restock</Button>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Stack>
            )}

            {/* HISTORY View */}
            {view === 'history' && (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                    <Table>
                        <TableHead sx={{ bgcolor: 'action.hover' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 800 }}>Timestamp</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>Clinical Unit</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>Operation</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>Qty Change</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>Remaining</TableCell>
                                <TableCell sx={{ fontWeight: 800 }}>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transactions.map((tx, i) => (
                                <TableRow key={tx.transaction_id || i} hover>
                                    <TableCell>{tx.timestamp ? formatDate(tx.timestamp) : '-'}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{tx.item_name}</TableCell>
                                    <TableCell>
                                        <Chip label={tx.type.toUpperCase()} size="small" color={tx.type === 'consume' ? 'primary' : 'success'} variant="soft" />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: tx.type === 'consume' ? 'error.main' : 'success.main' }}>
                                        {tx.type === 'consume' ? '-' : '+'}{tx.quantity}
                                    </TableCell>
                                    <TableCell>{tx.new_qty ?? '-'}</TableCell>
                                    <TableCell sx={{ fontStyle: 'italic', fontSize: '0.8rem' }}>{tx.reason || '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Consume Modal */}
            <Dialog open={!!showConsume} onClose={() => setShowConsume(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>Request Consumption</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3 }}>You are taking <strong>{showConsume?.name}</strong> from clinical stores.</Typography>
                    <Stack spacing={3}>
                        <TextField fullWidth label="Quantity" type="number" placeholder="Enter units required" value={consumeQty} onChange={e => setConsumeQty(e.target.value)} />
                        <TextField fullWidth label="Purpose/Reason" placeholder="e.g., Surgery Suite 1-A" value={consumeNotes} onChange={e => setConsumeNotes(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button onClick={() => setShowConsume(null)}>Cancel</Button>
                    <Button variant="contained" onClick={handleConsume}>Confirm Draw</Button>
                </DialogActions>
            </Dialog>

            {/* Restock Modal */}
            <Dialog open={!!showRestock} onClose={() => setShowRestock(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>Procurement Request</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3 }}>Request restock for <strong>{showRestock?.name}</strong> from central supply.</Typography>
                    <Stack spacing={3}>
                        <TextField fullWidth label="Needed Quantity" type="number" value={restockQty} onChange={e => setRestockQty(parseInt(e.target.value) || 1)} />
                        <FormControl fullWidth>
                            <InputLabel>Urgency</InputLabel>
                            <Select label="Urgency" value={restockPriority} onChange={e => setRestockPriority(e.target.value)}>
                                <MenuItem value="low">Standard (Low)</MenuItem>
                                <MenuItem value="medium">Required (Medium)</MenuItem>
                                <MenuItem value="high">Urgent (High)</MenuItem>
                                <MenuItem value="urgent">CRITICAL (Emergency)</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField fullWidth label="Justification" placeholder="Why is this restock needed?" value={restockNotes} onChange={e => setRestockNotes(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button onClick={() => setShowRestock(null)}>Cancel</Button>
                    <Button variant="contained" color="warning" onClick={handleRestock}>Submit Request</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default InventoryPanel;

