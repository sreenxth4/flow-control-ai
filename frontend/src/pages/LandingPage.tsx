import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, MapPin, ArrowRight, Lock, Activity, Route, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";

const LandingPage = () => {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [pin, setPin] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);

  const handleAdminLogin = () => {
    if (login(pin)) {
      navigate("/admin");
    } else {
      toast.error("Invalid PIN");
      setPin("");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* ── Dark background with animated gradient ── */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(34,197,94,0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(15,23,42,1) 0%, rgba(2,6,23,1) 100%)
          `,
        }}
      />

      {/* ── Animated grid lines (road pattern) ── */}
      <div
        className="absolute inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Animated glow orbs ── */}
      <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-green-500/10 blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-blue-500/8 blur-[80px] animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 right-1/3 h-36 w-36 rounded-full bg-amber-500/8 blur-[60px] animate-pulse" style={{ animationDelay: "2s" }} />

      {/* ── Hero content ── */}
      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center">
          <img
            src="/logo.png"
            alt="AI Traffic Flow Control System"
            className="h-28 w-auto drop-shadow-[0_0_30px_rgba(34,197,94,0.3)]"
          />
        </div>

        {/* Title */}
        <h1 className="text-5xl font-extrabold tracking-tight text-white mb-3 text-center">
          AI Traffic Flow
          <span className="block bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Control System
          </span>
        </h1>

        <p className="mb-4 max-w-md text-center text-base text-gray-400">
          Real-time vehicle detection, tracking, and adaptive signal control
        </p>

        <p className="mb-10 text-sm text-gray-500">
          Kukatpally Zone, Hyderabad
        </p>

        {/* ── Feature pills ── */}
        <div className="mb-10 flex flex-wrap justify-center gap-3">
          {[
            { icon: <Eye className="h-3.5 w-3.5" />, label: "YOLOv9 Detection" },
            { icon: <Activity className="h-3.5 w-3.5" />, label: "Adaptive Signals" },
            { icon: <Route className="h-3.5 w-3.5" />, label: "Smart Routing" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-gray-900/60 px-4 py-1.5 text-xs text-gray-300 backdrop-blur-sm"
            >
              {f.icon}
              {f.label}
            </div>
          ))}
        </div>

        {/* ── Portal cards ── */}
        <div className="grid w-full max-w-2xl gap-6 md:grid-cols-2">
          {/* User Portal */}
          <Card
            className="group cursor-pointer border-gray-700/50 bg-gray-900/60 backdrop-blur-md transition-all duration-300 hover:border-emerald-500/60 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] hover:-translate-y-1"
            onClick={() => navigate("/user")}
          >
            <CardHeader className="text-center pb-3">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/20 transition-all group-hover:bg-emerald-500/25 group-hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                <MapPin className="h-7 w-7 text-emerald-400" />
              </div>
              <CardTitle className="text-xl text-white">User Portal</CardTitle>
              <CardDescription className="text-gray-400">
                Live traffic map, route finder, and traffic conditions
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button
                variant="outline"
                className="border-emerald-500/60 bg-emerald-500/10 text-white font-medium hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
              >
                Enter <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Admin Portal */}
          <Card className="border-gray-700/50 bg-gray-900/60 backdrop-blur-md transition-all duration-300 hover:border-blue-500/60 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] hover:-translate-y-1">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/20">
                <Shield className="h-7 w-7 text-blue-400" />
              </div>
              <CardTitle className="text-xl text-white">Admin Portal</CardTitle>
              <CardDescription className="text-gray-400">
                Video detection, signal optimization, and system dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showPinInput ? (
                <div className="text-center">
                  <Button
                    variant="outline"
                    className="border-blue-500/60 bg-blue-500/10 text-white font-medium hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all"
                    onClick={() => setShowPinInput(true)}
                  >
                    <Lock className="mr-2 h-4 w-4" /> Admin Login
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400">Enter Admin PIN</Label>
                    <Input
                      type="password"
                      placeholder="PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                      maxLength={10}
                      autoFocus
                      className="bg-gray-800/60 border-gray-600 text-white placeholder:text-gray-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={handleAdminLogin} disabled={!pin}>
                      Login
                    </Button>
                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => { setShowPinInput(false); setPin(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <p className="mt-10 text-xs text-gray-600">
          Powered by YOLOv9 · Max-Pressure Optimization · Dijkstra Routing
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
