import { createContext, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  const notify = (message, severity = 'info') => {
    setState({ open: true, message, severity });
  };

  const value = useMemo(() => ({ notify }), []);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={4000}
        onClose={() => setState((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setState((prev) => ({ ...prev, open: false }))}
          severity={state.severity}
          sx={{ width: '100%' }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return ctx;
}
