import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, FileText, Image, Loader2, Sparkles, Upload, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/contexts/WalletContext";
import { toast } from "sonner";
import { requestWalletProof } from "@/lib/walletProof";
import { MOG_FEED_ROUTE } from "@/lib/routes";

type ContentType = "video" | "image" | "article";
type CreatorType = "human" | "agent";
type GenerationType = "image" | "video";

const FILE_RULES = {
  image: {
    maxSizeBytes: 25 * 1024 * 1024,
    allowedMime: /^(image\/jpeg|image\/jpg|image\/png|image\/webp|image\/gif)$/i,
    sizeLabel: "25MB",
  },
  video: {
    maxSizeBytes: 150 * 1024 * 1024,
    allowedMime: /^(video\/mp4|video\/quicktime|video\/webm|video\/x-matroska)$/i,
    maxDurationSeconds: 180,
    sizeLabel: "150MB",
  },
} as const;

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((token) => token.replace(/^#/, "").trim().toLowerCase())
    .filter((token) => token.length > 0)
    .slice(0, 20);
}

async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(video.duration || 0);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      reject(new Error("Could not read video duration"));
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

function getHumanFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Please retry.";
}

function CreateEmptyVisual({ alt }: { alt: string }) {
  return (
    <img
      src="/images/mog-empty-state.png"
      alt={alt}
      className="mx-auto h-24 w-24 rounded-lg object-cover opacity-90"
    />
  );
}

