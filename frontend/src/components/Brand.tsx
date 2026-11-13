import type { SVGProps } from 'react';

export function Mark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 58 45" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M8.33 0H36.67Q45 0 45 8.33V9.33Q45 10.33 44.08 10.83L22.5 22.42Q20.83 23.33 22.5 24.25L44.08 35.83Q45 36.33 45 37.33V38.33Q45 45 38.33 45H8.33Q0 45 0 36.67V8.33Q0 0 8.33 0Z"
      />
      <path
        fill="var(--yield, #80aaff)"
        d="M27.67 22.33L55 7.25Q57.5 5.83 57.5 8.75V37.92Q57.5 40.83 55 39.42L27.67 24.33Q25.83 23.33 27.67 22.33Z"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#" aria-label="Exodus home">
      <Mark />
      <span>
        exodus<span className="brand-network">on NEAR</span>
      </span>
    </a>
  );
}
