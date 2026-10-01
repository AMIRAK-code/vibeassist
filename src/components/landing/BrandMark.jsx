import React, { useId } from 'react';

// Sculpted cobalt V: two rounded clay arms lit from the upper left.
// Decorative by default; pass `title` when the mark stands alone.
export default function BrandMark({ className, title }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      viewBox="0 0 52 41"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
      overflow="visible"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-left`} x1="4" y1="4" x2="26" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4566FF" />
          <stop offset="0.5" stopColor="#2344F5" />
          <stop offset="1" stopColor="#152FC4" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="30" y1="4" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3F61FF" />
          <stop offset="0.45" stopColor="#2141F2" />
          <stop offset="1" stopColor="#122AB2" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="1.8" floodColor="#0E2090" floodOpacity="0.38" />
        </filter>
        <filter id={`${id}-soft`}>
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <path d="M9.8 9 L23.4 32.6" stroke={`url(#${id}-left)`} strokeWidth="15.6" strokeLinecap="round" />
        <path d="M42.2 7.6 L27.6 32.6" stroke={`url(#${id}-right)`} strokeWidth="16.2" strokeLinecap="round" />
      </g>
      {/* Upper-left highlights give the arms their rounded, matte volume */}
      <g filter={`url(#${id}-soft)`} strokeLinecap="round" fill="none">
        <path d="M5.4 9.6 L15.5 27.6" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2.4" />
        <path d="M39 4.2 L31 17.4" stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="2.4" />
      </g>
    </svg>
  );
}
