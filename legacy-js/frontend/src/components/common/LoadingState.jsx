import { Box, CircularProgress, Typography, Stack } from '@mui/material';

export function LoadingState({ message = 'Loading...' }) {
  return (
    <Box minHeight="240px" display="grid" sx={{ placeItems: 'center' }}>
      <Stack alignItems="center" spacing={1.5}>
        <CircularProgress size={36} thickness={4} />
        <Typography variant="body2" color="text.secondary" fontSize="0.8rem">
          {message}
        </Typography>
      </Stack>
    </Box>
  );
}
