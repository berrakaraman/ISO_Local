import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={{
        "--normal-bg": "var(--popover, #fff)",
        "--normal-text": "var(--popover-foreground, #000)",
        "--normal-border": "var(--border, #e2e8f0)",
      } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
