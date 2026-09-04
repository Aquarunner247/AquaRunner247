"use client";

export function PlacardPrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="app-btn-primary print:hidden">
      Print placard
    </button>
  );
}
