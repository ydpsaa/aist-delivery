import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAdminLogin } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const loginMutation = useAdminLogin({
    mutation: {
      onSuccess: (data) => {
        if (data.user?.role !== "admin") {
          toast({
            variant: "destructive",
            title: "Access denied",
            description: "This panel is for administrators only.",
          });
          return;
        }
        setAuthToken(data.accessToken);
        toast({
          title: "Login successful",
          description: "Welcome to AIST Control Room.",
        });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: error.data?.error || "Invalid credentials. Please try again.",
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 p-4 relative overflow-hidden">
      {/* Blue ambient background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 right-0 w-[70%] h-[70%] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(23,98,255,0.04),transparent)]" />
      </div>
      
      <div className="w-full max-w-md relative z-10">
        {/* AIST Brand header */}
        <div className="flex flex-col items-center mb-8 text-white">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10 mb-4 overflow-hidden">
            <img
              src="/aist-logo.png"
              alt="AIST"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AIST Logistics</h1>
          <p className="text-zinc-400 mt-2 text-sm">Central Dispatch Control</p>
        </div>

        <Card className="border-white/8 bg-white/4 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl text-white">Secure Access</CardTitle>
            <CardDescription className="text-zinc-400">
              Enter your dispatcher credentials to continue.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@aist.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loginMutation.isPending}
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                  className="bg-zinc-800/50 border-zinc-700 text-white focus-visible:ring-primary"
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 shadow-lg shadow-primary/20 transition-all"
                disabled={loginMutation.isPending || !email || !password}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Initialize Session"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-zinc-600 text-xs mt-6">
          AIST Delivery Platform · Admin Panel
        </p>
      </div>
    </div>
  );
}
