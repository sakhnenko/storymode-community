import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-mono font-normal ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-gradient-to-b from-primary via-primary to-primary/80 text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.01),inset_0_-2px_0_0_hsl(0_0%_0%/0.2),0_2px_4px_0_hsl(0_0%_0%/0.25)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25),inset_0_-2px_0_0_hsl(0_0%_0%/0.2),0_2px_4px_0_hsl(0_0%_0%/0.25)] hover:from-primary/95 hover:via-primary/95 hover:to-primary/75 active:shadow-[inset_0_2px_4px_0_hsl(0_0%_0%/0.25)] active:translate-y-[1px]",
      destructive: "bg-gradient-to-b from-destructive via-destructive to-destructive/80 text-destructive-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.01),inset_0_-2px_0_0_hsl(0_0%_0%/0.2),0_2px_4px_0_hsl(0_0%_0%/0.25)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25),inset_0_-2px_0_0_hsl(0_0%_0%/0.2),0_2px_4px_0_hsl(0_0%_0%/0.25)] hover:from-destructive/95 hover:via-destructive/95 hover:to-destructive/75 active:shadow-[inset_0_2px_4px_0_hsl(0_0%_0%/0.25)] active:translate-y-[1px]",
      outline: "border border-input bg-background text-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.01),inset_0_-2px_0_0_hsl(0_0%_0%/0.1),0_2px_4px_0_hsl(0_0%_0%/0.1)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.5),inset_0_-2px_0_0_hsl(0_0%_0%/0.1),0_2px_4px_0_hsl(0_0%_0%/0.1)] hover:bg-muted/30 active:shadow-[inset_0_2px_4px_0_hsl(0_0%_0%/0.15)] active:translate-y-[1px]",
      secondary: "bg-gradient-to-b from-secondary via-secondary to-secondary/80 text-secondary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.01),inset_0_-2px_0_0_hsl(0_0%_0%/0.15),0_2px_4px_0_hsl(0_0%_0%/0.2)] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2),inset_0_-2px_0_0_hsl(0_0%_0%/0.15),0_2px_4px_0_hsl(0_0%_0%/0.2)] hover:from-secondary/95 hover:via-secondary/95 hover:to-secondary/75 active:shadow-[inset_0_2px_4px_0_hsl(0_0%_0%/0.2)] active:translate-y-[1px]",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline"
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  className,
  variant,
  size,
  asChild = false,
  ...props
}, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";
export { Button, buttonVariants };