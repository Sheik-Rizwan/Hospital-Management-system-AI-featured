import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

export default function AppNotification({ open, message, type = 'info', onClose, duration = 3000 }) {
    const severity = type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info';

    return (
        <Snackbar open={open} autoHideDuration={duration} onClose={onClose}>
            <Alert onClose={onClose} severity={severity} variant="filled" sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    );
}
