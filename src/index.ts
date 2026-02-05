import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import bookingRouter from './routes/booking.route.js';
import vapiRouter from './routes/vapi.route.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files
app.use(express.static(path.join(process.cwd(), 'public')));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} | ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`
    );
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/appointments', bookingRouter);
app.use('/api/vapi', vapiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred',
    },
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     Dental Appointment Booking API                        ║
║     Server running on http://localhost:${PORT}              ║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  POST /api/appointments/book - Book an appointment
  GET  /health                - Health check

Required Headers:
  Idempotency-Key: <uuid>     - For booking requests
  Content-Type: application/json
  `);
});
