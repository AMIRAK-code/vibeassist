import React, { useEffect, useState } from 'react';

// Seconds since a request started, so a long wait never looks frozen
export default function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span>{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}
