import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
  {
    variants: {
      variant: {
        solid: "bg-[var(--ink)] text-[var(--bg)] hover:opacity-90",
        outline: "border border-[var(--line2)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface2)]",
        accent: "bg-[var(--accent-soft)] text-[var(--accent-ink)] hover:opacity-90",
        ghost: "text-[var(--ink2)] hover:bg-[var(--surface2)]",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4" },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(button({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";
