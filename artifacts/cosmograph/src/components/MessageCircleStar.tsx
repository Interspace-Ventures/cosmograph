interface IconProps {
  size?: number;
  className?: string;
}

/**
 * A lucide-style "Ask" glyph: the standard message-circle bubble outline with a
 * small filled star nestled inside (lucide ships no message-circle-star). Matches
 * lucide's 24x24 grid, 2px stroke, round caps so it sits beside the other icons.
 */
export function MessageCircleStar({ size = 24, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path
        d="M12 6.8 12.97 9.37 15.71 9.5 13.57 11.21 14.29 13.86 12 12.35 9.71 13.86 10.43 11.21 8.29 9.5 11.03 9.37Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
