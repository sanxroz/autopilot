import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, GitGraph } from "lucide-react";
import { cn } from "../utils/cn";

interface StackGroupProps {
  label: string;
  count: number;
  children: ReactNode;
}

export function StackGroup({ label, count, children }: StackGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={cn("w-full min-w-0", !collapsed && "rounded-xl border border-border-subtle bg-tertiary overflow-hidden")}>
      <div
        className={cn(
          "flex flex-col gap-0.5 w-full min-w-0 cursor-pointer select-none transition-colors",
          collapsed ? "rounded-md px-3 py-2 hover:bg-hover" : "px-3 py-2 hover:bg-hover",
        )}
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed(!collapsed);
          }
        }}
        aria-expanded={!collapsed}
        aria-label={`Stack: ${label}, ${count} PRs, ${collapsed ? "collapsed" : "expanded"}`}
      >
        <div className="flex items-center gap-2 w-full min-w-0">
          <GitGraph className="h-3.5 w-3.5 flex-shrink-0 text-tertiary" />
          <span className="text-sm font-medium truncate min-w-0 flex-1 text-primary">
            {label}
          </span>
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.2 }}
            className="text-tertiary flex-shrink-0"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </div>
        <div className="text-xs flex items-center gap-1 pl-5 text-secondary">
          {count} {count === 1 ? "PR" : "PRs"}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.165, 0.84, 0.44, 1] }}
            className="space-y-1 px-1.5 pb-1.5"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
