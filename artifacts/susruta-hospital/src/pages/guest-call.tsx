import React from "react";
import { useParams } from "wouter";
import { GuestCallPage } from "@/components/VideoCall";

export default function GuestCall() {
  const params = useParams<{ apptId: string }>();
  const apptId = parseInt(params.apptId ?? "0", 10);
  if (!apptId) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Invalid link</div>;
  return <GuestCallPage apptId={apptId} />;
}
