import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

import Box from '@mui/material/Box';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

export default function StatCard({ title, value, icon, trend, trendLabel, onClick, color = 'primary' }) {
    return (
        <Card
            onClick={onClick}
            sx={{
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s ease-in-out',
                '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 3 } : {},
            }}
        >
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}>
                        {title}
                    </Typography>
                    <Typography variant="h3" fontWeight={700}>
                        {value}
                    </Typography>
                    {trend !== undefined && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                            {trend >= 0 ? (
                                <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                            ) : (
                                <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                            )}
                            <Typography variant="caption" color={trend >= 0 ? 'success.main' : 'error.main'}>
                                {Math.abs(trend)}% {trendLabel || ''}
                            </Typography>
                        </Box>
                    )}
                </Box>
                <Box sx={{ fontSize: '2rem', opacity: 0.5, filter: 'grayscale(1)', transition: 'filter 0.2s', '&:hover': { filter: 'grayscale(0)' } }}>
                    {icon}
                </Box>
            </CardContent>
        </Card>
    );
}
