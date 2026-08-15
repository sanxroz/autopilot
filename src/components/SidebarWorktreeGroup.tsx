import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, FolderTree, Pencil } from "lucide-react";
import { cn } from "../utils/cn";

interface SidebarWorktreeGroupProps {
  readonly label: string;
  readonly count: number;
  readonly children: ReactNode;
  readonly isDropTarget?: boolean;
  readonly isEditing?: boolean;
  readonly editingValue?: string;
  readonly onEditingValueChange?: (value: string) => void;
  readonly onEditingSubmit?: () => void;
  readonly onEditingCancel?: () => void;
  readonly onStartEditing?: () => void;
}

export function SidebarWorktreeGroup({
  label,
  count,
  children,
  isDropTarget = false,
  isEditing = false,
  editingValue = "",
  onEditingValueChange,
  onEditingSubmit,
  onEditingCancel,
  onStartEditing,
}: SidebarWorktreeGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurCancelledRef = useRef(false);
  const toggleCollapsed = () => {
    setCollapsed((current) => !current);
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-xl border bg-tertiary overflow-hidden transition-colors",
        isDropTarget ? "border-accent-primary" : "border-border-subtle"
      )}
    >
      <div
        className="group/sidebar-header flex flex-col gap-0.5 w-full min-w-0 cursor-pointer select-none px-3 py-2 hover:bg-hover transition-colors"
        role="button"
        tabIndex={0}
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
        aria-expanded={!collapsed}
        aria-label={`Group: ${label}, ${count} sessions, ${
          collapsed ? "collapsed" : "expanded"
        }`}
      >
        <div className="flex items-center gap-2 w-full min-w-0">
          <FolderTree className="h-3.5 w-3.5 flex-shrink-0 text-tertiary" />
          {isEditing ? (
            <input
              ref={inputRef}
              value={editingValue}
              onChange={(e) => onEditingValueChange?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEditingSubmit?.();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  blurCancelledRef.current = true;
                  onEditingCancel?.();
                }
              }}
              onBlur={() => {
                if (!blurCancelledRef.current) {
                  onEditingSubmit?.();
                }
                blurCancelledRef.current = false;
              }}
              className="h-[20px] flex-1 min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-primary outline-none"
              aria-label="Group name"
            />
          ) : (
            <span className="text-sm font-medium truncate min-w-0 flex-1 text-primary">
              {label}
            </span>
          )}
          {!isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartEditing?.();
              }}
              className="rounded-sm p-1 text-tertiary opacity-0 transition-all hover:bg-hover hover:text-primary group-hover/sidebar-header:opacity-100 focus-visible:opacity-100"
              aria-label={`Rename ${label}`}
              title="Rename group"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: "spring", duration: 0.35, bounce: 0.15 }
            }
            className="text-tertiary flex-shrink-0"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </div>
        <div className="text-xs flex items-center gap-1 pl-5 text-secondary">
          {count} {count === 1 ? "session" : "sessions"}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.165, 0.84, 0.44, 1] }
            }
            className="space-y-1 px-1.5 py-1.5"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