export default function MogUpload() {
  const navigate = useNavigate();
  const { address, isConnected, connect } = useWallet();

  useEffect(() => {
    if (!isConnected) {
      toast.error("Please connect your wallet to post");
    }
  }, [isConnected]);

  const [contentType, setContentType] = useState<ContentType>("video");
  const savedCreatorType = localStorage.getItem("mog_creator_type") as CreatorType | null;
  const storedAgent = localStorage.getItem("moltbook_agent");
  const parsedAgent = (() => {
    if (!storedAgent) return null;
    try {
      return JSON.parse(storedAgent) as { name?: string; avatar_url?: string };
    } catch {
      return null;
    }
  })();

  const [creatorType, setCreatorType] = useState<CreatorType>(parsedAgent ? "agent" : (savedCreatorType || "human"));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [generationType, setGenerationType] = useState<GenerationType>("image");
  const [createCreatorType, setCreateCreatorType] = useState<CreatorType>(parsedAgent ? "agent" : "human");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createHashtags, setCreateHashtags] = useState("");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [createUploading, setCreateUploading] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("mog_creator_type", creatorType);
  }, [creatorType]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (sourceImagePreview) URL.revokeObjectURL(sourceImagePreview);
    };
  }, [previewUrl, sourceImagePreview]);

  const resetUploadError = () => setUploadError(null);
  const resetCreateError = () => setCreateError(null);

  const validateUpload = async (mode: "upload" | "create"): Promise<void> => {
    if (!address) {
      throw new Error("Please connect your wallet first");
    }

    if (mode === "upload") {
      if (contentType === "article") {
        if (!articleBody.trim()) {
          throw new Error("Article body is required for article posts");
        }
        return;
      }

      if (!file) {
        throw new Error(`Please select a ${contentType} file to upload`);
      }

      const rule = FILE_RULES[contentType];
      if (!rule.allowedMime.test(file.type)) {
        throw new Error(`Invalid ${contentType} type. Allowed formats: ${contentType === "video" ? "mp4, mov, webm, mkv" : "jpg, png, webp, gif"}`);
      }

      if (file.size > rule.maxSizeBytes) {
        throw new Error(`${contentType === "video" ? "Video" : "Image"} exceeds ${rule.sizeLabel} limit`);
      }

      if (contentType === "video" && 'maxDurationSeconds' in rule) {
        const duration = await getVideoDurationSeconds(file);
        if (duration > rule.maxDurationSeconds) {
          throw new Error(`Video is too long (${Math.ceil(duration)}s). Max allowed is ${rule.maxDurationSeconds}s`);
        }
      }
      return;
    }

    if (!generatedPreview) {
      throw new Error("Please generate content first");
    }
  };

  const uploadToStorage = async (
    uploadFile: Blob | File,
    wallet: string,
    contentKind: "image" | "video",
    extensionHint?: string,
  ): Promise<string> => {
    const extension =
      extensionHint ||
      (uploadFile instanceof File ? uploadFile.name.split(".").pop() : undefined) ||
      "bin";
    const walletAddress = wallet.toLowerCase();
    const mimeType = uploadFile.type || (contentKind === "video" ? "video/mp4" : "image/png");
    const fileName = uploadFile instanceof File ? uploadFile.name : `generated.${extension}`;
    const walletProof = await requestWalletProof(walletAddress, `mog_upload_intent:${contentKind}`);

    const { data: intent, error: intentError } = await supabase.functions.invoke("mog-upload-intent", {
      body: {
        content_type: contentKind,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: uploadFile.size,
        wallet_address: walletAddress,
        wallet_proof: walletProof,
      },
    });

    if (intentError || !intent?.success) {
      throw new Error(intentError?.message || intent?.error || "Upload intent failed");
    }

    const { error: uploadErrorInner } = await supabase.storage
      .from(intent.bucket)
      .uploadToSignedUrl(intent.path, intent.token, uploadFile, {
        contentType: mimeType,
      });
    if (uploadErrorInner) {
      throw new Error(uploadErrorInner.message || "Media upload failed");
    }

    return intent.public_url;
  };

  const publishMog = async (payload: {
    contentType: ContentType | GenerationType;
    mediaUrl: string | null;
    title: string;
    description: string;
    hashtags: string;
    creatorType: CreatorType;
    articleBody?: string;
  }) => {
    if (!address) {
      throw new Error("Please connect your wallet first");
    }

    const walletAddress = address.toLowerCase();
    const walletProof = await requestWalletProof(walletAddress, `mog_upload:${payload.contentType}:publish`);
    const { data, error } = await supabase.functions.invoke("mog-upload", {
      body: {
        content_type: payload.contentType,
        media_url: payload.mediaUrl,
        title: payload.title || null,
        description: payload.description || null,
        hashtags: parseHashtags(payload.hashtags),
        article_body: payload.articleBody || null,
        creator_wallet: walletAddress,
        creator_name: parsedAgent?.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
        creator_avatar: parsedAgent?.avatar_url || null,
        creator_type: parsedAgent ? "agent" : payload.creatorType,
        wallet_proof: walletProof,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to publish post");
    }

    if (!data?.success) {
      throw new Error(data?.error || "Failed to publish post");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetUploadError();
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  };

  const handleSourceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetCreateError();
    const selected = e.target.files?.[0] || null;
    setSourceImage(selected);
    if (sourceImagePreview) URL.revokeObjectURL(sourceImagePreview);
    setSourceImagePreview(selected ? URL.createObjectURL(selected) : null);
    setGeneratedPreview(null);
  };

  const handleSubmit = async () => {
    resetUploadError();
    setUploading(true);
    setUploadProgress(5);

    try {
      await validateUpload("upload");
      setUploadProgress(20);

      let mediaUrl: string | null = null;
      if (contentType !== "article" && file) {
        setUploadProgress(45);
        mediaUrl = await uploadToStorage(file, address!, contentType);
      }

      setUploadProgress(75);
      await publishMog({
        contentType,
        mediaUrl,
        title,
        description,
        hashtags,
        creatorType,
        articleBody: contentType === "article" ? articleBody.trim() : undefined,
      });

      setUploadProgress(100);
      toast.success("Mog created successfully");
      navigate(MOG_FEED_ROUTE);
    } catch (error) {
      const message = getHumanFriendlyError(error);
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    resetCreateError();
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (generationType === "video" && !sourceImage) {
      toast.error("Please upload a source image for video generation");
      return;
    }

    setGenerating(true);

    try {
      const sourceBase64 = sourceImage
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Could not read source image"));
            reader.readAsDataURL(sourceImage);
          })
        : null;

      const walletAddress = address!.toLowerCase();
      const walletProof = await requestWalletProof(walletAddress, `mog_generate:${generationType}`);
      const { data, error } = await supabase.functions.invoke("mog-generate", {
        body: {
          generation_type: generationType,
          prompt: prompt.trim(),
          source_image_data_url: sourceBase64,
          wallet_address: walletAddress,
          wallet_proof: walletProof,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to generate content");
      }

      if (data.status === "queued") {
        throw new Error("FAL generation is still processing. Try again shortly.");
      }

      if (!data.asset_url) {
        throw new Error("No generated asset returned");
      }

      setGeneratedPreview(data.asset_url);
      toast.success(generationType === "video" ? "Video generated with FAL" : "Image generated with FAL");
    } catch (error) {
      const message = getHumanFriendlyError(error);
      setCreateError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateSubmit = async () => {
    resetCreateError();
    setCreateUploading(true);
    setCreateProgress(5);

    try {
      await validateUpload("create");
      setCreateProgress(20);

      const mediaUrl = generatedPreview;
      setCreateProgress(75);

      await publishMog({
        contentType: generationType,
        mediaUrl,
        title: createTitle,
        description: createDescription || prompt,
        hashtags: createHashtags,
        creatorType: createCreatorType,
      });

      setCreateProgress(100);
      toast.success("AI Mog created successfully");
      navigate(MOG_FEED_ROUTE);
    } catch (error) {
      const message = getHumanFriendlyError(error);
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreateUploading(false);
    }
  };

  const handleClose = () => navigate(MOG_FEED_ROUTE);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        onClick={handleClose}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 top-12 z-50 bg-background rounded-t-3xl overflow-hidden shadow-2xl"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <h1 className="text-lg font-semibold">New Mog</h1>
          <button onClick={handleClose} className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isConnected && (
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Connect your wallet to post Mogs.</p>
            <Button size="sm" onClick={connect}>
              Connect
            </Button>
          </div>
        )}

        <Tabs defaultValue="upload" className="h-[calc(100%-5rem)]">
          <div className="px-4 pt-3">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Mog
              </TabsTrigger>
              <TabsTrigger value="create" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Create Mog
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upload" className="h-[calc(100%-3rem)] overflow-y-auto mt-0">
            <div className="p-4 pb-safe-bottom space-y-6">
              {uploadError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{uploadError}</p>
                  </div>
                  <Button size="sm" variant="outline" className="mt-3" onClick={handleSubmit} disabled={uploading || !address}>
                    Retry Upload
                  </Button>
                </div>
              )}

              {uploading && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-base font-medium">Content Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { type: "video" as ContentType, icon: Video, label: "Video" },
                    { type: "image" as ContentType, icon: Image, label: "Image" },
                    { type: "article" as ContentType, icon: FileText, label: "Article" },
                  ].map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => {
                        setContentType(type);
                        resetUploadError();
                      }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                        contentType === type ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
                {contentType === "video" && <p className="text-xs text-muted-foreground">Allowed: mp4/mov/webm/mkv, max 150MB, max 180s</p>}
                {contentType === "image" && <p className="text-xs text-muted-foreground">Allowed: jpg/png/webp/gif, max 25MB</p>}
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Creator Type</Label>
                <RadioGroup value={creatorType} onValueChange={(v) => setCreatorType(v as CreatorType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="human" id="human" />
                    <Label htmlFor="human" className="flex items-center gap-1 cursor-pointer">
                      Human Creator
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="agent" id="agent" />
                    <Label htmlFor="agent" className="flex items-center gap-1 cursor-pointer">
                      AI Agent
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {contentType !== "article" && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Upload {contentType === "video" ? "Video" : "Image"}</Label>
                  <input id="file-input" type="file" accept={contentType === "video" ? "video/*" : "image/*"} onChange={handleFileChange} className="hidden" />
                  <div
                    onClick={() => document.getElementById("file-input")?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {previewUrl ? (
                      <div className="space-y-2">
                        {contentType === "video" ? (
                          <video src={previewUrl} className="w-full max-h-48 object-cover rounded-lg" />
                        ) : (
                          <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-lg" />
                        )}
                        <p className="text-sm text-foreground">{file?.name}</p>
                        <p className="text-xs text-muted-foreground">{((file?.size || 0) / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <CreateEmptyVisual alt={`Empty ${contentType} upload frame`} />
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Tap to select a {contentType}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your mog a title" />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this mog about?" rows={3} />
              </div>

              {contentType === "article" && (
                <div className="space-y-2">
                  <Label>Article Body</Label>
                  <Textarea
                    value={articleBody}
                    onChange={(e) => setArticleBody(e.target.value)}
                    placeholder="Write your article body..."
                    rows={8}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#trending #mog #content" />
              </div>

              <Button onClick={handleSubmit} disabled={uploading || !address} className="w-full py-6 text-lg">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  "Post Mog"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="create" className="h-[calc(100%-3rem)] overflow-y-auto mt-0">
            <div className="p-4 pb-safe-bottom space-y-6">
              {createError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{createError}</p>
                  </div>
                  <Button size="sm" variant="outline" className="mt-3" onClick={handleCreateSubmit} disabled={createUploading || !address}>
                    Retry Publish
                  </Button>
                </div>
              )}

              {createUploading && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Publishing AI Mog...</span>
                    <span>{createProgress}%</span>
                  </div>
                  <Progress value={createProgress} className="h-2" />
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-base font-medium">Generate Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: "image" as GenerationType, icon: Image, label: "Image" },
                    { type: "video" as GenerationType, icon: Video, label: "15s Video" },
                  ].map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => setGenerationType(type)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                        generationType === type ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Creator Type</Label>
                <RadioGroup value={createCreatorType} onValueChange={(v) => setCreateCreatorType(v as CreatorType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="human" id="create-human" />
                    <Label htmlFor="create-human" className="flex items-center gap-1 cursor-pointer">
                      Human Creator
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="agent" id="create-agent" />
                    <Label htmlFor="create-agent" className="flex items-center gap-1 cursor-pointer">
                      AI Agent
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">
                  {generationType === "video" ? "Source Image" : "Source Image (optional)"}
                </Label>
                <input id="source-image-input" type="file" accept="image/*" onChange={handleSourceImageChange} className="hidden" />
                <div
                  onClick={() => document.getElementById("source-image-input")?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {sourceImagePreview ? (
                    <div className="space-y-2">
                      <img src={sourceImagePreview} alt="Source" className="w-full max-h-32 object-cover rounded-lg" />
                      <p className="text-sm text-foreground">{sourceImage?.name}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <CreateEmptyVisual alt="Empty source image frame for FAL generation" />
                      <Image className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {generationType === "video" ? "Upload a source image to animate" : "Upload a source image to guide the result"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-medium">AI Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    generationType === "video"
                      ? "Describe the motion and scene..."
                      : "Describe the image Mog should generate..."
                  }
                  rows={3}
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !address || (generationType === "video" && !sourceImage) || !prompt.trim()}
                variant="outline"
                className="w-full py-5 border-primary text-primary hover:bg-primary/10"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate {generationType === "video" ? "Video" : "Image"}
                  </>
                )}
              </Button>

              {generatedPreview && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Generated Result</Label>
                  <div className="border-2 border-primary/50 rounded-xl p-3 bg-primary/5">
                    {generationType === "video" ? (
                      <video src={generatedPreview} controls className="w-full rounded-lg" />
                    ) : (
                      <img src={generatedPreview} alt="Generated" className="w-full rounded-lg" />
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Give your AI mog a title" />
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Uses AI prompt if left empty"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input value={createHashtags} onChange={(e) => setCreateHashtags(e.target.value)} placeholder="#ai #generated #mog" />
              </div>

              <Button onClick={handleCreateSubmit} disabled={createUploading || !address || !generatedPreview} className="w-full py-6 text-lg">
                {createUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  "Post AI Mog"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
