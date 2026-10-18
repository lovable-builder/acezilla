import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-5", className)} {...props} />
);
