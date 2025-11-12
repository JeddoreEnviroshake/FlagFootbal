// error-handler.js
export function report(error, context = {}) {
  // Normalize to an Error object
  const errObj = error instanceof Error ? error : new Error(String(error));

  // Console log for dev
  console.error('[AppError]', errObj, context);

  // On-screen message (only for development)
  if (import.meta.env?.MODE === 'development' || !import.meta.env) {
    const pre = document.createElement('pre');
    pre.textContent = `Error: ${errObj.message}\n${context.src || ''}`;
    pre.style.padding = '12px';
    pre.style.background = '#111';
    pre.style.color = '#f33';
    pre.style.whiteSpace = 'pre-wrap';
    document.body.insertBefore(pre, document.body.firstChild);
  }

  // Optional: Send to remote logging service
  // fetch('/log-error', { method: 'POST', body: JSON.stringify({ error: errObj, context }) });
}

// Global error listener (catches script errors)
window.addEventListener('error', e => {
  report(e.error || e.message, { type: 'onerror', src: e.filename, line: e.lineno });
});

// Global unhandled promise rejections
window.addEventListener('unhandledrejection', e => {
  report(e.reason, { type: 'unhandledrejection' });
});

// Optional helper wrapper for async calls
export async function withErrors(fn) {
  try {
    return await fn();
  } catch (err) {
    report(err);
    return null;
  }
}
