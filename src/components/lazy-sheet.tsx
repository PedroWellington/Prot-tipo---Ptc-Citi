"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";

const Inner = dynamic(() => import("./sheet"), { ssr: false });

/** Framer Motion só é baixado quando um sheet abre pela primeira vez. */
export function Sheet(props: ComponentProps<typeof Inner>) {
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);
  return mounted ? <Inner {...props} /> : null;
}
