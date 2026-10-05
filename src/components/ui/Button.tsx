import { type ButtonHTMLAttributes, type ReactNode } from "react";
type ButtonVariant = "primary" | "secondary" | "secondary-green" | "accent-blue" | "ghost" | "danger" | "warning";
type ButtonSize    = "sm" | "md" | "lg";
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow-md",
  secondary:
    "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700",
  "secondary-green":
  "bg-[#5cb88a]/[0.06] border border-[#5cb88a]/30 text-[#0F6E56] hover:bg-[#5cb88a]/[0.13] dark:bg-[#5cb88a]/[0.08] dark:border-[#5cb88a]/30 dark:text-[#5cb88a] dark:hover:bg-[#5cb88a]/[0.15]",
  "accent-blue":
    "rounded-full bg-white border border-[#3E6FE0]/30 text-[#3E6FE0] hover:bg-[#3E6FE0]/[0.08] hover:border-[#3E6FE0]/50 hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(62,111,224,0.18)] dark:bg-gray-800 dark:border-[#3E6FE0]/30 dark:text-[#3E6FE0] dark:hover:bg-[#3E6FE0]/[0.15] dark:hover:-translate-y-px dark:hover:shadow-[0_4px_10px_rgba(62,111,224,0.25)]",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
  danger:
    "bg-red-600 text-white hover:bg-red-500 dark:bg-red-700 dark:hover:bg-red-600",
  warning:
    "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500",
};
// Estado desabilitado com cores próprias (em vez de só baixar a opacidade) para
// variantes que, como accent-blue, ficam quase invisíveis quando apenas esmaecidas.
const disabledVariantClasses: Partial<Record<ButtonVariant, string>> = {
  "accent-blue":
    "rounded-full bg-gray-100 border border-gray-300 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400",
};
const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:    ButtonVariant;
  size?:       ButtonSize;
  children:    ReactNode;
  isLoading?:  boolean;
  /** Texto exibido durante loading. Default: "Salvando...". */
  loadingText?: string;
}
export function Button({
  variant     = "primary",
  size        = "md",
  children,
  isLoading,
  loadingText = "Salvando...",
  className   = "",
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const hasCustomDisabledStyle = isDisabled && Boolean(disabledVariantClasses[variant]);
  return (
    <button
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        hasCustomDisabledStyle ? "disabled:cursor-not-allowed" : "disabled:cursor-not-allowed disabled:opacity-50",
        hasCustomDisabledStyle ? disabledVariantClasses[variant] : variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
