import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 21s-6.5-5.2-8-9.5A5.9 5.9 0 0 1 12 5.2a5.9 5.9 0 0 1 8 6.3C18.5 15.8 12 21 12 21Z"
        fill="currentColor"
      />
      <circle cx="12" cy="11" r="2.4" fill="#fff" />
    </svg>
  );
}
