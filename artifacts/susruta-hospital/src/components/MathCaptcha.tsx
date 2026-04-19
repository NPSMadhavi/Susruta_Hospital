import React, { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";

interface Props {
  onVerified: (verified: boolean) => void;
}

function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export function MathCaptcha({ onVerified }: Props) {
  const [q, setQ] = useState(generateQuestion);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "wrong">("idle");

  useEffect(() => {
    onVerified(false);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (v === "") { setStatus("idle"); onVerified(false); return; }
    const num = parseInt(v, 10);
    if (num === q.answer) {
      setStatus("idle");
      onVerified(true);
    } else {
      setStatus("wrong");
      onVerified(false);
    }
  }

  function refresh() {
    setQ(generateQuestion());
    setValue("");
    setStatus("idle");
    onVerified(false);
  }

  const isCorrect = parseInt(value, 10) === q.answer && value !== "";

  return (
    <div className="bg-muted/50 border border-border rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={15} className="text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">Security Check</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-foreground select-none">
            What is {q.a} + {q.b}?
          </span>
        </div>
        <input
          type="number"
          min="1"
          max="20"
          value={value}
          onChange={handleChange}
          placeholder="?"
          className={[
            "w-16 px-3 py-2 border rounded-xl text-sm font-bold text-center focus:outline-none focus:ring-2 transition-all",
            isCorrect
              ? "border-green-400 bg-green-50 text-green-700 focus:ring-green-200"
              : status === "wrong"
              ? "border-red-300 bg-red-50 text-red-600 focus:ring-red-200"
              : "border-border bg-white focus:ring-primary/20 focus:border-primary",
          ].join(" ")}
        />
        {isCorrect && <span className="text-green-600 text-sm font-bold">✓</span>}
        {status === "wrong" && (
          <button type="button" onClick={refresh} className="text-xs text-primary underline">
            New question
          </button>
        )}
      </div>
      {status === "wrong" && value !== "" && (
        <p className="text-xs text-red-500 mt-2">Incorrect. Please try again.</p>
      )}
    </div>
  );
}
