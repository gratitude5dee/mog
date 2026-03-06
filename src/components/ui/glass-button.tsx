import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const glassButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden group",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-primary/80 to-primary/60 backdrop-blur-lg border border-primary/20 text-primary-foreground shadow-lg hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)]",
        secondary:
          "bg-gradient-to-br from-secondary/80 to-secondary/60 backdrop-blur-lg border border-secondary/30 text-secondary-foreground hover:from-secondary hover:to-secondary/80 shadow-md",
        ghost:
          "backdrop-blur-sm border border-border/50 hover:bg-white/[0.06] hover:border-border text-foreground shadow-sm hover:shadow-md",
        outline:
          "border border-primary/50 backdrop-blur-sm hover:bg-primary/10 hover:border-primary text-primary shadow-sm",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-9 px-4 py-2",
        lg: "h-10 px-6",
        xl: "h-12 px-8 text-base",
        icon: "h-9 w-9",
      },
      glow: {
        none: "",
        subtle: "hover:shadow-[0_0_8px_hsl(var(--primary)/0.3)]",
        medium: "hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)]",
        intense: "hover:shadow-[0_0_24px_hsl(var(--primary)/0.6)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
      glow: "subtle",
    },
  }
)

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  asChild?: boolean
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, glow, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        className={cn(glassButtonVariants({ variant, size, glow, className }))}
        ref={ref}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/[0.08] opacity-30 pointer-events-none rounded-lg" />
        <div className="relative z-10 flex items-center gap-2">
          {children}
        </div>
      </Comp>
    )
  }
)
GlassButton.displayName = "GlassButton"

export { GlassButton, glassButtonVariants }
