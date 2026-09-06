export const errorHandler = (err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[Error] ${req.method} ${req.path} → ${status}: ${message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(status).json({
    error:   message,
    path:    req.path,
    method:  req.method,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
