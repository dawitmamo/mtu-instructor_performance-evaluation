export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  if (error?.code === 11000) {
    statusCode = 409;
    message = 'This record already exists';
  } else if (error?.name === 'MulterError') {
    statusCode = 400;
    message = error.code === 'LIMIT_FILE_SIZE' ? 'The upload must be 5 MB or smaller' : 'The uploaded file could not be processed';
  } else if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    statusCode = 400;
  }
  res.status(statusCode).json({
    message,
    details: process.env.NODE_ENV === 'production' ? undefined : error.details
  });
}
