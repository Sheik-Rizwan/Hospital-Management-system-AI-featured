import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../../utils/api';

// MUI Components
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

// Icons
import Inventory2Icon from '@mui/icons-material/Inventory2';

const RequestItemModal = ({ onClose, onSuccess }) => {
    const [inventory, setInventory] = useState([]);
    const [selectedItem, setSelectedItem] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setInventory(data.items || []);
            }
        } catch (err) {
            console.error('Failed to fetch inventory:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!selectedItem) {
            setError('Please select an item');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/procurement/requests`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    item_id: selectedItem,
                    quantity: parseInt(quantity),
                    reason: reason
                })
            });
            const data = await res.json();
            
            if (data.success) {
                onSuccess();
            } else {
                setError(data.error || 'Request failed');
            }
        } catch (err) {
            setError('Network error');
        }
        setLoading(false);
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
                <Inventory2Icon color="primary" />
                Request Item
            </DialogTitle>
            
            <DialogContent dividers>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                    <FormControl fullWidth required>
                        <InputLabel>Select Item</InputLabel>
                        <Select
                            value={selectedItem}
                            onChange={e => setSelectedItem(e.target.value)}
                            label="Select Item"
                        >
                            <MenuItem value="" disabled>-- Choose Item --</MenuItem>
                            {inventory.map(item => (
                                <MenuItem key={item.item_id} value={item.item_id}>
                                    {item.name} ({item.quantity} {item.unit} available)
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth
                        type="number"
                        label="Quantity Needed"
                        required
                        inputProps={{ min: 1 }}
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                    />

                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Reason (Optional)"
                        placeholder="e.g., Running low for daily shifts"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose} disabled={loading} color="inherit">
                    Cancel
                </Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loading ? 'Submitting...' : 'Submit Request'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default RequestItemModal;
