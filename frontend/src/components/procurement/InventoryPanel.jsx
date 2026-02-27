import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../../utils/api';

/**
 * Inventory Panel with category subsections.
 * Doctor/Nurse/Admin can add items, consume (take), and request restocks.
 * Categories: General Supplies, Medicines, Medical Equipment, Lab Supplies.
 */
const CATEGORIES = [
    { key: 'general_supplies', label: '🧴 General Supplies', icon: '🧴' },
    { key: 'medicines', label: '💊 Medicines', icon: '💊' },
    { key: 'medical_equipment', label: '🩺 Medical Equipment', icon: '🩺' },
    { key: 'lab_supplies', label: '🧪 Lab Supplies', icon: '🧪' }
];

const InventoryPanel = ({ showNotify, refreshTrigger }) => {
    const [inventory, setInventory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('inventory'); // 'inventory', 'history', 'add'
    const [activeCategory, setActiveCategory] = useState('general_supplies');
    const [loading, setLoading] = useState(false);

    // Consume modal
    const [showConsume, setShowConsume] = useState(null);
    const [consumeQty, setConsumeQty] = useState(1);
    const [consumeNotes, setConsumeNotes] = useState('');

    // Restock modal
    const [showRestock, setShowRestock] = useState(null);
    const [restockQty, setRestockQty] = useState(10);
    const [restockPriority, setRestockPriority] = useState('medium');
    const [restockNotes, setRestockNotes] = useState('');

    // Add item form
    const [newItem, setNewItem] = useState({ name: '', category: 'general_supplies', quantity: 0, unit: 'pcs', reorder_level: 10 });

    useEffect(() => { loadInventory(); }, []);

    // Re-load inventory when refreshTrigger changes (real-time update from socket)
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
                setNewItem({ name: '', category: activeCategory, quantity: 0, unit: 'pcs', reorder_level: 10 });
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
        try {
            const res = await fetch(`${API_BASE}/procurement/inventory/consume`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    item_id: showConsume.item_id,
                    quantity: consumeQty,
                    reason: consumeNotes
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.(`Consumed ${consumeQty}x ${showConsume.name}`, 'success');
                if (data.low_stock_warning) showNotify?.(`⚠️ Low stock warning for ${showConsume.name}!`, 'warning');
                setShowConsume(null);
                setConsumeQty(1);
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
                setRestockQty(10);
                setRestockNotes('');
            } else {
                showNotify?.(data.error || 'Failed to submit request', 'error');
            }
        } catch (e) { showNotify?.('Error submitting restock request', 'error'); }
    };

    const getStockColor = (item) => {
        if (item.quantity <= 0) return 'text-[#EF4444]';
        if (item.quantity <= (item.reorder_level || 10)) return 'text-[#F59E0B]';
        return 'text-primary';
    };

    // Filter inventory by active category
    const filteredItems = inventory.filter(item => item.category === activeCategory);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-border pb-4">
                <h2 className="text-3xl font-bold text-foreground">📦 Inventory</h2>
                <div className="flex gap-2">
                    <button onClick={() => { setView('add'); setNewItem(prev => ({ ...prev, category: activeCategory })); }}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm transition font-medium">
                        ➕ Add Item
                    </button>
                    <button onClick={loadInventory} className="px-3 py-2 bg-card text-muted-foreground hover:text-foreground rounded-lg text-sm transition border border-transparent hover:border-border">
                        🔄
                    </button>
                </div>
            </div>

            {/* Top Tabs: Items / History */}
            <div className="flex gap-2">
                <button onClick={() => setView('inventory')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${view === 'inventory' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border'}`}>
                    📦 Items
                </button>
                <button onClick={() => { setView('history'); loadTransactions(); }}
                    className={`px-4 py-2 rounded-lg font-medium transition ${view === 'history' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border'}`}>
                    📋 Transaction History
                </button>
            </div>

            {/* ========== ADD ITEM FORM ========== */}
            {view === 'add' && (
                <div className="bg-card p-6 rounded-xl border border-border">
                    <h3 className="text-xl font-bold text-foreground mb-4">Add New Inventory Item</h3>
                    <form onSubmit={handleAddItem} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Item Name *</label>
                                <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                    placeholder="e.g., Surgical Gloves" required
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Category *</label>
                                <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none">
                                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Initial Quantity</label>
                                <input type="number" min="0" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Unit</label>
                                <select value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none">
                                    <option value="pcs">Pieces</option>
                                    <option value="box">Boxes</option>
                                    <option value="kg">Kilograms</option>
                                    <option value="litre">Litres</option>
                                    <option value="pack">Packs</option>
                                    <option value="bottle">Bottles</option>
                                    <option value="roll">Rolls</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Reorder Level</label>
                                <input type="number" min="1" value={newItem.reorder_level} onChange={e => setNewItem({ ...newItem, reorder_level: parseInt(e.target.value) || 10 })}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setView('inventory')} className="px-4 py-2 bg-[#565869] text-white rounded-lg hover:bg-[#6B6D80] transition">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition font-medium">Add Item</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ========== INVENTORY VIEW ========== */}
            {view === 'inventory' && (
                <>
                    {/* Category Tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {CATEGORIES.map(cat => {
                            const count = inventory.filter(i => i.category === cat.key).length;
                            return (
                                <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                                        activeCategory === cat.key
                                            ? 'bg-primary text-white shadow-lg'
                                            : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border'
                                    }`}>
                                    {cat.icon} {cat.label.split(' ').slice(1).join(' ')}
                                    {count > 0 && <span className="ml-1 bg-black/20 px-2 py-0.5 rounded-full text-xs">{count}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Items Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loading && (
                            <div className="col-span-full text-center py-12 text-muted-foreground">Loading...</div>
                        )}
                        {!loading && filteredItems.length === 0 && (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                                <span className="text-4xl block mb-3">{CATEGORIES.find(c => c.key === activeCategory)?.icon || '📦'}</span>
                                <p>No items in this category</p>
                                <button onClick={() => { setView('add'); setNewItem(prev => ({ ...prev, category: activeCategory })); }}
                                    className="mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition">
                                    ➕ Add First Item
                                </button>
                            </div>
                        )}
                        {filteredItems.map(item => (
                            <div key={item.item_id} className="bg-card p-4 rounded-xl border border-border hover:border-[#3B82F6] transition">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-foreground">{item.name}</h3>
                                        <p className="text-xs text-muted-foreground">{item.unit || 'pcs'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-2xl font-bold ${getStockColor(item)}`}>{item.quantity}</span>
                                        {item.quantity <= 0 && <p className="text-xs text-[#EF4444]">Out of stock</p>}
                                        {item.quantity > 0 && item.quantity <= (item.reorder_level || 10) && <p className="text-xs text-[#F59E0B]">⚠️ Low</p>}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setShowConsume(item); setConsumeQty(1); setConsumeNotes(''); }}
                                        disabled={item.quantity <= 0}
                                        className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-[#2563EB] disabled:opacity-40 transition font-medium">
                                        ➖ Take
                                    </button>
                                    <button onClick={() => { setShowRestock(item); setRestockQty(10); setRestockNotes(''); }}
                                        className="flex-1 px-3 py-2 bg-[#F59E0B] text-black rounded-lg text-sm hover:bg-[#D97706] transition font-medium">
                                        📤 Restock
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ========== TRANSACTION HISTORY ========== */}
            {view === 'history' && (
                <div className="bg-card rounded-lg overflow-hidden border border-border">
                    <table className="w-full text-left">
                        <thead className="bg-sidebar text-muted-foreground text-sm uppercase">
                            <tr>
                                <th className="p-4 border-b border-border">Date</th>
                                <th className="p-4 border-b border-border">Item</th>
                                <th className="p-4 border-b border-border">Type</th>
                                <th className="p-4 border-b border-border">Qty</th>
                                <th className="p-4 border-b border-border">Remaining</th>
                                <th className="p-4 border-b border-border">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#565869]">
                            {transactions.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-muted-foreground">No transactions yet.</td></tr>
                            ) : (
                                transactions.map((tx, i) => (
                                    <tr key={tx.transaction_id || i} className="hover:bg-muted transition">
                                        <td className="p-4 text-muted-foreground text-sm">{tx.timestamp ? formatDate(tx.timestamp) : '-'}</td>
                                        <td className="p-4 font-medium text-foreground">{tx.item_name}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                tx.type === 'consume' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-success'
                                            }`}>{tx.type}</span>
                                        </td>
                                        <td className="p-4 text-foreground">-{tx.quantity}</td>
                                        <td className="p-4 text-muted-foreground">{tx.new_qty ?? '-'}</td>
                                        <td className="p-4 text-text-secondary text-sm">{tx.reason || '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ========== CONSUME MODAL ========== */}
            {showConsume && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-sidebar p-6 rounded-xl w-full max-w-md border border-border shadow-2xl">
                        <h3 className="text-xl font-bold mb-2 text-foreground">Take: {showConsume.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">Available: <span className={getStockColor(showConsume)}>{showConsume.quantity}</span> {showConsume.unit || 'units'}</p>
                        <form onSubmit={handleConsume} className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">How many?</label>
                                <input type="number" min="1" max={showConsume.quantity} value={consumeQty}
                                    onChange={e => setConsumeQty(parseInt(e.target.value) || 1)}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Reason (optional)</label>
                                <input type="text" value={consumeNotes} onChange={e => setConsumeNotes(e.target.value)}
                                    placeholder="e.g., For patient in Room 302"
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setShowConsume(null)} className="px-4 py-2 bg-card text-foreground rounded-lg hover:bg-[#565869] transition">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary rounded-lg text-white hover:bg-[#2563EB] transition font-medium">Confirm Take</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========== RESTOCK MODAL ========== */}
            {showRestock && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-sidebar p-6 rounded-xl w-full max-w-md border border-border shadow-2xl">
                        <h3 className="text-xl font-bold mb-2 text-foreground">Request Restock: {showRestock.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">Current stock: {showRestock.quantity} {showRestock.unit || 'units'}</p>
                        <form onSubmit={handleRestock} className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Quantity Needed</label>
                                <input type="number" min="1" value={restockQty} onChange={e => setRestockQty(parseInt(e.target.value) || 1)}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Priority</label>
                                <select value={restockPriority} onChange={e => setRestockPriority(e.target.value)}
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground block mb-1">Notes</label>
                                <input type="text" value={restockNotes} onChange={e => setRestockNotes(e.target.value)}
                                    placeholder="Reason for restock..."
                                    className="w-full bg-card text-white border border-border p-3 rounded-lg focus:border-primary focus:outline-none" />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setShowRestock(null)} className="px-4 py-2 bg-card text-foreground rounded-lg hover:bg-[#565869] transition">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-[#F59E0B] rounded-lg text-black font-medium hover:bg-[#D97706] transition">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryPanel;
