import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders, getRoleAuth, clearRoleAuth, connectSocket } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import AppNotification from '../components/ui/AppNotification';
import PageHeader from '../components/ui/PageHeader';
import StatusChip from '../components/ui/StatusChip';

import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

const PharmacistDashboard = () => {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('prescriptions');
    const [prescriptions, setPrescriptions] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [notification, setNotification] = useState(null);

    const showNotify = useCallback((msg, type = 'info') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    useEffect(() => {
        const { user: u } = getRoleAuth('pharmacist');
        if (u) setUser(u);
        connectSocket('pharmacist');
        loadData();
    }, []);

    const loadData = async () => {
        const headers = getAuthHeaders('pharmacist');
        try {
            const [rxRes, invRes] = await Promise.allSettled([
                fetch(`${API_BASE}/pharmacist/prescriptions`, { headers }),
                fetch(`${API_BASE}/pharmacist/inventory`, { headers }),
            ]);
            if (rxRes.status === 'fulfilled' && rxRes.value.ok) {
                const d = await rxRes.value.json();
                setPrescriptions(d.prescriptions || []);
            }
            if (invRes.status === 'fulfilled' && invRes.value.ok) {
                const d = await invRes.value.json();
                setInventory(d.inventory || []);
            }
        } catch { showNotify('Failed to load data', 'error'); }
    };

    const handleDispense = async (id) => {
        const headers = getAuthHeaders('pharmacist');
        try {
            const res = await fetch(`${API_BASE}/pharmacist/prescriptions/${id}/dispense`, { method: 'PUT', headers });
            const data = await res.json();
            if (data.success) { showNotify('Dispensed!', 'success'); loadData(); }
            else showNotify(data.error || 'Failed', 'error');
        } catch { showNotify('Error dispensing', 'error'); }
    };

    const handleLogout = () => { clearRoleAuth('pharmacist'); window.location.href = '/'; };

    const sidebarGroups = [{
        label: 'Pharmacy',
        items: [
            { id: 'prescriptions', icon: <MedicationOutlinedIcon fontSize="small" />, label: 'Prescriptions' },
            { id: 'inventory', icon: <Inventory2OutlinedIcon fontSize="small" />, label: 'Inventory' },
        ]
    }];

    return (
        <DashboardLayout title="Pharmacist" sidebarGroups={sidebarGroups} activeView={view} onViewChange={setView}
            user={{ ...user, role: 'pharmacist' }} onLogout={handleLogout}>

            {view === 'prescriptions' && (
                <Stack spacing={3}>
                    <PageHeader title="Active Prescriptions" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Medication</TableCell><TableCell>Dosage</TableCell><TableCell>Frequency</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {prescriptions.map((rx, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{rx.medication}</TableCell>
                                        <TableCell>{rx.dosage || '-'}</TableCell>
                                        <TableCell>{rx.frequency || '-'}</TableCell>
                                        <TableCell><StatusChip status={rx.status} /></TableCell>
                                        <TableCell>
                                            {rx.status === 'active' && (
                                                <Button size="small" variant="contained" color="success" onClick={() => handleDispense(rx.id)}>Dispense</Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {prescriptions.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No active prescriptions.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            {view === 'inventory' && (
                <Stack spacing={3}>
                    <PageHeader title="Medication Inventory" />
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Name</TableCell><TableCell>Category</TableCell><TableCell>Qty</TableCell><TableCell>Unit Price</TableCell><TableCell>Reorder</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {inventory.map((item, i) => (
                                    <TableRow key={i} hover sx={item.quantity <= item.reorder_level ? { bgcolor: 'error.50' } : {}}>
                                        <TableCell sx={{ fontWeight: 500 }}>{item.name}</TableCell>
                                        <TableCell>{item.category || '-'}</TableCell>
                                        <TableCell>
                                            {item.quantity}
                                            {item.quantity <= item.reorder_level && <Chip label="Low" size="small" color="error" sx={{ ml: 1 }} />}
                                        </TableCell>
                                        <TableCell>₹{item.unit_price || 0}</TableCell>
                                        <TableCell>{item.reorder_level}</TableCell>
                                    </TableRow>
                                ))}
                                {inventory.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No inventory items.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Stack>
            )}

            <AppNotification open={!!notification} message={notification?.message || ''} type={notification?.type} onClose={() => setNotification(null)} />
        </DashboardLayout>
    );
};

export default PharmacistDashboard;
