"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-context";
import { Globe, AlertCircle, Loader2 } from "lucide-react";
import { BRANDING } from "@/lib/branding";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerOrg, setRegisterOrg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await login(loginEmail, loginPassword);

    if (result.success && result.redirectTo) {
      router.push(result.redirectTo);
    } else {
      setError(result.error || "Login failed");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await register(registerEmail, registerPassword, registerName, registerOrg);

    if (result.success && result.redirectTo) {
      router.push(result.redirectTo);
    } else {
      setError(result.error || "Registration failed");
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div
        data-design-id="login-page"
        className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4"
      >
        <div
          data-design-id="login-container"
          className="w-full max-w-md"
        >
          <div
            data-design-id="login-header"
            className="text-center mb-8"
          >
            <div
              data-design-id="login-logo"
              className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4"
            >
              <Globe className="w-8 h-8 text-emerald-600" />
            </div>
            <h1
              data-design-id="login-title"
              className="text-2xl font-bold text-slate-900"
            >
              Partner Access
            </h1>
            <p
              data-design-id="login-subtitle"
              className="text-slate-600 mt-2"
            >
              Sign in to manage your organization&apos;s development projects
            </p>
          </div>

          <Card data-design-id="login-card">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <CardHeader data-design-id="login-card-header">
                <TabsList data-design-id="login-tabs" className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-design-id="login-tab-signin">Sign In</TabsTrigger>
                  <TabsTrigger value="register" data-design-id="login-tab-register">Register</TabsTrigger>
                </TabsList>
              </CardHeader>

              {error && (
                <div className="px-6">
                  <Alert variant="destructive" data-design-id="login-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              <TabsContent value="login">
                <form onSubmit={handleLogin}>
                  <CardContent data-design-id="login-form" className="space-y-4">
                    <div data-design-id="login-email-field" className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@organization.org"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div data-design-id="login-password-field" className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                  </CardContent>
                  <CardFooter data-design-id="login-footer">
                    <Button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={loading}
                      data-design-id="login-submit"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister}>
                  <CardContent data-design-id="register-form" className="space-y-4">
                    <div data-design-id="register-name-field" className="space-y-2">
                      <Label htmlFor="register-name">Full Name</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Jane Smith"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <div data-design-id="register-email-field" className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@organization.org"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div data-design-id="register-password-field" className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={loading}
                      />
                      <p className="text-xs text-slate-500">Minimum 8 characters</p>
                    </div>
                    <div data-design-id="register-org-field" className="space-y-2">
                      <Label htmlFor="register-org">Organization Name (Optional)</Label>
                      <Input
                        id="register-org"
                        type="text"
                        placeholder="Your NGO or Agency"
                        value={registerOrg}
                        onChange={(e) => setRegisterOrg(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </CardContent>
                  <CardFooter data-design-id="register-footer" className="flex flex-col space-y-4">
                    <Button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={loading}
                      data-design-id="register-submit"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Request Access"
                      )}
                    </Button>
                    <p className="text-xs text-slate-500 text-center">
                      By registering, you request access to contribute project data.
                      A system administrator will review your request.
                    </p>
                  </CardFooter>
                </form>
              </TabsContent>
            </Tabs>
          </Card>

          <p
            data-design-id="login-back-link"
            className="text-center mt-6 text-sm text-slate-600"
          >
            <Link href="/" className="hover:text-emerald-600 transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}