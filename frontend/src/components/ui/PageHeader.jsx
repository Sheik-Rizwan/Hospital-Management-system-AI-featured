import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

export default function PageHeader({ title, subtitle, actionLabel, actionIcon, onAction }) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
                <Typography variant="h4" fontWeight={700}>{title}</Typography>
                {subtitle && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
                )}
            </Box>
            {actionLabel && (
                <Button variant="contained" startIcon={actionIcon} onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </Box>
    );
}
