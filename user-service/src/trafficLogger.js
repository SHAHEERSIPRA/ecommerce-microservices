const { v4: uuidv4 } = require('uuid');

const trafficLog = [];
const MAX_LOG_SIZE = 200;

function getLog() {
  return trafficLog;
}

function clearLog() {
  trafficLog.length = 0;
}

function addEntry(entry) {
  trafficLog.unshift(entry);
  if (trafficLog.length > MAX_LOG_SIZE) trafficLog.length = MAX_LOG_SIZE;
}

// Middleware: log every incoming request with trace ID
function trafficMiddleware(serviceName) {
  return (req, res, next) => {
    // Skip traffic/health endpoints to avoid noise
    if (req.path === '/traffic' || req.path === '/health') return next();

    req.traceId = req.headers['x-trace-id'] || uuidv4();
    req.startTime = Date.now();
    res.setHeader('x-trace-id', req.traceId);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const entry = {
        id: uuidv4(),
        traceId: req.traceId,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        duration: Date.now() - req.startTime,
        source: req.headers['x-source-service'] || 'external',
        target: serviceName,
        service: serviceName,
        direction: 'incoming',
        payload: req.method !== 'GET' ? summarizePayload(req.body) : undefined,
      };
      addEntry(entry);
      return originalJson(body);
    };

    next();
  };
}

// Log outgoing inter-service calls
function logOutgoingCall(serviceName, { traceId, method, url, targetService, duration, statusCode, error, payload }) {
  addEntry({
    id: uuidv4(),
    traceId,
    timestamp: new Date().toISOString(),
    method,
    path: url,
    statusCode,
    duration,
    source: serviceName,
    target: targetService,
    service: serviceName,
    direction: 'outgoing',
    payload: payload ? summarizePayload(payload) : undefined,
    error: error || undefined,
  });
}

function summarizePayload(data) {
  if (!data || typeof data !== 'object') return data;
  const keys = Object.keys(data);
  if (keys.length <= 6) return data;
  const summary = {};
  keys.slice(0, 5).forEach(k => { summary[k] = data[k]; });
  summary['...'] = `+${keys.length - 5} more fields`;
  return summary;
}

module.exports = { trafficMiddleware, logOutgoingCall, getLog, clearLog };
