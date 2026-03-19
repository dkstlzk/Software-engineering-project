import { Box, Typography, alpha } from '@mui/material';

export function PageHeader({ title, subtitle, action }) {
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      mb={0.5}
      gap={2}
      flexWrap="wrap"
    >
      <Box>
        <Typography variant="h5" sx={{ mb: 0.3 }}>{title}</Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.83rem' }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action || null}
    </Box>
  );
}
