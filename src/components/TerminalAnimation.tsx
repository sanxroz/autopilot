interface TerminalAnimationProps {
  color: string;
}

const ASCII_LOGO = `
 █████╗ ██╗   ██╗████████╗ ██████╗ ██████╗ ██╗██╗      ██████╗ ████████╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝
███████║██║   ██║   ██║   ██║   ██║██████╔╝██║██║     ██║   ██║   ██║   
██╔══██║██║   ██║   ██║   ██║   ██║██╔═══╝ ██║██║     ██║   ██║   ██║   
██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║     ██║███████╗╚██████╔╝   ██║   
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝    ╚═╝   
`.trim();

export function TerminalAnimation({ color }: TerminalAnimationProps) {
  return (
    <pre
      style={{
        color,
        fontFamily: "monospace",
        fontSize: "10px",
        lineHeight: "1.1",
        opacity: 0.8,
      }}
    >
      {ASCII_LOGO}
    </pre>
  );
}
