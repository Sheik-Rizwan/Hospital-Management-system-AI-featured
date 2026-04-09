import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

const Notification = ({ message, type, onClose }) => {
    return (
        <Snackbar 
            open={!!message} 
            autoHideDuration={4000} 
            onClose={onClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
            <Alert 
                onClose={onClose} 
                severity={type === 'error' ? 'error' : type === 'success' ? 'success' : 'info'} 
                variant="filled" 
                sx={{ width: '100%', borderRadius: 2, fontWeight: 600 }}
            >
                {message}
            </Alert>
        </Snackbar>
    );
};

export default Notification;