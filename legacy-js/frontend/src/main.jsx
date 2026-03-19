import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './app/theme';
import { AppRouter } from './app/routes';
import { AuthProvider } from './features/auth/AuthContext';
import { AlertProvider } from './components/common/AlertProvider';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AlertProvider>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </AlertProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
