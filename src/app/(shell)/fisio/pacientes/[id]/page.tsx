"use client";

import { use } from "react";
import { TreatmentDetail } from "@/components/treatment-detail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TreatmentDetail id={use(params).id} />;
}
