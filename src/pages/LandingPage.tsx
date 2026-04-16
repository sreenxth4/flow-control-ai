import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, MapPin, ArrowRight, Lock } from "lucide-react";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">🚦 AI Traffic Management</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Intelligent traffic monitoring and routing for Kukatpally, Hyderabad
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-6 md:grid-cols-2">
        {/* User Portal */}
        <Card className="group cursor-pointer border-2 transition-all hover:border-primary hover:shadow-lg" onClick={() => navigate("/user")}>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">User Portal</CardTitle>
            <CardDescription>Live traffic map, route finder, and traffic conditions</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground">
              Enter <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Admin Portal */}
        <Card className="border-2 transition-all hover:border-accent hover:shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <Shield className="h-7 w-7 text-accent" />
            </div>
            <CardTitle className="text-xl">Admin Portal</CardTitle>
            <CardDescription>Video detection, signal optimization, and system dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            {!showPinInput ? (
              <div className="text-center">
                <Button variant="outline" onClick={() => setShowPinInput(true)}>
                  <Lock className="mr-2 h-4 w-4" /> Admin Login
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Enter Admin PIN</Label>
                  <Input
                    type="password"
                    placeholder="PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                    maxLength={10}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleAdminLogin} disabled={!pin}>
                    Login
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowPinInput(false); setPin(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LandingPage;
