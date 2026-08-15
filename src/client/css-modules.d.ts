/** CSS module type shim (this package uses plain string CSS, not modules). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
