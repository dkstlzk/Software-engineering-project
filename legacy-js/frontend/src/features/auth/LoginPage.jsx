import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@iitj.ac.in');
  const [password, setPassword] = useState('Admin@123!');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left branding panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '48%',
          background: 'linear-gradient(145deg, #0F2940 0%, #1E3A5F 50%, #0D9488 100%)',
          color: '#fff',
          p: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <Box
          sx={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: alpha('#fff', 0.06),
            top: -100,
            left: -100,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: alpha('#fff', 0.04),
            bottom: -80,
            right: -60,
          }}
        />

        <Stack spacing={3} alignItems="center" sx={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 420 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '20px',
              background: alpha('#fff', 0.1),
              backdropFilter: 'blur(10px)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <MeetingRoomIcon sx={{ fontSize: 42 }} />
          </Box>
          <Typography variant="h4" fontWeight={800}>
            URAS
          </Typography>
          <Typography variant="h6" fontWeight={400} sx={{ opacity: 0.85 }}>
            Unified Room Allocation System
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.65, lineHeight: 1.7, mt: 1 }}>
            Streamline room booking, inventory tracking, and allocation policy management across your campus — all in one place.
          </Typography>

          <Stack direction="row" spacing={4} sx={{ mt: 4 }}>
            {[
              { n: '4', label: 'User Roles' },
              { n: 'RBAC', label: 'Access Control' },
              { n: '24/7', label: 'Availability' },
            ].map((stat) => (
              <Box key={stat.label} textAlign="center">
                <Typography variant="h5" fontWeight={800}>
                  {stat.n}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.6, letterSpacing: 1 }}>
                  {stat.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Box>

      {/* Right form panel */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: { xs: 3, sm: 6 },
          bgcolor: '#F8FAFC',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Stack spacing={1} sx={{ mb: 4 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                bgcolor: 'primary.main',
                display: 'grid',
                placeItems: 'center',
                mb: 1,
              }}
            >
              <LockOutlinedIcon sx={{ color: '#fff', fontSize: 24 }} />
            </Box>
            <Typography variant="h5">Welcome back</Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in with your institute credentials to continue.
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={onSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#fff' },
                }}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#fff' },
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                sx={{
                  py: 1.4,
                  fontSize: '0.95rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #1E3A5F 0%, #0D9488 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #0F2940 0%, #0F766E 100%)',
                  },
                }}
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, textAlign: 'center' }}>
            IIT Jodhpur &bull; Room Allocation Management
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
