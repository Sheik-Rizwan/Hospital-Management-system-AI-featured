import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

export default function DataTable({ columns, data, emptyText = 'No data found.', renderRow, onRowClick }) {
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table>
                <TableHead>
                    <TableRow>
                        {columns.map((col) => (
                            <TableCell key={typeof col === 'string' ? col : col.id}>
                                {typeof col === 'string' ? col : col.label}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                                <Typography color="text.secondary">{emptyText}</Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        data.map((row, idx) => (
                            <TableRow
                                key={row.id || row._id || idx}
                                hover
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                            >
                                {renderRow(row, idx)}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
