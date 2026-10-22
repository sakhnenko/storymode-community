import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { ADAPTIVE_SURFACE_BASE, useContentAdaptiveSurface } from "./adaptive-surface";
import type { AdaptiveSurface } from "@/hooks/useAdaptiveSurfaceTheme";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    surface?: AdaptiveSurface | "auto" | "static";
  }
>(({ className, align = "center", sideOffset = 6, surface = "auto", ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);
  const resolved = useContentAdaptiveSurface(
    innerRef,
    surface === "static" ? undefined : surface,
  );
  const isStatic = surface === "static";
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={innerRef as any}
        align={align}
        sideOffset={sideOffset}
        data-surface={isStatic ? undefined : resolved}
        className={cn(
          "z-50 w-72 rounded-xl p-4 outline-none",
          isStatic
            ? "border bg-popover text-popover-foreground shadow-md"
            : ADAPTIVE_SURFACE_BASE,
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:transition-none motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
