/**
 * MediumIcon — inline SVG mark.
 *
 * Medium is not available in the project's installed lucide-react
 * build, and the spec explicitly prefers a small inline SVG component
 * over adding a heavy dependency. This is the simplified "M-in-a-
 * circle" monogram used as Medium's current rounded brand mark —
 * dependency-free, sized via CSS (width / height props), colored via
 * `currentColor` so it matches the surrounding text / link color.
 */
import type { SVGProps } from "react";

export function MediumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.974 6.057v.355l-1.483 1.42a.434.434 0 0 0-.165.417v10.465a.435.435 0 0 0 .165.417l1.45 1.42v.313H11.66v-.303l1.502-1.456c.148-.148.148-.19.148-.418V10.23l-4.175 10.6h-.564L3.7 10.23v7.104a.98.98 0 0 0 .27.814l1.953 2.367v.313H.391v-.313l1.953-2.367a.95.95 0 0 0 .252-.814V9.149a.72.72 0 0 0-.237-.609L.641 6.057v-.355h5.392l4.166 9.131 3.66-9.131h5.115z" />
    </svg>
  );
}