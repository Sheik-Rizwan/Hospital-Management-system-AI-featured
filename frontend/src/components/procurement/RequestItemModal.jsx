import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../../utils/api';

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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-sidebar rounded-xl max-w-md w-full p-6 shadow-2xl border border-border">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <span>📦</span> Request Item
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-white text-2xl">&times;</button>
                </div>

                {error && <div className="bg-red-900/20 text-red-200 p-3 rounded mb-4 text-sm text-center border border-red-500/30">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-muted-foreground text-sm mb-2">Select Item</label>
                        <select 
                            value={selectedItem} 
                            onChange={e => setSelectedItem(e.target.value)}
                            className="w-full bg-card text-white border border-border p-3 rounded focus:border-primary focus:outline-none"
                            required
                        >
                            <option value="">-- Choose Item --</option>
                            {inventory.map(item => (
                                <option key={item.item_id} value={item.item_id}>
                                    {item.name} ({item.quantity} {item.unit} available)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-muted-foreground text-sm mb-2">Quantity Needed</label>
                        <input 
                            type="number" 
                            min="1"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            className="w-full bg-card text-white border border-border p-3 rounded focus:border-primary focus:outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-muted-foreground text-sm mb-2">Reason (Optional)</label>
                        <textarea 
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="w-full bg-card text-white border border-border p-3 rounded resize-none focus:border-primary focus:outline-none"
                            rows={3}
                            placeholder="e.g., Running low for daily shifts"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-card text-foreground rounded hover:bg-[#565869] transition">Cancel</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-primary rounded text-white hover:bg-primary-hover transition disabled:opacity-50">
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RequestItemModal;
