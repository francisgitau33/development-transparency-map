"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, AlertCircle, Loader2, CheckCircle, ArrowLeft, XCircle } from "lucide-react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!email || !token) {
        setTokenValid(false);
        setValidating(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/auth/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        setTokenValid(data.valid === true);
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [email, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (validating) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  // Invalid or missing token
  if (!tokenValid) {
    return (
      <Card data-design-id="reset-password-invalid">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle>Invalid or Expired Link</CardTitle>
          <CardDescription>
            This password reset link is invalid, has expired, or has already been used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/forgot-password">
            <Button className="w-full bg-sky-600 hover:bg-sky-700">
              Request New Reset Link
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Success state
  if (success) {
    return (
      <Card data-design-id="reset-password-success">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-full mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-sky-600" />
          </div>
          <CardTitle>Password Reset Successful</CardTitle>
          <CardDescription>
            Your password has been updated. You can now log in with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button className="w-full bg-sky-600 hover:bg-sky-700">
              Go to Login
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Reset form
  return (
    <Card data-design-id="reset-password-card">
      <CardHeader>
        <CardTitle>Create New Password</CardTitle>
        <CardDescription>
          Enter a new password for {email}
        </CardDescription>
      </CardHeader>

      {error && (
        <div className="px-6">
          <Alert variant="destructive" data-design-id="reset-password-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <CardContent data-design-id="reset-password-form" className="space-y-4">
          <div data-design-id="reset-password-password-field" className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
            <p className="text-xs text-slate-500">Minimum 8 characters</p>
          </div>
          <div data-design-id="reset-password-confirm-field" className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter data-design-id="reset-password-footer">
          <Button
            type="submit"
            className="w-full bg-sky-600 hover:bg-sky-700"
            disabled={loading}
            data-design-id="reset-password-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicLayout>
      <div
        data-design-id="reset-password-page"
        className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4"
      >
        <div
          data-design-id="reset-password-container"
          className="w-full max-w-md"
        >
          <div
            data-design-id="reset-password-header"
            className="text-center mb-8"
          >
            <div
              data-design-id="reset-password-logo"
              className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-2xl mb-4"
            >
              <KeyRound className="w-8 h-8 text-sky-600" />
            </div>
            <h1
              data-design-id="reset-password-title"
              className="text-2xl font-bold text-slate-900"
            >
              Reset Password
            </h1>
          </div>

          <Suspense fallback={
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                </div>
              </CardContent>
            </Card>
          }>
            <ResetPasswordContent />
          </Suspense>

          <p
            data-design-id="reset-password-back-link"
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