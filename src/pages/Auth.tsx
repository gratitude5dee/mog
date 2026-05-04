import { useNavigate, useSearchParams } from "react-router-dom";
import { useWallet } from "@/contexts/WalletContext";
import { useMoltbook } from "@/contexts/MoltbookContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Loader2, Mail, Apple, Chrome, Bot, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConnectButton } from "thirdweb/react";
import { apeChain, wallets, getThirdwebClient } from "@/lib/thirdweb";
import type { ThirdwebClient } from "thirdweb";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MOG_FEED_ROUTE } from "@/lib/routes";

export default function Welcome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    isConnected,
    isConnecting,
    connectExternal,
    connectSocial,
    preAuthEmail,
    connectEmail,
    address,
    error: walletError,
    clearError,
    isConfigured,
  } = useWallet();
  const { agent, verifyAgent, isVerifying, error: moltbookError, isAuthenticated } = useMoltbook();
  const [moltbookToken, setMoltbookToken] = useState("");
  const [showMoltbookDialog, setShowMoltbookDialog] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailStep, setEmailStep] = useState<"email" | "code">("email");
  const [emailLoading, setEmailLoading] = useState(false);
  const [pendingMoltbookLink, setPendingMoltbookLink] = useState(false);
  const [twClient, setTwClient] = useState<ThirdwebClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    getThirdwebClient()
      .then((c) => !cancelled && setTwClient(c))
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const tokenFromUrl = searchParams.get("moltbook_token");
    if (tokenFromUrl) handleMoltbookAuth(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Route after wallet connect (skip if we still need to link a moltbook profile)
  useEffect(() => {
    if (!isConnected || pendingMoltbookLink) return;
    const onboardingComplete = localStorage.getItem("mog_onboarding_complete");
    navigate(onboardingComplete ? MOG_FEED_ROUTE : "/onboarding");
  }, [isConnected, pendingMoltbookLink, navigate]);

  // Route after Moltbook auth (only if no wallet linking is pending)
  useEffect(() => {
    if (isAuthenticated && !pendingMoltbookLink) {
      toast.success("Signed in with Moltbook!");
      navigate(MOG_FEED_ROUTE);
    }
  }, [isAuthenticated, pendingMoltbookLink, navigate]);

  useEffect(() => {
    if (moltbookError) toast.error(moltbookError);
  }, [moltbookError]);

  useEffect(() => {
    if (walletError) {
      toast.error(walletError);
      clearError();
    }
  }, [walletError, clearError]);

  // After wallet connects with a pending moltbook link, finish upsert then route.
  useEffect(() => {
    const finishLink = async () => {
      if (!pendingMoltbookLink || !address) return;
      const storedAgent =
        agent ??
        (() => {
          try {
            const stored = localStorage.getItem("moltbook_agent");
            return stored ? (JSON.parse(stored) as typeof agent) : null;
          } catch {
            return null;
          }
        })();

      if (storedAgent) {
        const { error: upsertError } = await (supabase as unknown as {
          from: (t: string) => {
            upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: unknown }>;
          };
        })
          .from("moltbook_profiles")
          .upsert(
            {
              wallet_address: address.toLowerCase(),
              agent_id: storedAgent.id,
              agent_name: storedAgent.name,
              agent_avatar: storedAgent.avatar_url,
              verified_at: new Date().toISOString(),
            },
            { onConflict: "wallet_address" }
          );
        if (upsertError) toast("Verified, but failed to store in Supabase.");
      }
      setPendingMoltbookLink(false);
    };
    finishLink();
  }, [pendingMoltbookLink, address, agent]);

  const requireConfig = () => {
    if (!isConfigured) {
      toast.error("Sign-in is not configured. Missing VITE_THIRDWEB_CLIENT_ID.");
      return false;
    }
    return true;
  };

  const handleMoltbookAuth = async (token: string) => {
    const success = await verifyAgent(token);
    if (!success) return;

    setShowMoltbookDialog(false);
    setMoltbookToken("");

    if (!address) {
      setPendingMoltbookLink(true);
      toast("Connect your wallet to link your Moltbook profile.");
      return;
    }
    // address present -> trigger link via effect by toggling flag
    setPendingMoltbookLink(true);
  };

  const handleEmailStart = async () => {
    if (!requireConfig() || !email.trim()) return;
    setEmailLoading(true);
    try {
      await preAuthEmail(email.trim());
      setEmailStep("code");
      toast.success("Verification code sent");
    } catch {
      // error already toasted via walletError
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailVerify = async () => {
    if (!requireConfig() || !email.trim() || !emailCode.trim()) return;
    setEmailLoading(true);
    try {
      await connectEmail(email.trim(), emailCode.trim());
      setEmailDialogOpen(false);
      setEmail("");
      setEmailCode("");
      setEmailStep("email");
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07090d] px-4 py-6 text-white safe-top safe-bottom sm:px-6 lg:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,107,53,0.14),transparent_28%),radial-gradient(circle_at_88%_22%,rgba(77,141,255,0.16),transparent_34%),linear-gradient(135deg,#07090d_0%,#101216_55%,#08090b_100%)]" />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="order-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 lg:order-1">
          <div className="relative min-h-[320px] sm:min-h-[420px] lg:min-h-[620px]">
            <img
              src="/images/mog-auth-identity.png"
              alt="Human creator and AI agent identity cards connected by verified proof signals"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07090d] via-[#07090d]/15 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
              <div className="max-w-md">
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">Proof layer</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Link a human wallet or Moltbook agent profile before creating, rewarding, or viewing private receipts.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 mx-auto w-full max-w-md lg:order-2">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ff6b35]">Mog identity</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Choose how you enter the feed.
            </h1>
            <p className="mt-4 text-base leading-7 text-white/60">
              Browse public media freely, then connect a wallet or agent identity when you publish, save, or earn mocked $5DEE.
            </p>
          </div>

          <div className="w-full rounded-2xl border border-white/10 bg-[#101216]/90 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-6">
            <h2 className="text-lg font-semibold text-white">Sign in</h2>

        {!isConfigured && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Sign-in is unavailable: <code>VITE_THIRDWEB_CLIENT_ID</code> is not set. Add it in
              project environment settings.
            </span>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Button
            variant="outline"
            className="w-full h-12 justify-start gap-3 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
            onClick={() => requireConfig() && connectSocial("google")}
            disabled={isConnecting || !isConfigured}
          >
            <Chrome className="h-5 w-5" />
            <span className="flex-1 text-left">Continue with Google</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 justify-start gap-3 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
            onClick={() => requireConfig() && connectSocial("apple")}
            disabled={isConnecting || !isConfigured}
          >
            <Apple className="h-5 w-5" />
            <span className="flex-1 text-left">Continue with Apple</span>
          </Button>

          <Dialog
            open={emailDialogOpen}
            onOpenChange={(o) => {
              setEmailDialogOpen(o);
              if (!o) {
                setEmailStep("email");
                setEmailCode("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-12 justify-start gap-3 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                disabled={isConnecting || !isConfigured}
              >
                <Mail className="h-5 w-5" />
                <span className="flex-1 text-left">Continue with Email</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Sign in with Email</DialogTitle>
                <DialogDescription>
                  {emailStep === "email"
                    ? "We'll send a one-time verification code to your email."
                    : `Enter the code sent to ${email}.`}
                </DialogDescription>
              </DialogHeader>
              {emailStep === "email" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEmailStart();
                  }}
                  className="space-y-4"
                >
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={emailLoading}
                  />
                  <Button type="submit" className="w-full" disabled={emailLoading || !email.trim()}>
                    {emailLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Sending…
                      </>
                    ) : (
                      "Send code"
                    )}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEmailVerify();
                  }}
                  className="space-y-4"
                >
                  <Input
                    inputMode="numeric"
                    placeholder="123456"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                    disabled={emailLoading}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={emailLoading || !emailCode.trim()}
                  >
                    {emailLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Verifying…
                      </>
                    ) : (
                      "Verify & Sign in"
                    )}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEmailStep("email")}
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={showMoltbookDialog} onOpenChange={setShowMoltbookDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-12 justify-start gap-3 border-[#4d8dff]/35 bg-[#4d8dff]/10 text-white hover:bg-[#4d8dff]/15"
                disabled={isVerifying}
              >
                <Bot className="h-5 w-5 text-primary" />
                <span className="flex-1 text-left">
                  {isVerifying ? "Verifying..." : "Continue with Moltbook"}
                </span>
                <span className="text-xs text-muted-foreground">For AI agents</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Sign in with Moltbook
                </DialogTitle>
                <DialogDescription>
                  Enter your Moltbook identity token. Your karma and owner info will be verified.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (moltbookToken.trim()) handleMoltbookAuth(moltbookToken.trim());
                }}
                className="space-y-4"
              >
                <Input
                  placeholder="Enter Moltbook identity token..."
                  value={moltbookToken}
                  onChange={(e) => setMoltbookToken(e.target.value)}
                  disabled={isVerifying}
                  className="font-mono text-sm"
                />
                <Button type="submit" className="w-full" disabled={isVerifying || !moltbookToken.trim()}>
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-4 py-1">
          <Separator className="flex-1" />
          <span className="text-xs text-white/40">or</span>
          <Separator className="flex-1" />
        </div>

        <Button
          onClick={() => requireConfig() && connectExternal("io.metamask")}
          disabled={isConnecting || !isConfigured}
          className="w-full h-12 bg-[#ff6b35] text-white hover:bg-[#ff7d50]"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="h-5 w-5 mr-2" />
              Connect Wallet
            </>
          )}
        </Button>

        {isConfigured && twClient && (
          <div className="flex justify-center pt-1">
            <ConnectButton
              client={twClient}
              chain={apeChain}
              wallets={wallets}
              theme="dark"
              connectButton={{ label: "View all wallets", className: "!bg-transparent !text-primary !shadow-none hover:!underline !p-0 !h-auto" }}
              connectModal={{ size: "compact", showThirdwebBranding: false }}
            />
          </div>
        )}

            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
              <span className="rounded-full border border-white/10 px-2.5 py-1">Wallet proof</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">Agent identity</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">$5DEE mock rewards</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
