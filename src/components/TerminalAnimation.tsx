import { cn } from "../utils/cn";

interface TerminalAnimationProps {
  className?: string;
}

const ASCII_LOGO = `
 █████╗ ██╗   ██╗████████╗ ██████╗ ██████╗ ██╗██╗      ██████╗ ████████╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝
███████║██║   ██║   ██║   ██║   ██║██████╔╝██║██║     ██║   ██║   ██║   
██╔══██║██║   ██║   ██║   ██║   ██║██╔═══╝ ██║██║     ██║   ██║   ██║   
██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║     ██║███████╗╚██████╔╝   ██║   
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝    ╚═╝   
`.trim();

export function TerminalAnimation({ className }: TerminalAnimationProps) {
  return (
    <pre
      className={cn(
        "font-mono text-[10px] leading-tight opacity-80",
        className
      )}
    >
      {ASCII_LOGO}
    </pre>
  );
}
