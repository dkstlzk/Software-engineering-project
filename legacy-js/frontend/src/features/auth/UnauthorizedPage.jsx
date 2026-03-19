import { Box, Typography } from '@mui/material';

export function UnauthorizedPage() {
  return (
    <Box sx={{ py: 8 }}>
      <Typography variant="h5">Unauthorized</Typography>
      <Typography color="text.secondary">You do not have permission to access this page.</Typography>
    </Box>
  );
}
