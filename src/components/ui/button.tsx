import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[oklch(0.85_0_0)] text-foreground border border-foreground/20 shadow-none hover:bg-[oklch(0.65_0_0)]",
        destructive: "bg-[oklch(0.85_0_0)] text-foreground border border-foreground/20 shadow-none hover:bg-[oklch(0.65_0_0)]",
        outline: "border border-foreground bg-background text-foreground shadow-none hover:bg-secondary",
        secondary: "border border-foreground bg-background text-foreground shadow-none hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        link: "text-foreground underline-offset-4 hover:underline",
        studio: "bg-background text-foreground border border-foreground/30 shadow-none hover:bg-secondary uppercase tracking-[0.16em] text-[11px]",
        studioOutline: "border border-foreground bg-background text-foreground shadow-none hover:bg-secondary uppercase tracking-[0.16em] text-[11px]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-11 rounded-xl px-4 text-xs",
        lg: "h-12 rounded-xl px-8",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
