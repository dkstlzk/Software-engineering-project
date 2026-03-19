import { createTheme, alpha } from '@mui/material/styles';

const PRIMARY = '#1E3A5F';
const SECONDARY = '#0D9488';
const BG_DEFAULT = '#F0F4F8';
const BG_PAPER = '#FFFFFF';
const SIDEBAR_BG = '#0F2940';
const SIDEBAR_TEXT = '#B0BEC5';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: PRIMARY,
      light: '#2D5F8A',
      dark: '#0F2940',
      contrastText: '#fff',
    },
    secondary: {
      main: SECONDARY,
      light: '#14B8A6',
      dark: '#0F766E',
      contrastText: '#fff',
    },
    background: {
      default: BG_DEFAULT,
      paper: BG_PAPER,
    },
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    info: { main: '#2563EB' },
    divider: alpha('#1E3A5F', 0.08),
    text: {
      primary: '#1E293B',
      secondary: '#64748B',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Arial, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 500, fontSize: '0.8rem', letterSpacing: '0.02em' },
    body2: { color: '#64748B' },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: '6px', height: '6px' },
          '&::-webkit-scrollbar-thumb': {
            borderRadius: 3,
            backgroundColor: alpha(PRIMARY, 0.2),
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          fontSize: '0.875rem',
        },
        contained: {
          boxShadow: `0 1px 3px ${alpha(PRIMARY, 0.2)}`,
          '&:hover': {
            boxShadow: `0 4px 12px ${alpha(PRIMARY, 0.25)}`,
          },
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${alpha(PRIMARY, 0.08)}`,
          borderRadius: 16,
          boxShadow: `0 1px 3px ${alpha('#000', 0.04)}`,
          transition: 'box-shadow 0.2s ease-in-out',
          '&:hover': {
            boxShadow: `0 4px 16px ${alpha('#000', 0.08)}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#64748B',
          borderBottom: `2px solid ${alpha(PRIMARY, 0.1)}`,
          padding: '14px 16px',
        },
        body: {
          fontSize: '0.875rem',
          padding: '12px 16px',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.75rem' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          border: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: `0 1px 3px ${alpha('#000', 0.06)}`,
        },
      },
    },
  },
});

export { SIDEBAR_BG, SIDEBAR_TEXT, PRIMARY, SECONDARY };
