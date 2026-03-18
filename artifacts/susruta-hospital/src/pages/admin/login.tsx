import React, { useState } from "react";
import { useAdminLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import logoImg from "@assets/logo_1773840200056.png";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const loginMutation = useAdminLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { username, password } }, {
      onSuccess: () => {
        window.location.href = "/admin";
      },
      onError: (err: any) => {
        setError(err.message || "Invalid credentials");
      }
    });
  };

  return (
    <div className="min-h-screen bg-muted/50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-border p-8 text-center">
        <div className="flex flex-col items-center mb-8">
          <img src="/favicon.png" alt="Susruta Hospital" className="h-16 w-16 object-contain mb-3" />
          <h2 className="font-serif font-bold text-xl text-foreground">Susruta Hospital</h2>
          <p className="text-sm text-muted-foreground">Tirupati</p>
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground mb-8">Admin Access</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6 text-left">
          {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>}
          
          <div>
            <label className="block text-sm font-semibold mb-2">Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
          
          <Button type="submit" className="w-full" size="lg" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}
