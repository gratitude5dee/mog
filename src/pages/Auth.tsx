import { useNavigate, useSearchParams } from "react-router-dom";
import { useWallet } from "@/contexts/WalletContext";
import { useMoltbook } from "@/contexts/MoltbookContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Music, Loader2, Mail, Apple, Chrome, Bot, AlertTriangle } from "lucide-react";
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
import { thirdwebClient, apeChain, wallets, isThirdwebConfigured } from "@/lib/thirdweb";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    const tokenFromUrl = searchParams.get("moltbook_token");
    if (tokenFromUrl) handleMoltbookAuth(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Route after wallet connect (skip if we still need to link a moltbook profile)
  useEffect(() => {
    if (!isConnected || pendingMoltbookLink) return;
    const onboardingComplete =
      localStorage.getItem("mog_onboarding_complete") ||
      localStorage.getItem("eartone_onboarding_complete");
    navigate(onboardingComplete ? "/home" : "/onboarding");
  }, [isConnected, pendingMoltbookLink, navigate]);

  // Route after Moltbook auth (only if no wallet linking is pending)
  useEffect(() => {
    if (isAuthenticated && !pendingMoltbookLink) {
      toast.success("Signed in with Moltbook!");
      navigate("/home");
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
        const { error: upsertError } = await supabase
          .from("moltbook_profiles" as never)
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 safe-top safe-bottom relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-4">
          <Music className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Mog</h1>
        <p className="text-muted-foreground mt-2">Pay per stream • Artists first</p>
      </div>

      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground text-center">Sign in</h2>

        {!isConfigured && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Sign-in is unavailable: <code>VITE_THIRDWEB_CLIENT_ID</code> is not set. Add it in
              project environment settings.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-12 justify-start gap-3 bg-background hover:bg-secondary"
            onClick={() => requireConfig() && connectSocial("google")}
            disabled={isConnecting || !isConfigured}
          >
            <Chrome className="h-5 w-5" />
            <span className="flex-1 text-left">Continue with Google</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 justify-start gap-3 bg-background hover:bg-secondary"
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
                className="w-full h-12 justify-start gap-3 bg-background hover:bg-secondary"
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
                className="w-full h-12 justify-start gap-3 bg-background hover:bg-secondary border-primary/30"
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

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">OR</span>
          <Separator className="flex-1" />
        </div>

        <Button
          onClick={() => requireConfig() && connectExternal("io.metamask")}
          disabled={isConnecting || !isConfigured}
          className="w-full h-12 bg-primary hover:bg-primary/90"
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

        {isConfigured && (
          <div className="flex justify-center pt-1">
            <ConnectButton
              client={thirdwebClient}
              chain={apeChain}
              wallets={wallets}
              theme="dark"
              connectButton={{ label: "View all 500+ wallets →", className: "!bg-transparent !text-primary !shadow-none hover:!underline !p-0 !h-auto" }}
              connectModal={{ size: "compact", showThirdwebBranding: false }}
            />
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-center gap-6 opacity-80">
        <span className="font-mono tracking-tighter text-xs text-muted-foreground">Espresso</span>
        <span className="font-bold text-blue-500 text-xs">ApeChain ⛓️</span>
        <span className="text-xs text-muted-foreground">thirdweb</span>
        <span className="text-xs text-primary font-medium">Moltbook 🤖</span>
      </div>
    </div>
  );
}
