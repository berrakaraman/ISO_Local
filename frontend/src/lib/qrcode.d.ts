declare const qrcode: (
  tip: number,
  duzeltme: "L" | "M" | "Q" | "H",
) => { addData(veri: string): void; make(): void; getModuleCount(): number; isDark(satir: number, sutun: number): boolean };
export default qrcode;
