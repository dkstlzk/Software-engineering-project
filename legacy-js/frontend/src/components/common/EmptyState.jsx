import { Box, Typography, alpha } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

export function EmptyState({ message = 'No data found.' }) {
  return (
    <Box py={6} textAlign="center">
      <InboxIcon sx={{ fontSize: 48, color: (t) => alpha(t.palette.text.secondary, 0.25), mb: 1 }} />
      <Typography color="text.secondary" fontWeight={500}>{message}</Typography>
    </Box>
  );
}
