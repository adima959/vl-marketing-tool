'use client';

/**
 * Global Error Boundary
 *
 * Catches errors in the root layout.tsx that regular error.tsx cannot catch.
 * Must be a client component and include its own <html> and <body> tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</h1>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>
            Something went wrong!
          </h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            {error.message || 'An unexpected error occurred in the application.'}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
