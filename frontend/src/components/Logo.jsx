/** Three offset translucent sheets — an onion skin. */
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--onion-prev)" opacity="0.35" />
      <rect x="7" y="7" width="18" height="18" rx="4" fill="var(--onion-next)" opacity="0.35" />
      <rect x="11" y="11" width="18" height="18" rx="4" fill="var(--accent)" />
    </svg>
  )
}
