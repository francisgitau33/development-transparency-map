"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, AlertCircle, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { BRANDING } from "@/lib/branding";

interface ResetResponse {
  message: string;
  _dev?: {
    resetUrl: string;
    expiresAt: string;
    note: string;
  };
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [devInfo, setDevInfo] = useState<ResetResponse["_dev"] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setDevInfo(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data: ResetResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to send reset email");
      }

      setSuccess(true);
      if (data._dev) {
        setDevInfo(data._dev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div
        data-design-id="forgot-password-page"
        className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4"
      >
        <div
          data-design-id="forgot-password-container"
          className="w-full max-w-md"
        >
          <div
            data-design-id="forgot-password-header"
            className="text-center mb-8"
          >
            <div
              data-design-id="forgot-password-logo"
              className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-2xl mb-4"
            >
              <KeyRound className="w-8 h-8 text-amber-600" />
            </div>
            <h1
              data-design-id="forgot-password-title"
              className="text-2xl font-bold text-slate-900"
            >
              Reset Password
            </h1>
            <p
              data-design-id="forgot-password-subtitle"
              className="text-slate-600 mt-2"
            >
              Enter your email to receive a password reset link
            </p>
          </div>

          <Card data-design-id="forgot-password-card">
            <CardHeader>
              <CardTitle>Forgot your password?</CardTitle>
              <CardDescription>
                We&apos;ll send you instructions to reset it.
              </CardDescription>
            </CardHeader>

            {error && (
              <div className="px-6">
                <Alert variant="destructive" data-design-id="forgot-password-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            {success ? (
              <CardContent data-design-id="forgot-password-success" className="space-y-4">
                <Alert className="border-sky-200 bg-sky-50">
                  <CheckCircle className="h-4 w-4 text-sky-600" />
                  <AlertDescription className="text-sky-800">
                    If an account exists with this email, a password reset link has been sent.
                    Please check your email.
                  </AlertDescription>
                </Alert>

                {/* Development mode: Show reset link directly */}
                {devInfo && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                    <p className="font-semibold text-amber-800 mb-2">
                      🔧 Development Mode
                    </p>
                    <p className="text-amber-700 mb-3">
                      {devInfo.note}
                    </p>
                    <Link
                      href={devInfo.resetUrl}
                      className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      Reset Password Now
                    </Link>
                    <p className="text-xs text-amber-600 mt-2">
                      Expires: {new Date(devInfo.expiresAt).toLocaleString()}
                    </p>
                  </div>
                )}

                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </CardContent>
            ) : (
              <form onSubmit={handleSubmit}>
                <CardContent data-design-id="forgot-password-form" className="space-y-4">
                  <div data-design-id="forgot-password-email-field" className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@organization.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </CardContent>
                <CardFooter data-design-id="forgot-password-footer" className="flex flex-col space-y-3">
                  <Button
                    type="submit"
                    className="w-full bg-sky-600 hover:bg-sky-700"
                    disabled={loading}
                    data-design-id="forgot-password-submit"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                  <Link href="/login" className="w-full">
                    <Button variant="ghost" className="w-full text-slate-600">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Login
                    </Button>
                  </Link>
                </CardFooter>
              </form>
            )}
          </Card>

          <p
            data-design-id="forgot-password-back-link"
            className="text-center mt-6 text-sm text-slate-600"
          >
            <Link href="/" className="hover:text-sky-600 transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}