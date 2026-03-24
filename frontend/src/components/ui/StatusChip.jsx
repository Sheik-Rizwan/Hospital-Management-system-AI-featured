import Chip from '@mui/material/Chip';

const STATUS_MAP = {
    active: { label: 'Active', color: 'success' },
    approved: { label: 'Approved', color: 'success' },
    completed: { label: 'Completed', color: 'success' },
    pending: { label: 'Pending', color: 'warning' },
    booked: { label: 'Booked', color: 'info' },
    rejected: { label: 'Rejected', color: 'error' },
    cancelled: { label: 'Cancelled', color: 'error' },
    inactive: { label: 'Inactive', color: 'default' },
    delivered: { label: 'Delivered', color: 'success' },
    shipped: { label: 'Shipped', color: 'info' },
    processing: { label: 'Processing', color: 'warning' },
};

export default function StatusChip({ status, label, size = 'small' }) {
    const key = (status || '').toLowerCase();
    const config = STATUS_MAP[key] || { label: status, color: 'default' };

    return (
        <Chip
            label={label || config.label}
            color={config.color}
            size={size}
            variant="outlined"
            sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}
        />
    );
}
