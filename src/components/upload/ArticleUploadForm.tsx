import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/contexts/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Image, Upload, Loader2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TagInput } from "./TagInput";
import { supabase } from "@/integrations/supabase/client";
import { requestWalletProof } from "@/lib/walletProof";
import { MOG_FEED_ROUTE } from "@/lib/routes";

const ARTICLE_CATEGORIES = [
  "Technology",
  "Culture",
  "NFTs",
  "Business",
  "Guides",
  "Interviews",
  "Opinion",
  "News",
];

export function ArticleUploadForm() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [readTime, setReadTime] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState("0.50");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      const reader = new FileReader();
      reader.onload = () => setThumbnailPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast({
        title: "Wallet required",
        description: "Connect your wallet to publish.",
        variant: "destructive",
      });
      return;
    }

    if (!title || !author || !content || !category) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      let thumbnailUrl: string | null = null;
      if (thumbnailFile) {
        const extension = thumbnailFile.name.split(".").pop() || "png";
        const path = `${address.toLowerCase()}/article-thumb-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("mog-media").upload(path, thumbnailFile);
        if (uploadError) throw new Error(uploadError.message || "Failed to upload thumbnail");
        const { data } = supabase.storage.from("mog-media").getPublicUrl(path);
        thumbnailUrl = data.publicUrl;
      }

      const walletProof = await requestWalletProof(address.toLowerCase(), "mog_upload:article:publish");
      const { data, error } = await supabase.functions.invoke("mog-upload", {
        body: {
          content_type: "article",
          media_url: thumbnailUrl,
          title: title.trim(),
          description: excerpt.trim() || null,
          article_body: content.trim(),
          hashtags: [category.trim().toLowerCase(), ...tags],
          creator_wallet: address.toLowerCase(),
          creator_name: author.trim(),
          creator_type: "human",
          wallet_proof: walletProof,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to publish article");
      }

      toast({
        title: "Article published",
        description: "Your article is now live in Mog feed.",
      });
      navigate(MOG_FEED_ROUTE);
    } catch (error) {
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    }

    setIsUploading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Thumbnail */}
      <div className="space-y-2">
        <Label className="text-foreground">Featured Image</Label>
        <label className="block cursor-pointer">
          <div className="aspect-video max-w-full rounded-lg border-2 border-dashed border-border bg-secondary/30 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
            {thumbnailPreview ? (
              <img
                src={thumbnailPreview}
                alt="Thumbnail preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-4">
                <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Tap to add featured image (16:9)
                </p>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleThumbnailChange}
            className="hidden"
          />
        </label>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-foreground">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter article title"
          className="bg-secondary border-border"
          required
        />
      </div>

      {/* Author */}
      <div className="space-y-2">
        <Label htmlFor="author" className="text-foreground">Author *</Label>
        <Input
          id="author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
          className="bg-secondary border-border"
          required
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label className="text-foreground">Category *</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="bg-secondary border-border">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {ARTICLE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat.toLowerCase()}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Excerpt */}
      <div className="space-y-2">
        <Label htmlFor="excerpt" className="text-foreground">Excerpt</Label>
        <Textarea
          id="excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="Brief summary for previews..."
          className="bg-secondary border-border"
          rows={2}
        />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content" className="text-foreground">Content *</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your article..."
          className="bg-secondary border-border min-h-[200px]"
          rows={8}
          required
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label className="text-foreground">Tags</Label>
        <TagInput
          tags={tags}
          onChange={setTags}
          placeholder="Add tags (press Enter)"
        />
      </div>

      {/* Advanced Options */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
          >
            Advanced Options
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Reading Time */}
          <div className="space-y-2">
            <Label htmlFor="readTime" className="text-foreground">Reading Time (minutes)</Label>
            <Input
              id="readTime"
              type="number"
              min="1"
              value={readTime}
              onChange={(e) => setReadTime(e.target.value)}
              placeholder="Auto-calculated if empty"
              className="bg-secondary border-border"
            />
          </div>

          {/* Premium Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
            <div>
              <Label className="text-foreground">Premium Article</Label>
              <p className="text-xs text-muted-foreground">Require payment to read</p>
            </div>
            <Switch checked={isPremium} onCheckedChange={setIsPremium} />
          </div>

          {/* Price */}
          {isPremium && (
            <div className="space-y-2">
              <Label htmlFor="price" className="text-foreground">Price (USD)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isUploading || !title || !author || !content || !category}
        className="w-full h-12"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Publishing...
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 mr-2" />
            Publish Article
          </>
        )}
      </Button>
    </form>
  );
}
